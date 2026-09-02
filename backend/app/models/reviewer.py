import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


class Reviewer(Base):
    __tablename__ = "reviewers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    whatsapp_number = Column(String(30))
    institution = Column(String(500))
    expertise_tags = Column(ARRAY(String), default=[])
    embedding_vector = Column(JSON)
    max_assignments = Column(Integer, nullable=False, default=5)
    current_load = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Persistent reviewer account (JG reviewer-auth): a reviewer can set a
    # password from a signed invitation link and log in with email+password
    # afterwards. All three columns are nullable — reviewers that were only
    # ever invited by per-review token continue to work exactly as before.
    password_hash = Column(String(255), nullable=True)
    email_verified_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)

    # Editor-driven invitation lifecycle.
    #
    # The panel invitation flow is: editor invites → system generates a
    # random password, stamps ``invitation_sent_at`` + a 21-day
    # ``invitation_expires_at`` and emails the credentials + Accept /
    # Reject links → reviewer clicks Accept (``invitation_accepted_at``
    # stamped, login unlocked) or Reject (``invitation_declined_at``
    # stamped, ``invitation_revoked_at`` also stamped) → if no response
    # inside the window, the scheduled auto-revoke agent stamps
    # ``invitation_revoked_at`` on its next run.
    #
    # ``invitation_sent_at`` — most recent send/resend; also serves as
    # the freshness cursor for stale-token rejection.
    # ``invitation_expires_at`` — the 21-day deadline. After this the
    # scheduled agent revokes the invite unless the reviewer accepted
    # or declined in time.
    # ``invitation_accepted_at`` — reviewer clicked Accept; login is
    # allowed from this point.
    # ``invitation_declined_at`` — reviewer clicked Reject; the row
    # remains for audit but login is refused.
    # ``invitation_revoked_at`` — invitation invalidated (by editor
    # revoke, reviewer decline, or auto-revoke agent).
    invitation_sent_at = Column(DateTime, nullable=True)
    invitation_expires_at = Column(DateTime, nullable=True)
    invitation_accepted_at = Column(DateTime, nullable=True)
    invitation_declined_at = Column(DateTime, nullable=True)
    invitation_revoked_at = Column(DateTime, nullable=True)

    # Reviewer-portal profile fields (spec §18-19). All nullable — new
    # reviewers get the panel with everything blank and complete their
    # profile from the Profile page.
    phone = Column(String(50))
    country = Column(String(120))
    department = Column(String(255))
    designation = Column(String(255))
    orcid = Column(String(64))
    scopus_id = Column(String(64))
    google_scholar = Column(String(500))

    # Reviewer availability (spec §19). ``unavailable_from`` /
    # ``unavailable_until`` drive the editor's assignment logic so
    # invitations are held during a declared unavailable window.
    unavailable_from = Column(DateTime, nullable=True)
    unavailable_until = Column(DateTime, nullable=True)

    # TOTP (authenticator-app) 2FA for reviewer sign-in.
    # ``totp_secret``       — base32 secret; nulled on disable.
    # ``totp_enrolled_at``  — stamped only after /totp/confirm.
    totp_secret = Column(String(64), nullable=True)
    totp_enrolled_at = Column(DateTime, nullable=True)

    # Bridge to the unified ``users`` identity surface. A Reviewer row is
    # kept as the operational record for peer-review (load counters, tags,
    # embedding vector, per-review token flow); the linked User row
    # represents the same person on the platform-wide identity model so a
    # single ``resolve_reviewer(...)`` lookup can hand back both handles.
    #
    # Nullable so existing rows load without a linked user until the
    # backfill migration (or the set-password handler) provisions one.
    # ON DELETE SET NULL preserves the Reviewer row if the User is
    # deleted independently — no reviewer or review history is ever lost
    # by a user-account cleanup.
    linked_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Multi-journal scaffolding (additive). NULL = primary journal.
    # A reviewer's tag pool may be shared across journals in future — for
    # now the column is nullable and the reviewer belongs to the primary
    # journal by default. See app.services.tenancy.
    journal_id = Column(Integer, ForeignKey("journals.id"), nullable=True, index=True)

    reviews = relationship("Review", back_populates="reviewer")

    @property
    def has_password(self) -> bool:
        """Whether the reviewer has completed the activation flow. Used
        by the editor Reviewers panel to distinguish "activated" from
        "pending activation" without exposing the password hash."""
        return bool(self.password_hash)

    def __repr__(self):
        return f"<Reviewer(id={self.id}, name='{self.name}', load={self.current_load}/{self.max_assignments})>"
