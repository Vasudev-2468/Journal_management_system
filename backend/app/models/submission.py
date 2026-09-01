import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, Float, DateTime, Enum, ForeignKey, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


class SubmissionStatus(str, enum.Enum):
    pending_classification = "pending_classification"
    awaiting_format_check = "awaiting_format_check"
    awaiting_consult_review = "awaiting_consult_review"
    awaiting_reviewer_suggestions = "awaiting_reviewer_suggestions"
    pending_assignment = "pending_assignment"
    under_review = "under_review"
    revision_requested = "revision_requested"
    returned_to_author = "returned_to_author"
    accepted = "accepted"
    rejected = "rejected"


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_name = Column(String(255), nullable=False)
    author_email = Column(String(255), nullable=False, index=True)
    paper_title = Column(String(500), nullable=False)
    abstract = Column(Text, nullable=False)
    keywords = Column(ARRAY(String), default=[])
    pdf_url = Column(String(1024))
    redacted_pdf_url = Column(String(1024))
    classified_field = Column(String(255))
    classification_confidence = Column(Float)
    status = Column(
        Enum(SubmissionStatus, name="submission_status"),
        nullable=False,
        default=SubmissionStatus.pending_classification,
        index=True,
    )
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    reviews = relationship("Review", back_populates="submission", cascade="all, delete-orphan")

    # Format check results (Agent 2)
    format_check_report = Column(JSON)        # {"checks": [...], "overall": "pass/warn/fail"}
    format_check_completed_at = Column(DateTime)
    consult_party_email = Column(String(255))  # Section editor assigned for format review
    consult_party_decision = Column(String(50))  # "approve" or "reject"
    consult_party_comments = Column(Text)
    suggested_reviewers_data = Column(JSON)    # [{name, email, orcid, affiliation, expertise, match_score}]
    paper_id_code = Column(String(50), unique=True, index=True)  # e.g. JGAIR-2026-0001

    # Multi-journal scaffolding (additive, backward-compatible). NULL means
    # "belongs to the primary journal" — see app.services.tenancy. Populated
    # by future multi-journal workflows; single-journal deployments keep it
    # NULL and every existing query stays correct.
    journal_id = Column(Integer, ForeignKey("journals.id"), nullable=True, index=True)

    def __repr__(self):
        return f"<Submission(id={self.id}, title='{self.paper_title}', status={self.status})>"
