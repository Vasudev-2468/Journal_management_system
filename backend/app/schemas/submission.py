import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# ── Request schemas ──────────────────────────────────────

class SubmissionCreateForm(BaseModel):
    """Mirrors the multipart form fields (parsed manually in the router)."""
    paper_title: str
    author_name: str
    author_email: EmailStr
    abstract: str
    keywords: str  # comma-separated, split in service
    research_category: str
    ai_usage_disclosure: bool


class ClassificationOverrideRequest(BaseModel):
    classified_field: str = Field(..., min_length=1, max_length=255)
    classification_confidence: float = Field(..., ge=0.0, le=1.0)


# ── Response schemas ─────────────────────────────────────

class SubmissionCreatedResponse(BaseModel):
    submission_id: uuid.UUID
    message: str
    estimated_processing_time: str


class SubmissionStatusResponse(BaseModel):
    submission_id: uuid.UUID
    status: str
    classified_field: Optional[str] = None
    review_count: int = 0


class SubmissionListItem(BaseModel):
    id: uuid.UUID
    author_name: str
    author_email: str
    paper_title: str
    classified_field: Optional[str] = None
    status: str
    submitted_at: datetime
    reviewer_count: int = 0

    class Config:
        orm_mode = True


class PaginatedSubmissions(BaseModel):
    items: List[SubmissionListItem]
    total: int
    page: int
    page_size: int


class ClassificationOverrideResponse(BaseModel):
    submission_id: uuid.UUID
    classified_field: str
    classification_confidence: float
    message: str
