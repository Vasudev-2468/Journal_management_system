"""
Editorial decisions (spec §13).

Every decision the editor issues on a manuscript lands here — one row
per (submission, round, decided_at). The submission table still
carries the current status field for backward compatibility with the
existing pipelines; the historical audit trail lives here.

Kept lightweight on purpose: the reviewer-facing content stays on the
Review rows, the author-facing letter lives on this row (as
``letter_text``), and everything else is derivable.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class EditorialDecision(Base):
    __tablename__ = "editorial_decisions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    editor_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    # ``decision`` mirrors the DecisionRequest regex on the router:
    #   accepted | rejected | revision_requested | minor_revision |
    #   major_revision | reject_and_resubmit
    decision = Column(String(32), nullable=False)
    round_number = Column(Integer, nullable=False, default=1, server_default="1")
    letter_text = Column(Text)     # editor-approved decision letter
    editor_note = Column(Text)     # optional internal note
    decided_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    submission = relationship("Submission")

    def __repr__(self):  # pragma: no cover — repr only
        return f"<EditorialDecision(id={self.id}, submission={self.submission_id}, decision={self.decision}, round={self.round_number})>"
