"""Shared Pydantic schemas for the platform-expansion routers.

Grouped in one module to keep the router imports light. Individual routers
import only what they need.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── Manuscript version + files ──────────────────────────

class ManuscriptFileRead(BaseModel):
    id: int
    kind: str
    original_filename: str
    stored_url: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ManuscriptFileCreate(BaseModel):
    kind: str = Field(pattern="^(manuscript|figure|supplementary|response|cover_letter|dataset|video|revised|other)$")
    original_filename: str = Field(min_length=1, max_length=400)
    stored_url: str = Field(min_length=1, max_length=1024)
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    checksum: Optional[str] = None


class ManuscriptVersionRead(BaseModel):
    id: int
    submission_id: str
    version_number: int
    label: str
    cover_letter: Optional[str] = None
    response_to_reviewers: Optional[str] = None
    change_summary: Optional[str] = None
    is_current: bool
    created_at: datetime
    files: List[ManuscriptFileRead] = []
    model_config = ConfigDict(from_attributes=True)


class ManuscriptVersionCreate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=80)
    cover_letter: Optional[str] = None
    response_to_reviewers: Optional[str] = None
    change_summary: Optional[str] = None
    files: List[ManuscriptFileCreate] = []


# ─── Production ──────────────────────────────────────────

class ProductionRead(BaseModel):
    id: int
    submission_id: str
    stage: str
    copy_edit_notes: Optional[str] = None
    typesetting_notes: Optional[str] = None
    proof_pdf_url: Optional[str] = None
    author_corrections: Optional[str] = None
    final_pdf_url: Optional[str] = None
    doi: Optional[str] = None
    published_at: Optional[datetime] = None
    updated_at: datetime
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductionUpdate(BaseModel):
    stage: Optional[str] = Field(default=None, pattern="^(copy_editing|typesetting|proof|author_proof_pending|author_proof_approved|final_pdf|doi_assigned|published)$")
    copy_edit_notes: Optional[str] = None
    typesetting_notes: Optional[str] = None
    proof_pdf_url: Optional[str] = None
    author_corrections: Optional[str] = None
    final_pdf_url: Optional[str] = None
    doi: Optional[str] = None
    published_at: Optional[datetime] = None


# ─── Special issues ──────────────────────────────────────

class SpecialIssueBase(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1)
    guest_editors: Optional[str] = None
    topics: Optional[str] = None
    cover_image_url: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    publication_date: Optional[datetime] = None
    status: str = Field(default="open", pattern="^(open|closed|published)$")
    is_published: bool = True


class SpecialIssueCreate(SpecialIssueBase):
    pass


class SpecialIssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    guest_editors: Optional[str] = None
    topics: Optional[str] = None
    cover_image_url: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    publication_date: Optional[datetime] = None
    status: Optional[str] = Field(default=None, pattern="^(open|closed|published)$")
    is_published: Optional[bool] = None


class SpecialIssueRead(SpecialIssueBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# ─── Email templates ─────────────────────────────────────

class EmailTemplateBase(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    description: Optional[str] = None
    placeholders: Optional[str] = None
    is_active: bool = True


class EmailTemplateCreate(EmailTemplateBase):
    pass


class EmailTemplateUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    description: Optional[str] = None
    placeholders: Optional[str] = None
    is_active: Optional[bool] = None


class EmailTemplateRead(EmailTemplateBase):
    id: int
    updated_by: Optional[str] = None
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Audit log ───────────────────────────────────────────

class AuditLogRead(BaseModel):
    id: int
    actor_id: Optional[int] = None
    actor_email: Optional[str] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    ip_address: Optional[str] = None
    meta: Optional[dict] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Article references ─────────────────────────────────

class ArticleReferenceCreate(BaseModel):
    sequence: int = 1
    text: str = Field(min_length=1)
    doi: Optional[str] = None
    url: Optional[str] = None


class ArticleReferenceRead(ArticleReferenceCreate):
    id: int
    article_id: int
    model_config = ConfigDict(from_attributes=True)


# ─── User admin ──────────────────────────────────────────

class UserAdminRead(BaseModel):
    id: int
    username: Optional[str] = None
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    country: Optional[str] = None
    institution: Optional[str] = None
    orcid: Optional[str] = None
    mfa_enabled: bool = False
    model_config = ConfigDict(from_attributes=True)


class UserAdminUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern="^(author|editor|section_editor|admin)$")
    is_active: Optional[bool] = None
    country: Optional[str] = None
    institution: Optional[str] = None
