from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    kind: str = Field(default="news", pattern="^(news|cfp|update)$")
    link_url: Optional[str] = Field(default=None, max_length=500)
    is_published: bool = True
    expires_at: Optional[datetime] = None


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    body: Optional[str] = Field(default=None, min_length=1)
    kind: Optional[str] = Field(default=None, pattern="^(news|cfp|update)$")
    link_url: Optional[str] = Field(default=None, max_length=500)
    is_published: Optional[bool] = None
    expires_at: Optional[datetime] = None


class AnnouncementRead(AnnouncementBase):
    id: int
    published_at: datetime

    model_config = ConfigDict(from_attributes=True)
