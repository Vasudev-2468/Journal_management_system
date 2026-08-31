from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

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
    sort_order: int = 100
    is_active: bool = True


class EditorialBoardMemberCreate(EditorialBoardMemberBase):
    pass


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
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class EditorialBoardMemberRead(EditorialBoardMemberBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
