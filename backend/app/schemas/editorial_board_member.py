from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

BOARD_CATEGORY_PATTERN = (
    "^(editor_in_chief|associate_editor|managing_editor|section_editor|board_member|advisory|technical)$"
)


class EditorialBoardMemberBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=150)
    category: str = Field(default="board_member", pattern=BOARD_CATEGORY_PATTERN)
    affiliation: Optional[str] = None
    department: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    orcid: Optional[str] = None
    scholar_url: Optional[str] = None
    scopus_id: Optional[str] = None
    institutional_profile_url: Optional[str] = None
    qualifications: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    photo_url: Optional[str] = None
    phone: Optional[str] = None
    keywords: Optional[str] = None
    years_editorial_experience: Optional[int] = Field(default=None, ge=0, le=80)
    max_active_manuscripts: Optional[int] = Field(default=None, ge=0, le=200)
    photo_file_url: Optional[str] = None
    resume_file_url: Optional[str] = None
    certification_files: Optional[List[Any]] = None
    sort_order: int = 100
    is_active: bool = True


class EditorialBoardMemberCreate(EditorialBoardMemberBase):
    pass


# ── Invitation flow ─────────────────────────────────────

class BoardInviteRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    category: str = Field(default="board_member", pattern=BOARD_CATEGORY_PATTERN)
    role: str = Field(min_length=2, max_length=150)


class BoardInviteResponse(BaseModel):
    member_id: int
    invited_email: str
    email_sent: bool
    message: str


class BoardInvitePrefill(BaseModel):
    """Sent back by GET /board/complete-profile/{token} so the public
    landing form can prefill what the editor already typed in."""
    member_id: int
    name: str
    email: str
    category: str
    role: str
    invitation_expires_at: Optional[datetime] = None


class BoardCompleteProfileRequest(BaseModel):
    # Every user-editable field on the profile — the router applies only
    # the fields the invitee actually filled.
    name: Optional[str] = None
    role: Optional[str] = None
    affiliation: Optional[str] = None
    department: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    orcid: Optional[str] = None
    scholar_url: Optional[str] = None
    scopus_id: Optional[str] = None
    institutional_profile_url: Optional[str] = None
    qualifications: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    keywords: Optional[str] = None
    years_editorial_experience: Optional[int] = Field(default=None, ge=0, le=80)
    max_active_manuscripts: Optional[int] = Field(default=None, ge=0, le=200)
    photo_file_url: Optional[str] = None
    resume_file_url: Optional[str] = None
    certification_files: Optional[List[Any]] = None


class BoardCompleteProfileResponse(BaseModel):
    ok: bool
    message: str


class BoardFileUploadResponse(BaseModel):
    file_url: str
    filename: str
    size: int


class EditorialBoardMemberUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, min_length=1, max_length=150)
    category: Optional[str] = Field(default=None, pattern=BOARD_CATEGORY_PATTERN)
    affiliation: Optional[str] = None
    department: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    orcid: Optional[str] = None
    scholar_url: Optional[str] = None
    scopus_id: Optional[str] = None
    institutional_profile_url: Optional[str] = None
    qualifications: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    photo_url: Optional[str] = None
    phone: Optional[str] = None
    keywords: Optional[str] = None
    years_editorial_experience: Optional[int] = Field(default=None, ge=0, le=80)
    max_active_manuscripts: Optional[int] = Field(default=None, ge=0, le=200)
    photo_file_url: Optional[str] = None
    resume_file_url: Optional[str] = None
    certification_files: Optional[List[Any]] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class EditorialBoardMemberRead(EditorialBoardMemberBase):
    id: int
    invited_email: Optional[str] = None
    invitation_sent_at: Optional[datetime] = None
    invitation_completed_at: Optional[datetime] = None
    invitation_revoked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BoardInvitationLinkResponse(BaseModel):
    """Returned by GET /board/invite/{id}/link — the editor can copy this
    directly onto Slack/email/whatever when they need to hand-deliver
    the link (retry after a bounce, etc.)."""
    member_id: int
    invitation_url: str
    expires_at: datetime
