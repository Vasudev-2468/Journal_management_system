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

    def __repr__(self):
        return f"<Reviewer(id={self.id}, name='{self.name}', load={self.current_load}/{self.max_assignments})>"
