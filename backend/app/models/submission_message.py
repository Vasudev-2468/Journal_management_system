"""Author ↔ editor message thread attached to a submission."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class SubmissionMessage(Base):
    __tablename__ = "submission_messages"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 'author' | 'editor' | 'system'
    sender_role = Column(String(20), nullable=False)
    sender_email = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    is_from_editor = Column(Boolean, nullable=False, default=False)
    read_by_author_at = Column(DateTime, nullable=True)
    read_by_editor_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    submission = relationship("Submission", backref="messages")

    def __repr__(self) -> str:
        return (
            f"<SubmissionMessage(id={self.id}, submission_id={self.submission_id}, "
            f"sender_role={self.sender_role})>"
        )
