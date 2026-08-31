"""Public per-article stats: views, downloads, citation clicks.

Three endpoints, all unauthenticated:

* ``POST /article-stats/{article_id}/track`` — record one event, with
  a 30-minute server-side dedup keyed on ``(article_id, event_type,
  ip_hash)``. The frontend may fire on every mount; the backend
  decides whether the row is kept.
* ``GET  /article-stats/{article_id}`` — return the current totals
  (views, downloads, citation clicks, last-viewed timestamp).
* ``GET  /article-stats/{article_id}/timeline`` — return per-day
  view/download counts over a configurable window (default 30 days).

Privacy
-------
No raw IP address is ever stored. We hash
``f"{ip}:{article_id}:{settings.SECRET_KEY}"`` with SHA-256 and keep
only the hex digest. Per-article salting stops one hash from being
correlatable across articles; the ``SECRET_KEY`` component means a
dumped database cannot be brute-forced back into IPs without also
leaking the deploy secret.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.article import Article
from app.models.article_event import ArticleEvent

router = APIRouter()


# ── Constants ────────────────────────────────────────────────

# Types the router accepts. Anything else 400s so we never end up with
# free-form event-type strings in the table.
_ALLOWED_EVENT_TYPES: tuple[str, ...] = ("view", "download", "citation_click")

# Dedup window — a repeat event from the same (article, type, ip_hash)
# tuple inside this many minutes is treated as the same interaction and
# NOT recorded. 30 min is long enough to swallow React StrictMode
# double-mounts and CDN re-renders while still counting a genuine
# second visit an hour later.
_DEDUP_MINUTES: int = 30

# Timeline window default and hard cap. A year of daily buckets is the
# most a public endpoint has any business handing out in one call.
_DEFAULT_WINDOW_DAYS: int = 30
_MAX_WINDOW_DAYS: int = 365


# ── Schemas ──────────────────────────────────────────────────

class TrackPayload(BaseModel):
    event_type: Literal["view", "download", "citation_click"]
    # Frontend may pass a document.referrer. We truncate below the
    # 500-char column limit so a huge referring URL cannot poison the
    # write.
    referrer: Optional[str] = Field(default=None, max_length=500)


class TrackResponse(BaseModel):
    recorded: bool


class StatsResponse(BaseModel):
    views: int
    downloads: int
    citation_clicks: int
    last_viewed_at: Optional[str] = None


class TimelineBucket(BaseModel):
    date: str  # YYYY-MM-DD
    views: int
    downloads: int


class TimelineResponse(BaseModel):
    buckets: list[TimelineBucket]


# ── Helpers ──────────────────────────────────────────────────

def _client_ip(request: Request) -> Optional[str]:
    """Best-effort client IP.

    Honours ``X-Forwarded-For`` when present because the API sits
    behind a proxy in production; falls back to the direct socket
    address. Returns ``None`` if neither is available — the hash is
    still computed for consistency, but the dedup will be looser
    (matched only against other Nones).
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        # The header is a comma-separated chain — the original client
        # is the leftmost entry.
        first = fwd.split(",", 1)[0].strip()
        if first:
            return first
    if request.client is not None:
        return request.client.host
    return None


def _hash_ip(ip: Optional[str], article_id: int) -> Optional[str]:
    """SHA-256 hex of ``ip:article_id:SECRET_KEY``.

    Salting with the article id means the same visitor produces
    unrelated hashes across articles, so an attacker who compromised
    one hash cannot cross-reference visits.
    """
    if not ip:
        return None
    material = f"{ip}:{article_id}:{settings.SECRET_KEY}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _truncate(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    return v[:limit]


def _ensure_article_exists(db: Session, article_id: int) -> None:
    """404 when the article isn't known to the platform.

    We check ``Article.id`` alone — the endpoint is public and doesn't
    care about publication state; a draft article that gets a link
    shared still deserves a proper 404 rather than silently accepting
    events against a non-existent id.
    """
    exists = db.query(Article.id).filter(Article.id == article_id).first()
    if exists is None:
        raise HTTPException(status_code=404, detail="Article not found")


# ── POST /article-stats/{article_id}/track ───────────────────

@router.post("/{article_id}/track", response_model=TrackResponse)
def track_event(
    article_id: int,
    payload: TrackPayload,
    request: Request,
    db: Session = Depends(get_db),
) -> TrackResponse:
    """Record one event, deduping repeats inside the 30-min window."""
    _ensure_article_exists(db, article_id)

    event_type = payload.event_type
    # Pydantic's ``Literal`` already enforces the vocabulary, but we
    # belt-and-braces guard so a future ``TrackPayload`` change can't
    # silently widen the accepted set.
    if event_type not in _ALLOWED_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown event_type")

    ip = _client_ip(request)
    ip_hash = _hash_ip(ip, article_id)
    user_agent = _truncate(request.headers.get("user-agent"), 300)
    # Prefer the explicit payload value (frontend-provided), falling
    # back to the request's Referer header when the client didn't send
    # one. The trailing query string is stripped so we don't store
    # tracking params or session tokens.
    referrer_raw = payload.referrer or request.headers.get("referer")
    if referrer_raw:
        referrer_raw = referrer_raw.split("?", 1)[0]
    referrer = _truncate(referrer_raw, 500)

    # ── Dedup check ──
    # We match on ip_hash exactly — including the ``NULL`` case, which
    # SQL's ``IS`` semantics handle via ``ip_hash.is_(None)``. Without
    # this, an anonymous request (no client IP) would always be
    # considered a fresh visitor and count on every mount.
    cutoff = datetime.utcnow() - timedelta(minutes=_DEDUP_MINUTES)
    dedup_q = db.query(ArticleEvent.id).filter(
        ArticleEvent.article_id == article_id,
        ArticleEvent.event_type == event_type,
        ArticleEvent.created_at >= cutoff,
    )
    if ip_hash is None:
        dedup_q = dedup_q.filter(ArticleEvent.ip_hash.is_(None))
    else:
        dedup_q = dedup_q.filter(ArticleEvent.ip_hash == ip_hash)

    if dedup_q.first() is not None:
        return TrackResponse(recorded=False)

    try:
        db.add(
            ArticleEvent(
                article_id=article_id,
                event_type=event_type,
                ip_hash=ip_hash,
                user_agent=user_agent,
                referrer=referrer,
            )
        )
        db.commit()
    except Exception:
        # A stats write must never break the reader's experience. On
        # any DB error we roll back and answer "not recorded" rather
        # than 500.
        db.rollback()
        return TrackResponse(recorded=False)

    return TrackResponse(recorded=True)


