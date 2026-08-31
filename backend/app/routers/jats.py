"""JATS 1.3 article export.

Publishers, indexers and preservation partners expect a JATS-shaped XML view
of every published article. This endpoint assembles a minimal-but-valid
JATS 1.3 document from the columns we already store — title, abstract,
authors (via the article's ``author`` relationship) and the reference list
from ``article_references``.

The output is intentionally minimal — it carries the front-matter every
downstream consumer needs and a populated ref-list. It is not a full-body
representation of the manuscript; body XML is produced by production tooling
downstream. Every string is escaped through ``xml.sax.saxutils.escape`` so a
title containing angle brackets or ampersands cannot break the document.

The pure XML assembly lives in :func:`build_jats_xml` so other endpoints
(e.g. the reader-facing HTML view in ``routers/article_render.py``) can
render the same shape without duplicating tag decisions.
"""

from typing import Iterable, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference

router = APIRouter()

__all__ = ["router", "build_jats_xml"]


def _xml_escape(text: Optional[str]) -> str:
    return escape(text or "")


def _author_names(article: Article) -> list[tuple[str, str]]:
    """Best-effort surname/given-name split from the linked User row.

    Falls back to (full_name, "") when we do not have a first / last
    split, and finally to (username, "") if that is the only identifier
    the author record carries.
    """
    author = getattr(article, "author", None)
    if author is None:
        return []
    surname = (getattr(author, "last_name", None) or "").strip()
    given = (getattr(author, "first_name", None) or "").strip()
    if not surname and not given:
        display = (getattr(author, "full_name", None) or "").strip()
        if display:
            parts = display.rsplit(" ", 1)
            if len(parts) == 2:
                given, surname = parts[0], parts[1]
            else:
                surname = display
        else:
            surname = (getattr(author, "username", None) or "").strip()
    return [(surname, given)]


def _build_contrib_group(article: Article) -> str:
    contribs: list[str] = []
    for surname, given in _author_names(article):
        contribs.append(
            "<contrib contrib-type=\"author\">"
            "<name>"
            f"<surname>{_xml_escape(surname)}</surname>"
            f"<given-names>{_xml_escape(given)}</given-names>"
            "</name>"
            "</contrib>"
        )
    if not contribs:
        return ""
    return "<contrib-group>" + "".join(contribs) + "</contrib-group>"


def _build_abstract(article: Article) -> str:
    if not article.abstract:
        return ""
    return f"<abstract><p>{_xml_escape(article.abstract)}</p></abstract>"


def _build_ref_list(refs: Iterable[ArticleReference]) -> str:
    items: list[str] = []
    for r in refs:
        pieces = [
            f"<mixed-citation>{_xml_escape(r.text)}"
        ]
        if r.doi:
            pieces.append(
                f"<pub-id pub-id-type=\"doi\">{_xml_escape(r.doi)}</pub-id>"
            )
        if r.url:
            pieces.append(
                "<ext-link ext-link-type=\"uri\" xlink:href=\""
                f"{_xml_escape(r.url)}\">{_xml_escape(r.url)}</ext-link>"
            )
        pieces.append("</mixed-citation>")
        items.append(
            f"<ref id=\"ref-{r.sequence or r.id}\">" + "".join(pieces) + "</ref>"
        )
    if not items:
        return "<ref-list/>"
    return "<ref-list>" + "".join(items) + "</ref-list>"


def build_jats_xml(
    article: Article,
    references: Iterable[ArticleReference],
    journal=None,
) -> str:
    """Assemble a minimal-but-valid JATS 1.3 document string.

    Kept as a pure function so both the machine-facing XML endpoint and
    the reader-facing HTML endpoint render from the same tag decisions.
    ``journal`` is currently unused — the journal identifier is taken
    from ``article.journal_id`` — but the parameter is accepted so
    callers that have the eager-loaded row can pass it in and future
    additions (ISSN, publisher name) can be filled without changing
    every call site.
    """
    _ = journal  # reserved for richer journal-meta once callers pass it in

    title_xml = (
        f"<title-group><article-title>{_xml_escape(article.title)}"
        "</article-title></title-group>"
    )
    contrib_group = _build_contrib_group(article)
    abstract_xml = _build_abstract(article)
    ref_list_xml = _build_ref_list(references)

    front = (
        "<front>"
        "<journal-meta>"
        f"<journal-id journal-id-type=\"publisher\">journal-{article.journal_id or 0}</journal-id>"
        "</journal-meta>"
        "<article-meta>"
        f"<article-id pub-id-type=\"publisher-id\">{article.id}</article-id>"
        f"{title_xml}"
        f"{contrib_group}"
        f"{abstract_xml}"
        "</article-meta>"
        "</front>"
    )
    back = f"<back>{ref_list_xml}</back>"

    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<article xmlns:xlink=\"http://www.w3.org/1999/xlink\" "
        "dtd-version=\"1.3\" article-type=\"research-article\">"
        f"{front}{back}"
        "</article>"
    )


@router.get(
    "/{article_id}/jats.xml",
    response_class=Response,
    responses={200: {"content": {"application/xml": {}}}},
)
def article_jats_xml(article_id: int, db: Session = Depends(get_db)) -> Response:
    """Return a minimal JATS 1.3 XML view of the article."""
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

    xml = build_jats_xml(article, refs, journal=getattr(article, "journal", None))
    return Response(content=xml, media_type="application/xml")
