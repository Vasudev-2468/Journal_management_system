"""
Review draft — reviewer's in-progress structured review before submit.

One row per Review. The reviewer's dashboard "Save Draft" button posts
a JSON blob here; the "Submit" flow reads it, runs the Review Quality
agent, then promotes the fields into the Review row and clears the
draft. A separate table (rather than reusing the Review columns) keeps
the "not yet submitted" state cleanly distinguishable — the editor's
suggest-reviewers logic and analytics look at Review rows only.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ReviewDraft(Base):
    __tablename__ = "review_drafts"

    review_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # JSON payload — carries the entire structured form (rubric,
    # comments-to-authors, comments-to-editor, recommendation, etc.).
    # Kept as a single blob so schema evolution of the form does not
    # require a migration.
    payload_json = Column(Text, nullable=False, default="{}")
    saved_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    review = relationship("Review", back_populates="draft")

    def __repr__(self):  # pragma: no cover — repr only
        return f"<ReviewDraft(review_id={self.review_id}, saved_at={self.saved_at})>"
