"""Server-side full-text article search.

Backed by the ``articles.search_vector`` column added in migration
``j6f0a8b9c4e3`` (a Postgres ``tsvector`` GENERATED from the article's
title, abstract, and content, with a GIN index). This module exposes
one route:

    GET /search/articles?q=…&kind=any|title|author|keyword|doi
                        &page=1&page_size=20

- ``q`` is parsed through ``websearch_to_tsquery('english', :q)`` so a
  human-friendly query with quoted phrases, ``-negation``, and ``OR``
  syntax works out of the box.
- Matches are ranked with ``ts_rank_cd`` on ``search_vector`` and
  returned newest-strongest first.
- ``kind`` narrows the match: e.g. ``author`` still runs the tsquery
  match but additionally requires the joined ``users`` row to ILIKE
  the raw query; ``title`` restricts to a title ILIKE; ``doi`` treats
  the query as a substring against title/abstract/content (there is
  no dedicated DOI column yet — matches the legacy client filter).
  ``any`` and ``keyword`` apply no extra narrowing (the tsquery
  already covers those fields).

The response envelope is a small DTO with a ``rank`` float so the
frontend can render it as a subtle badge on each result card.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db


router = APIRouter()


# Allowed ``kind`` values. Anything else is rejected by FastAPI's
# ``Query(..., pattern=...)`` validation.
_KINDS = ("any", "title", "author", "keyword", "doi")


def _excerpt(abstract: Optional[str], max_chars: int = 200) -> str:
    """Compact whitespace-collapsed excerpt for the result card."""
    if not abstract:
        return ""
    clean = " ".join(abstract.split())
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars].rstrip() + "…"


def _author_display(row: Any) -> Optional[str]:
    """Pick the best human-readable byline from the joined user row.

    Accepts a SQLAlchemy ``RowMapping`` (dict-like). Falls back through
    ``full_name`` → ``username``; returns ``None`` when the article has
    no linked user.
    """
    full = row.get("author_full_name") if hasattr(row, "get") else None
    if full:
        return full
    return row.get("author_username") if hasattr(row, "get") else None


@router.get("/articles")
def search_articles(
    q: str = Query("", description="Search query. Empty returns no rows."),
    kind: str = Query(
        "any",
        pattern=f"^({'|'.join(_KINDS)})$",
        description="Narrows the match to a specific field.",
    ),
    page: int = Query(1, ge=1, description="1-indexed page number."),
    page_size: int = Query(20, ge=1, le=100, description="Rows per page."),
    db: Session = Depends(get_db),
) -> dict:
    """Full-text search over articles.

    Returns ``{items, total, page, page_size}``. Each item carries
    ``id``, ``title``, ``abstract_excerpt`` (<=200 chars),
    ``author_display``, and the raw ``rank`` from ``ts_rank_cd``.

    An empty ``q`` short-circuits to an empty result set — the search
    page shows the "start typing" hint in that case, no query needed.
    """
    trimmed = (q or "").strip()
    if not trimmed:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    # Field-specific extra WHERE clauses. The tsquery ``@@`` match is
    # always applied; these ILIKEs narrow the recall further when the
    # user asks for a specific field.
    #
    # SECURITY: the raw ``q`` is bound as a parameter (``:like``). It
    # is never string-interpolated into the SQL.
    extra_where = ""
    if kind == "title":
        extra_where = " AND a.title ILIKE :like"
    elif kind == "author":
        extra_where = (
            " AND ("
            "u.full_name ILIKE :like OR "
            "u.username ILIKE :like OR "
            "u.email ILIKE :like"
            ")"
        )
    elif kind == "doi":
        # No DOI column yet — match the raw text anywhere on the row.
        extra_where = (
            " AND ("
            "a.title ILIKE :like OR "
            "coalesce(a.abstract, '') ILIKE :like OR "
            "coalesce(a.content, '') ILIKE :like"
            ")"
        )
    # ``any`` and ``keyword`` need no extra filter — the tsquery on
    # ``search_vector`` already covers title + abstract + content.

    params = {
        "q": trimmed,
        "like": f"%{trimmed}%",
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    count_sql = text(
        f"""
        SELECT count(*)
        FROM articles a
        LEFT JOIN users u ON u.id = a.author_id
        WHERE a.search_vector @@ websearch_to_tsquery('english', :q)
        {extra_where}
        """
    )
    total = int(db.execute(count_sql, params).scalar() or 0)

    rows_sql = text(
        f"""
        SELECT
            a.id                AS id,
            a.title             AS title,
            a.abstract          AS abstract,
            u.full_name         AS author_full_name,
            u.username          AS author_username,
            ts_rank_cd(
                a.search_vector,
                websearch_to_tsquery('english', :q)
            )                   AS rank
        FROM articles a
        LEFT JOIN users u ON u.id = a.author_id
        WHERE a.search_vector @@ websearch_to_tsquery('english', :q)
        {extra_where}
        ORDER BY rank DESC, a.id DESC
        LIMIT :limit OFFSET :offset
        """
    )
    rows = db.execute(rows_sql, params).mappings().all()

    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "abstract_excerpt": _excerpt(r["abstract"]),
            "author_display": _author_display(r),
            "rank": float(r["rank"] or 0.0),
        }
        for r in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
