import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Request schemas ──────────────────────────────────────

class ReviewerRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    whatsapp_number: Optional[str] = Field(None, max_length=30)
    institution: Optional[str] = Field(None, max_length=500)
    expertise_tags: List[str] = Field(default_factory=list)


class ReviewerUpdateRequest(BaseModel):
    expertise_tags: Optional[List[str]] = None
    max_assignments: Optional[int] = Field(None, ge=1, le=50)
    is_active: Optional[bool] = None


class AssignReviewersRequest(BaseModel):
    submission_id: uuid.UUID
    reviewer_ids: List[uuid.UUID] = Field(..., min_length=2, max_length=3)


# ── Response schemas ─────────────────────────────────────

class ReviewerRegisteredResponse(BaseModel):
    reviewer_id: uuid.UUID
    message: str


class ReviewerListItem(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    institution: Optional[str] = None
    expertise_tags: List[str] = []
    current_load: int
    max_assignments: int
    is_active: bool
    # Invitation lifecycle — drives the "pending / activated / revoked"
    # pill and the per-row action menu (Show link / Resend / Revoke).
    # ``has_password`` is derived at serialization time from the
    # reviewer row's ``password_hash`` column, which is intentionally
    # never exposed.
    has_password: bool = False
    email_verified_at: Optional[datetime] = None
    invitation_sent_at: Optional[datetime] = None
    invitation_expires_at: Optional[datetime] = None
    invitation_accepted_at: Optional[datetime] = None
    invitation_declined_at: Optional[datetime] = None
    invitation_revoked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ReviewerInvitationLinkResponse(BaseModel):
    reviewer_id: uuid.UUID
    invitation_url: str
    expires_at: datetime


class ReviewerResendResponse(BaseModel):
    reviewer_id: uuid.UUID
    email_sent: bool
    message: str


class ReviewHistoryItem(BaseModel):
    review_id: uuid.UUID
    submission_id: uuid.UUID
    paper_title: str
    status: str
    assigned_at: datetime
    completed_at: Optional[datetime] = None


class ReviewerDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    whatsapp_number: Optional[str] = None
    institution: Optional[str] = None
    expertise_tags: List[str] = []
    current_load: int
    max_assignments: int
    is_active: bool
    created_at: datetime
    review_history: List[ReviewHistoryItem] = []

    model_config = ConfigDict(from_attributes=True)


class ReviewerSuggestion(BaseModel):
    reviewer_id: uuid.UUID
    name: str
    expertise_tags: List[str] = []
    current_load: int
    max_assignments: int
    similarity_score: float


class AssignReviewersResponse(BaseModel):
    submission_id: uuid.UUID
    reviews_created: int
    message: str
