"""Server-side full-text article search.

Backed by the ``articles.search_vector`` column added in migration
``j6f0a8b9c4e3`` (a Postgres ``tsvector`` GENERATED from the article's
title, abstract, and content, with a GIN index). This module exposes
one route:

    GET /search/articles?q=…&kind=any|title|author|keyword|doi
                        &year=…&category=…
                        &page=1&page_size=20

- ``q`` is parsed through ``websearch_to_tsquery('english', :q)`` so a
  human-friendly query with quoted phrases, ``-negation``, and ``OR``
  syntax works out of the box.
- Matches are ranked with a title-weighted composite of two
  ``ts_rank_cd`` scores so title hits float above abstract/content
  hits (the on-column ``search_vector`` is generated so we can't
  ``setweight`` it in-place without a follow-up migration; instead we
  compute a boost at query time).
- ``kind`` narrows the match: e.g. ``author`` still runs the tsquery
  match but additionally requires the joined ``users`` row to ILIKE
  the raw query; ``title`` restricts to a title ILIKE; ``doi`` treats
  the query as a substring against title/abstract/content (there is
  no dedicated DOI column yet — matches the legacy client filter).
  ``any`` and ``keyword`` apply no extra narrowing (the tsquery
  already covers those fields).
- ``year`` (optional) filters to articles whose owning issue's
  ``volumes.year`` matches (via ``issue_articles → issues → volumes``).
  A best-effort filter — an article that is not yet placed in any
  issue simply won't match, so callers should treat ``year`` as an
  additive narrower rather than a required key.
- ``category`` (optional, ILIKE %substring%) filters to articles
  whose corresponding submission row has a matching
  ``classified_field``. Article doesn't carry that field directly,
  so we soft-join ``submissions`` on ``paper_title`` — best-effort;
  matches are naturally case-insensitive and may miss when titles
  drift between submission and publication.

The response envelope carries per-item ``rank`` and an HTML-fragment
``highlighted`` string (Postgres ``ts_headline`` with ``<mark>``
delimiters) so the frontend can render a highlighted snippet.
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
    year: Optional[int] = Query(
        None,
        ge=1900,
        le=2100,
        description=(
            "Optional publication year filter. Applied via "
            "issue_articles → issues → volumes.year; articles not yet "
            "assigned to an issue will not match."
        ),
    ),
    category: Optional[str] = Query(
        None,
        max_length=255,
        description=(
            "Optional classified_field substring (ILIKE %category%). "
            "Soft-joined to submissions on paper_title — best effort."
        ),
    ),
    page: int = Query(1, ge=1, description="1-indexed page number."),
    page_size: int = Query(20, ge=1, le=100, description="Rows per page."),
    db: Session = Depends(get_db),
) -> dict:
    """Full-text search over articles.

    Returns ``{items, total, page, page_size}``. Each item carries
    ``id``, ``title``, ``abstract_excerpt`` (<=200 chars),
    ``author_display``, ``rank`` (title-weighted composite score), and
    ``highlighted`` (Postgres ``ts_headline`` HTML with ``<mark>``
    tags around the matched terms — the frontend sanitises defensively
    before rendering).

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

    params: dict[str, Any] = {
        "q": trimmed,
        "like": f"%{trimmed}%",
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    # Optional additive filters. Each contributes a JOIN clause + a
    # WHERE fragment only when its value is populated so the base
    # query stays as fast as before.
    year_join = ""
    year_where = ""
    if year is not None:
        year_join = (
            " JOIN issue_articles ia_yr ON ia_yr.article_id = a.id"
            " JOIN issues iss_yr       ON iss_yr.id = ia_yr.issue_id"
            " JOIN volumes vol_yr      ON vol_yr.id = iss_yr.volume_id"
        )
        year_where = " AND vol_yr.year = :year"
        params["year"] = int(year)

    cat_join = ""
    cat_where = ""
    if category:
        # Article doesn't carry classified_field directly. We soft-join
        # submissions on paper_title (case-insensitive). If title
        # drift between submission and publication is common in your
        # deployment, this filter will under-match — consider a
        # follow-up migration adding a proper article_id → submission
        # foreign key.
        cat_join = (
            " JOIN submissions sub_cat"
            " ON lower(sub_cat.paper_title) = lower(a.title)"
        )
        cat_where = " AND sub_cat.classified_field ILIKE :category"
        params["category"] = f"%{category}%"

    # Composite ranking: a boosted title-only rank (weight 'A', scaled
    # 2x) plus the base search_vector rank. Because ``search_vector``
    # is a GENERATED column we can't ``setweight`` in it directly
    # without a migration; the query-time composite gets us the same
    # ordering effect. See module docstring.
    rank_expr = (
        "("
        " ts_rank_cd("
        "  setweight(to_tsvector('english', coalesce(a.title, '')), 'A'),"
        "  websearch_to_tsquery('english', :q),"
        "  32"
        " ) * 2"
        " + ts_rank_cd(a.search_vector, websearch_to_tsquery('english', :q))"
        ")"
    )

    # ``ts_headline`` returns an HTML fragment with the configured
    # StartSel/StopSel tags around each matched lexeme. Prefer the
    # abstract as the excerpt source; fall back to the title so a
    # title-only match still gets a highlighted snippet.
    headline_expr = (
        "ts_headline("
        "'english',"
        "coalesce(a.abstract, a.title, ''),"
        "websearch_to_tsquery('english', :q),"
        "'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=25'"
        ") AS highlighted"
    )

    count_sql = text(
        f"""
        SELECT count(DISTINCT a.id)
        FROM articles a
        LEFT JOIN users u ON u.id = a.author_id
        {year_join}
        {cat_join}
        WHERE a.search_vector @@ websearch_to_tsquery('english', :q)
        {extra_where}
        {year_where}
        {cat_where}
        """
    )
    total = int(db.execute(count_sql, params).scalar() or 0)

    rows_sql = text(
        f"""
        SELECT DISTINCT
            a.id                AS id,
            a.title             AS title,
            a.abstract          AS abstract,
            u.full_name         AS author_full_name,
            u.username          AS author_username,
            {rank_expr}         AS rank,
            {headline_expr}
        FROM articles a
        LEFT JOIN users u ON u.id = a.author_id
        {year_join}
        {cat_join}
        WHERE a.search_vector @@ websearch_to_tsquery('english', :q)
        {extra_where}
        {year_where}
        {cat_where}
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
            "highlighted": r["highlighted"] or "",
        }
        for r in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
