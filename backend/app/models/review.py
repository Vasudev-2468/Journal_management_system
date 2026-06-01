import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class OverallRecommendation(str, enum.Enum):
    accept = "accept"
    minor_revision = "minor_revision"
    major_revision = "major_revision"
    reject = "reject"


class ReviewStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    expired = "expired"


class Review(Base):
    __tablename__ = "reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id = Column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id = Column(
        UUID(as_uuid=True), ForeignKey("reviewers.id", ondelete="SET NULL"), index=True
    )

    # Secure review link
    link_token = Column(String(255), unique=True, nullable=False, index=True)
    link_expires_at = Column(DateTime, nullable=False)
    link_used = Column(Boolean, nullable=False, default=False)

    # Scores (1–10)
    score_originality = Column(Float)
    score_technical = Column(Float)
    score_relevance = Column(Float)
    score_clarity = Column(Float)
    score_references = Column(Float)

    overall_recommendation = Column(Enum(OverallRecommendation, name="overall_recommendation"))
    comments_to_authors = Column(Text)
    comments_to_editor = Column(Text)

    status = Column(
        Enum(ReviewStatus, name="review_status"),
        nullable=False,
        default=ReviewStatus.pending,
        index=True,
    )
    assigned_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)

    submission = relationship("Submission", back_populates="reviews")
    reviewer = relationship("Reviewer", back_populates="reviews")
    reviewer = relationship("Reviewer", back_populates="reviews")

    def __repr__(self):
        return f"<Review(id={self.id}, submission={self.submission_id}, status={self.status})>"