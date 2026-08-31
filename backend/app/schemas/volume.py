from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Issue↔Article link ────────────────────────────────

class IssueArticleBase(BaseModel):
    article_id: int
    sequence: int = 1
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    doi: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = None


class IssueArticleCreate(IssueArticleBase):
    pass


class IssueArticleRead(IssueArticleBase):
    id: int
    issue_id: int
    article_title: Optional[str] = None
    article_display: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Issue ─────────────────────────────────────────────

class IssueBase(BaseModel):
    number: int
    title: Optional[str] = None
    theme: Optional[str] = None
    month: Optional[str] = None
    status: str = Field(default="planned", pattern="^(planned|accepting|published)$")
    editorial_note: Optional[str] = None
    deadline: Optional[str] = None


class IssueCreate(IssueBase):
    volume_id: int


class IssueUpdate(BaseModel):
    number: Optional[int] = None
    title: Optional[str] = None
    theme: Optional[str] = None
    month: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(planned|accepting|published)$")
    editorial_note: Optional[str] = None
    deadline: Optional[str] = None
    published_at: Optional[datetime] = None


class IssueRead(IssueBase):
    id: int
    volume_id: int
    published_at: Optional[datetime] = None
    article_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class IssueDetail(IssueRead):
    volume_number: int
    volume_year: int
    articles: List[IssueArticleRead] = []


# ── Volume ────────────────────────────────────────────

class VolumeBase(BaseModel):
    number: int
    year: int
    title: Optional[str] = None


class VolumeCreate(VolumeBase):
    journal_id: int


class VolumeUpdate(BaseModel):
    number: Optional[int] = None
    year: Optional[int] = None
    title: Optional[str] = None


class VolumeRead(VolumeBase):
    id: int
    journal_id: int
    issues: List[IssueRead] = []

    model_config = ConfigDict(from_attributes=True)
