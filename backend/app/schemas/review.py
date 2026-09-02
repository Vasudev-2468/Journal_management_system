import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Reviewer portal: access response ────────────────────

class ReviewFormSchema(BaseModel):
    """Describes the expected fields for the review form."""
    score_fields: List[str] = [
        "score_originality",
        "score_technical",
        "score_relevance",
        "score_clarity",
        "score_references",
    ]
    score_min: float = 1.0
    score_max: float = 10.0
    recommendation_options: List[str] = [
        "accept",
        "minor_revision",
        "major_revision",
        "reject",
    ]


class ReviewAccessResponse(BaseModel):
    reviewer_name: str
    paper_title: str
    redacted_pdf_url: Optional[str] = None
    review_form_schema: ReviewFormSchema = ReviewFormSchema()


# ── Reviewer portal: submit review ──────────────────────

class ReviewSubmitRequest(BaseModel):
    score_originality: float = Field(..., ge=1.0, le=10.0)
    score_technical: float = Field(..., ge=1.0, le=10.0)
    score_relevance: float = Field(..., ge=1.0, le=10.0)
    score_clarity: float = Field(..., ge=1.0, le=10.0)
    score_references: float = Field(..., ge=1.0, le=10.0)
    overall_recommendation: str = Field(
        ..., pattern="^(accept|minor_revision|major_revision|reject)$"
    )
    comments_to_authors: str = Field(..., min_length=1)
    comments_to_editor: Optional[str] = None


class ReviewSubmitResponse(BaseModel):
    review_id: uuid.UUID
    message: str


# ── Editor: submission reviews ───────────────────────────

class ReviewDetail(BaseModel):
    review_id: uuid.UUID
    reviewer_name: Optional[str] = None
    status: str
    score_originality: Optional[float] = None
    score_technical: Optional[float] = None
    score_relevance: Optional[float] = None
    score_clarity: Optional[float] = None
    score_references: Optional[float] = None
    overall_recommendation: Optional[str] = None
    comments_to_authors: Optional[str] = None
    comments_to_editor: Optional[str] = None
    assigned_at: datetime
    completed_at: Optional[datetime] = None


class AverageScores(BaseModel):
    score_originality: Optional[float] = None
    score_technical: Optional[float] = None
    score_relevance: Optional[float] = None
    score_clarity: Optional[float] = None
    score_references: Optional[float] = None


class SubmissionReviewsResponse(BaseModel):
    submission_id: uuid.UUID
    paper_title: str
    reviews: List[ReviewDetail]
    average_scores: AverageScores
    completed_count: int
    total_count: int


# ── Editor: decision ─────────────────────────────────────

class DecisionRequest(BaseModel):
    # revision_requested is kept for backward-compat with any external caller;
    # minor_revision / major_revision are the new, distinguishable values.
    decision: str = Field(
        ...,
        pattern="^(accepted|rejected|revision_requested|minor_revision|major_revision|reject_and_resubmit)$",
    )
    editor_comments: Optional[str] = None
    # Optional structured reason for a rejected decision. Ignored when the
    # decision is anything else. The fixed vocabulary keeps downstream
    # analytics stable — free-form editor prose still goes into
    # ``editor_comments``.
    reject_reason_code: Optional[str] = Field(
        default=None,
        pattern=(
            "^(out_of_scope|insufficient_novelty|methodology_flawed|"
            "inconclusive_results|poor_writing|ethics_concern|"
            "plagiarism_suspected|duplicate_submission)$"
        ),
    )


class DecisionResponse(BaseModel):
    submission_id: uuid.UUID
    new_status: str
    message: str