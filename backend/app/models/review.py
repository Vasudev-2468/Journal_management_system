import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, Enum, ForeignKey, Integer
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


class ReviewState(str, enum.Enum):
    """Fine-grained state on top of ``status`` — powers the reviewer
    dashboard status pill (INVITED / ACCEPTED / IN_PROGRESS / SUBMITTED /
    DECLINED / OVERDUE / CANCELLED / EXPIRED). ``status`` remains the
    coarse invariant driving editor-side pipelines; ``state`` is the
    reviewer-facing surface state and is stamped by the reviewer's own
    actions (accept, decline, save draft, submit)."""
    invited = "invited"
    accepted = "accepted"
    in_progress = "in_progress"
    submitted = "submitted"
    declined = "declined"
    overdue = "overdue"
    cancelled = "cancelled"
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
    # Fine-grained reviewer-facing state — see ReviewState docstring.
    state = Column(
        Enum(ReviewState, name="review_state"),
        nullable=False,
        default=ReviewState.invited,
        server_default=ReviewState.invited.value,
        index=True,
    )
    # Structured review form additions (see reviewer portal /submit):
    # verdict on the five dimensions, per-question rubric answers, and
    # the confidence + willing-to-re-review signals from the final
    # recommendation card. Kept nullable so existing rows still load.
    rubric_answers = Column("rubric_answers", Text)  # JSON blob
    confidence = Column(String(16))                   # high / medium / low
    willing_to_review_revision = Column(Boolean)
    coi_declared_at = Column(DateTime)
    accepted_at = Column(DateTime)
    declined_at = Column(DateTime)
    decline_reason = Column(Text)
    editor_summary = Column(Text)     # Editor Summary Agent output
    editor_summary_json = Column(Text)  # Editor Summary Agent raw JSON

    # Repeating-comment sections (structured review v2):
    #   * major_comments — list of "the paper cannot proceed without…"
    #   * minor_comments — list of "should be corrected but doesn't
    #                      invalidate the science"
    #   * suggestions_to_authors — free-form improvement ideas
    #   * page_annotations — list of {page,lines,type,text} the reviewer
    #                        anchored to a specific PDF location
    # All persisted as JSON blobs so the editor UI can render them
    # verbatim (per spec §20 — "AI summary should never alter the
    # reviewer's original comments"). Nullable — old rows without
    # structured comments still load.
    major_comments = Column(Text)
    minor_comments = Column(Text)
    suggestions_to_authors = Column(Text)
    page_annotations = Column(Text)

    # Ethical concern flag — separate from the general comments so the
    # editor can filter reviews carrying an ethics concern without
    # having to grep prose (spec §13).
    ethics_flag = Column(Boolean, nullable=False, default=False, server_default="false")
    ethics_note = Column(Text)

    # Reviewer Report v3 — first-class report additions:
    #   * overall_assessment  — the reviewer's summary paragraph up-front
    #                            (distinct from author-facing final report).
    #   * round_number        — 1-indexed review round (spec §19). Enables
    #                            the "same reviewer, later round" flow.
    #                            Defaults to 1 for all pre-existing rows.
    overall_assessment = Column(Text)
    round_number = Column(Integer, nullable=False, default=1, server_default="1")

    assigned_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)

    submission = relationship("Submission", back_populates="reviews")
    reviewer = relationship("Reviewer", back_populates="reviews")
    draft = relationship(
        "ReviewDraft", back_populates="review", uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Review(id={self.id}, submission={self.submission_id}, status={self.status})>"