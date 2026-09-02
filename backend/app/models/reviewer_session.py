"""
Reviewer active sessions — one row per successful login.

Lightweight audit trail so the Security page can list every device
that's currently signed in, and so ``sign-out-everywhere`` has
something to actually revoke instead of only bumping
``last_login_at``.

Only stores metadata for display + revocation; the JWT itself is
never stored (only a SHA-256 digest of the token string, used to
match the incoming Authorization header against a specific session
without keeping a replayable copy).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class ReviewerSession(Base):
    __tablename__ = "reviewer_sessions"

    id = Column(Integer, primary_key=True, index=True)
    reviewer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reviewers.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # SHA-256 hex of the raw JWT — matches the pattern editor sessions
    # use so we can identify a specific session on revoke without
    # storing the replayable token.
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    ip_address = Column(String(64))
    user_agent = Column(Text)
    device_label = Column(String(120))     # derived from user_agent for display
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    revoked_at = Column(DateTime)
