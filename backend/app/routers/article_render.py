"""Reader-facing HTML view of a published article.

Companion to ``routers/jats.py``: that endpoint hands machine consumers a
JATS 1.3 XML document; this one hands humans a styled HTML page. Both
draw from the same columns (title, abstract, contributors, references) so
whatever a downstream tool ingests is what a reader sees.

The pipeline is deliberately linear:

1.  Load the article and its references from the database.
2.  Assemble a minimal JATS 1.3 fragment inline, using the same shape as
    ``routers/jats.py`` so the two views cannot drift.
3.  Feed that XML through ``services.jats_renderer.render_jats_to_html``,
    which returns a safe HTML5 fragment.
4.  Wrap it in a full HTML page shell — ``<!doctype html>``, viewport,
    canonical link, dark-mode-aware CSS — and return with an explicit
    ``text/html; charset=utf-8`` media type.

Everything user-supplied is escaped through ``xml.sax.saxutils.escape``
when it enters the JATS fragment, and again through ``html.escape`` when
the renderer converts that fragment to HTML. No inline JavaScript is
emitted, so a hostile title cannot smuggle a script into the reader page.
"""

from __future__ import annotations

import html
from typing import Iterable, Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference
from app.services.jats_renderer import render_jats_to_html

router = APIRouter()


# ── Minimal JATS assembly ────────────────────────────────────────────
# Intentionally not imported from ``routers/jats.py`` so this endpoint
# stays live if that module is ever refactored. The shape mirrors what
# ``jats.py`` emits — same tag names, same attribute set — because the
# renderer keys off those tags.


def _xml(text: Optional[str]) -> str:
    return xml_escape(text or "")


def _author_display_parts(article: Article) -> tuple[str, str]:
    """Best-effort (given, surname) split for the article's author row.

    Mirrors ``routers.jats._author_names`` so the two front-matter views
    show identical bylines.
    """
    author = getattr(article, "author", None)
    if author is None:
        return "", ""
    surname = (getattr(author, "last_name", None) or "").strip()
    given = (getattr(author, "first_name", None) or "").strip()
    if surname or given:
        return given, surname
    display = (getattr(author, "full_name", None) or "").strip()
    if display:
        head, _, tail = display.rpartition(" ")
        if head:
            return head, tail
        return "", display
    return "", (getattr(author, "username", None) or "").strip()


def _build_jats(article: Article, refs: Iterable[ArticleReference]) -> str:
    given, surname = _author_display_parts(article)
    contrib = ""
    if surname or given:
        contrib = (
            "<contrib-group>"
            '<contrib contrib-type="author">'
            "<name>"
            f"<surname>{_xml(surname)}</surname>"
            f"<given-names>{_xml(given)}</given-names>"
            "</name>"
            "</contrib>"
            "</contrib-group>"
        )

    abstract_xml = ""
    if article.abstract:
        abstract_xml = f"<abstract><p>{_xml(article.abstract)}</p></abstract>"

    ref_items: list[str] = []
    for r in refs:
        ref_items.append(
            f'<ref id="ref-{r.sequence or r.id}">'
            f"<mixed-citation>{_xml(r.text)}</mixed-citation>"
            "</ref>"
        )
    ref_list = "<ref-list>" + "".join(ref_items) + "</ref-list>" if ref_items else "<ref-list/>"

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<article dtd-version="1.3" article-type="research-article">'
        "<front><article-meta>"
        f"<title-group><article-title>{_xml(article.title)}</article-title></title-group>"
        f"{contrib}"
        f"{abstract_xml}"
        "</article-meta></front>"
        f"<back>{ref_list}</back>"
        "</article>"
    )


# ── Page shell ───────────────────────────────────────────────────────

# Kept inline (rather than served from ``static/``) so the reader page is
# fully self-contained: one GET returns a complete, cacheable HTML file
# with no follow-up asset fetches. Dark-mode is opt-in via prefers-
# color-scheme; nothing here reads localStorage or JS state.
_PAGE_CSS = (
    "html{color-scheme:light dark;}"
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
    "Oxygen,Ubuntu,Cantarell,sans-serif;"
    "max-width:720px;margin:2rem auto;padding:0 1rem;"
    "line-height:1.6;color:#111;background:#fff;}"
    "h1{font-size:1.75rem;line-height:1.25;margin:0 0 .5rem;}"
    "h2{font-size:1.15rem;margin:1.75rem 0 .5rem;}"
    ".byline{color:#555;margin:0 0 1.5rem;font-style:italic;}"
    "section{margin-top:1.5rem;}"
    ".references{list-style:decimal;padding-left:1.4em;}"
    ".references li{margin:.35em 0;}"
    "@media (prefers-color-scheme: dark){"
    "body{background:#111;color:#eee;}"
    ".byline{color:#aaa;}"
    "a{color:#8ab4ff;}"
    "}"
)


def _page(title: str, body_fragment: str, canonical_href: str) -> str:
    """Wrap the rendered fragment in a full HTML page.

    ``body_fragment`` is expected to already be HTML-safe (it comes from
    ``render_jats_to_html`` which escapes everything). Only the title —
    which we also use in ``<title>`` and the canonical link — is escaped
    here.
    """
    safe_title = html.escape(title or "Article")
    safe_canonical = html.escape(canonical_href, quote=True)
    return (
        "<!doctype html>"
        '<html lang="en">'
        "<head>"
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>Article — {safe_title}</title>"
        f'<link rel="canonical" href="{safe_canonical}">'
        f"<style>{_PAGE_CSS}</style>"
        "</head>"
        "<body>"
        f"{body_fragment}"
        "</body>"
        "</html>"
    )


# ── Route ────────────────────────────────────────────────────────────


@router.get(
    "/{article_id}/html",
    response_class=Response,
    responses={200: {"content": {"text/html": {}}}},
)
def article_html(article_id: int, db: Session = Depends(get_db)) -> Response:
    """Return the article as a standalone, styled HTML page."""
    article = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    refs = (
        db.query(ArticleReference)
        .filter(ArticleReference.article_id == article_id)
        .order_by(ArticleReference.sequence.asc(), ArticleReference.id.asc())
        .all()
    )

    jats_xml = _build_jats(article, refs)
    fragment = render_jats_to_html(jats_xml)

    canonical = f"{settings.FRONTEND_URL.rstrip('/')}/articles/{article.id}"
    page = _page(article.title or "", fragment, canonical)

    return Response(content=page, media_type="text/html; charset=utf-8")