# ── GET /article-stats/{article_id} ──────────────────────────

@router.get("/{article_id}", response_model=StatsResponse)
def get_stats(article_id: int, db: Session = Depends(get_db)) -> StatsResponse:
    """Return the article's aggregate counts and last-viewed timestamp."""
    _ensure_article_exists(db, article_id)

    # One grouped query rather than three separate ``count()`` calls —
    # a single index scan on ``(article_id, event_type)`` covers the
    # whole aggregate.
    rows = (
        db.query(ArticleEvent.event_type, func.count(ArticleEvent.id))
        .filter(ArticleEvent.article_id == article_id)
        .group_by(ArticleEvent.event_type)
        .all()
    )
    counts = {t: 0 for t in _ALLOWED_EVENT_TYPES}
    for event_type, count in rows:
        if event_type in counts:
            counts[event_type] = int(count or 0)

    last_view = (
        db.query(func.max(ArticleEvent.created_at))
        .filter(
            ArticleEvent.article_id == article_id,
            ArticleEvent.event_type == "view",
        )
        .scalar()
    )
    last_viewed_at = last_view.isoformat() if last_view else None

    return StatsResponse(
        views=counts["view"],
        downloads=counts["download"],
        citation_clicks=counts["citation_click"],
        last_viewed_at=last_viewed_at,
    )


# ── GET /article-stats/{article_id}/timeline ────────────────

def _parse_window(window: str) -> int:
    """Turn ``30d`` / ``12`` / ``365d`` into a day count.

    We accept a plain integer as well as the ``Nd`` suffixed form so the
    endpoint is easy to hit from a script. Anything invalid falls back
    to the default rather than 400-ing — this endpoint should degrade
    gracefully for a public reader.
    """
    if not window:
        return _DEFAULT_WINDOW_DAYS
    s = window.strip().lower()
    if s.endswith("d"):
        s = s[:-1]
    try:
        n = int(s)
    except ValueError:
        return _DEFAULT_WINDOW_DAYS
    if n <= 0:
        return _DEFAULT_WINDOW_DAYS
    return min(n, _MAX_WINDOW_DAYS)


@router.get("/{article_id}/timeline", response_model=TimelineResponse)
def get_timeline(
    article_id: int,
    window: str = Query(default="30d"),
    db: Session = Depends(get_db),
) -> TimelineResponse:
    """Return per-day view/download counts inside ``window``.

    The response always contains one bucket per day in the window,
    including days with zero events — that keeps client-side charts
    from having to fill gaps themselves.
    """
    _ensure_article_exists(db, article_id)

    days = _parse_window(window)
    # Start of the window in UTC, aligned to midnight so buckets are
    # whole calendar days.
    today = datetime.utcnow().date()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time())

    # ``func.date(...)`` works on both SQLite (tests) and Postgres
    # (production) — both dialects return an ISO ``YYYY-MM-DD`` string
    # for a DATETIME argument.
    rows = (
        db.query(
            func.date(ArticleEvent.created_at).label("day"),
            ArticleEvent.event_type,
            func.count(ArticleEvent.id).label("n"),
        )
        .filter(
            ArticleEvent.article_id == article_id,
            ArticleEvent.created_at >= start_dt,
            ArticleEvent.event_type.in_(("view", "download")),
        )
        .group_by("day", ArticleEvent.event_type)
        .all()
    )

    # Pre-seed every day in the window with zeroes so the response has
    # a stable shape regardless of activity.
    buckets: dict[str, dict[str, int]] = {}
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        buckets[d] = {"views": 0, "downloads": 0}

    for day, event_type, n in rows:
        # SQLite hands ``day`` back as a str; Postgres returns a
        # ``date`` object. Normalise to the ISO string for the key.
        key = day.isoformat() if hasattr(day, "isoformat") else str(day)
        bucket = buckets.get(key)
        if bucket is None:
            continue
        if event_type == "view":
            bucket["views"] = int(n or 0)
        elif event_type == "download":
            bucket["downloads"] = int(n or 0)

    ordered = [
        TimelineBucket(date=d, views=v["views"], downloads=v["downloads"])
        for d, v in sorted(buckets.items())
    ]
    return TimelineResponse(buckets=ordered)
