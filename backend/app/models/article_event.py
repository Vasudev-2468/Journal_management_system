"""Per-article view / download / citation-click events.

Each row is one recorded interaction with a public article. The table is
append-only from the router's perspective: we insert rows and read
aggregates, we never mutate a row after it lands. Coarse dedup is done
by :mod:`app.routers.article_stats` using the ``(article_id, event_type,
ip_hash, created_at)`` composite index the migration creates.

Privacy notes
-------------
* We deliberately do NOT store raw IP addresses. ``ip_hash`` is a
  SHA-256 hex of ``f"{ip}:{article_id}:{settings.SECRET_KEY}"`` — the
  per-article salt means the same visitor hitting two articles produces
  two unrelated hashes, and the ``SECRET_KEY`` component means a leaked
  database dump cannot be brute-forced back into IPs without also
  leaking the deploy's secret. If the secret rotates, old hashes are
  simply retired — the dedup window is 30 min, so any collateral
  double-count is bounded.
* ``user_agent`` is truncated to 300 chars in the router; that's a
  hard cap enforced here too.
* ``referrer`` is truncated to 500 chars; the router strips query
  strings before it gets that far.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class ArticleEvent(Base):
    __tablename__ = "article_events"

    id = Column(Integer, primary_key=True, index=True)

    # Deleting the article cascades the event history — a removed
    # article should not leave orphaned rows the aggregates then have
    # to filter out.
    article_id = Column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Small closed vocabulary: 'view', 'download', 'citation_click'.
    # Kept as a plain String (not a Postgres ENUM) so adding a fourth
    # kind later is a no-op — an ENUM would need an ALTER TYPE
    # migration for each new value.
    event_type = Column(String(20), nullable=False, index=True)

    # See the module docstring for the hashing scheme. Nullable because
    # a rare request may arrive without an identifiable client (e.g.
    # tests, or FastAPI's ``request.client`` returning ``None``).
    ip_hash = Column(String(64), nullable=True)

    user_agent = Column(String(300), nullable=True)
    referrer = Column(String(500), nullable=True)

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<ArticleEvent(id={self.id}, article={self.article_id}, "
            f"type={self.event_type!r}, at={self.created_at.isoformat() if self.created_at else '?'})>"
        )
