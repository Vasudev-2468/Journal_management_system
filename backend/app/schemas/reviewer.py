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
    # No hard cap — the editor decides how many reviewers a manuscript
    # warrants (some special issues or high-stakes papers legitimately
    # need more). At least one ID is required.
    reviewer_ids: List[uuid.UUID] = Field(..., min_length=1)


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


class ReviewerCredentialsRevealResponse(BaseModel):
    """One-shot editor-visible credential reveal.

    The password is only known at generation time — the DB stores a bcrypt
    hash. This response is the single point at which the plaintext exists
    server-side; callers must show it once and never persist it.
    """
    reviewer_id: uuid.UUID
    username: str          # reviewer's login identifier (== email)
    password: str          # freshly-generated plaintext, one-shot
    login_url: str         # where the reviewer signs in
    invitation_url: Optional[str] = None
    invitation_expires_at: Optional[datetime] = None


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

    # Access lifecycle (editor-only view). The reviewer's password is
    # stored as a bcrypt hash and can never be shown; ``password_set``
    # is the flag the UI uses to tell an editor whether the reviewer has
    # ever finished their onboarding.
    password_set: bool = False
    email_verified_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    invitation_sent_at: Optional[datetime] = None
    invitation_accepted_at: Optional[datetime] = None
    invitation_declined_at: Optional[datetime] = None
    invitation_revoked_at: Optional[datetime] = None
    invitation_expires_at: Optional[datetime] = None

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
