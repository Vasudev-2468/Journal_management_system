"""Per-user active-session tracking.

Every authenticated request whose JWT survives ``get_current_user`` also
touches a row in ``user_sessions``. The row is keyed by the SHA-256 of
the JWT string — we store the hash, not the token, so a leaked DB
snapshot cannot be replayed as an active session. The auth path updates
``last_seen_at``, ``ip_address`` and ``user_agent`` on every hit, so the
"signed in on these devices" panel can show a live picture without any
extra client-side heartbeat.

Revocation is a soft flag: ``revoked_at`` is stamped by the router and
subsequently checked by ``get_current_user``. A revoked token that has
not yet expired is refused with a 401 — the client is expected to drop
the token and reauthenticate. We keep revoked rows around for a while
so the security-log view can display "signed out from device X at Y".

Fields
------
* ``token_hash`` — hex SHA-256 of the raw JWT string. Unique, indexed,
  so the lookup on every authenticated request is a single index probe.
* ``user_id`` — indexed FK to ``users.id`` with ``ON DELETE CASCADE``.
  Removing a user must not leave orphan sessions that could be probed.
* ``last_seen_at`` — indexed so "sort by most recently used" is cheap
  even on very active accounts.
* ``ip_address`` / ``user_agent`` — best-effort attribution. Both are
  nullable because the auth path degrades gracefully when the underlying
  ``Request`` isn't in scope (e.g. some background jobs).
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)

    # Cascade the delete so removing a user tears their live sessions
    # down atomically. Indexed for the "my sessions" and
    # "revoke every other row for this user" queries.
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Hex SHA-256 is 64 chars; we allow room for future digest changes.
    # Unique so the per-request "find or create by token_hash" query
    # collapses to a single index probe.
    token_hash = Column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Indexed so ordering the panel by most-recently-used is cheap.
    last_seen_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True,
    )

    # Best-effort attribution — see module docstring.
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)

    # Soft revocation. NULL means live; a stamped value means the
    # token was disowned by its owner (per-device sign-out).
    revoked_at = Column(DateTime, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        state = "revoked" if self.revoked_at else "live"
        return (
            f"<UserSession(id={self.id}, user={self.user_id}, "
            f"state={state}, last_seen={self.last_seen_at})>"
        )
