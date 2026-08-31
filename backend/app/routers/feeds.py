"""Public syndication feeds — RSS 2.0 and Atom 1.0.

These endpoints publish the 25 most recently published articles so
aggregators (Feedly, NewsBlur, institutional discovery services) can
pick up new issues without polling the sitemap. Articles are ordered by
``IssueArticle.created_at`` — the moment an article was pinned into a
published issue — because the ``Article`` model itself has no
``created_at`` column.

Both endpoints are unauthenticated and safe to cache at the CDN edge.
"""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import format_datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.article import Article
from app.models.journal import Journal
from app.models.volume import IssueArticle


router = APIRouter()

_FEED_LIMIT = 25
_ABSTRACT_CHARS = 500


def _frontend_base() -> str:
    return (settings.FRONTEND_URL or "").rstrip("/") or "https://example.com"


def _journal_title(db: Session) -> str:
    journal = (
        db.query(Journal).filter(Journal.is_active == True).first()  # noqa: E712
        or db.query(Journal).first()
    )
    return (journal.title if journal else "Journal") or "Journal"


def _abstract_slice(text: str | None) -> str:
    if not text:
        return ""
    s = text.strip()
    if len(s) <= _ABSTRACT_CHARS:
        return s
    return s[:_ABSTRACT_CHARS].rsplit(" ", 1)[0] + "…"


def _recent_links(db: Session) -> list[IssueArticle]:
    """Latest 25 IssueArticle rows, newest first, with Article eager-loaded."""
    return (
        db.query(IssueArticle)
        .options(joinedload(IssueArticle.article))
        .order_by(IssueArticle.created_at.desc())
        .limit(_FEED_LIMIT)
        .all()
    )


def _as_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ── /rss.xml ─────────────────────────────────────────────

@router.get("/rss.xml")
def rss_feed(db: Session = Depends(get_db)) -> Response:
    base = _frontend_base()
    title = _journal_title(db)
    now_rfc822 = format_datetime(datetime.now(timezone.utc))

    items: list[str] = []
    for link in _recent_links(db):
        article = link.article
        if article is None:
            continue
        url = f"{base}/articles/{article.id}"
        pub_dt = _as_utc(link.created_at)
        items.append(
            "<item>"
            f"<title>{escape(article.title or 'Untitled')}</title>"
            f"<link>{escape(url)}</link>"
            f"<description>{escape(_abstract_slice(article.abstract))}</description>"
            f"<guid isPermaLink=\"true\">{escape(url)}</guid>"
            f"<pubDate>{format_datetime(pub_dt)}</pubDate>"
            "</item>"
        )

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">'
        "<channel>"
        f"<title>{escape(title)}</title>"
        f"<link>{escape(base)}</link>"
        f"<description>{escape(title)} — recent articles</description>"
        "<language>en</language>"
        f"<lastBuildDate>{now_rfc822}</lastBuildDate>"
        + "".join(items)
        + "</channel></rss>"
    )
    return Response(content=body, media_type="application/rss+xml")


# ── /atom.xml ────────────────────────────────────────────

@router.get("/atom.xml")
def atom_feed(db: Session = Depends(get_db)) -> Response:
    base = _frontend_base()
    title = _journal_title(db)
    updated_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    entries: list[str] = []
    for link in _recent_links(db):
        article = link.article
        if article is None:
            continue
        url = f"{base}/articles/{article.id}"
        pub_dt = _as_utc(link.created_at)
        entries.append(
            "<entry>"
            f"<title>{escape(article.title or 'Untitled')}</title>"
            f"<link href=\"{escape(url)}\" rel=\"alternate\"/>"
            f"<id>{escape(url)}</id>"
            f"<updated>{pub_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}</updated>"
            f"<published>{pub_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}</published>"
            f"<summary>{escape(_abstract_slice(article.abstract))}</summary>"
            "</entry>"
        )

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<feed xmlns="http://www.w3.org/2005/Atom">'
        f"<title>{escape(title)}</title>"
        f"<link href=\"{escape(base)}\" rel=\"alternate\"/>"
        f"<link href=\"{escape(base)}/atom.xml\" rel=\"self\"/>"
        f"<id>{escape(base)}/</id>"
        f"<updated>{updated_iso}</updated>"
        + "".join(entries)
        + "</feed>"
    )
    return Response(content=body, media_type="application/atom+xml")
