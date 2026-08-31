from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class PolicySection(BaseModel):
    id: str
    title: str
    content: List[str]


class PolicyPageRead(BaseModel):
    id: int
    slug: str
    title: str
    subtitle: Optional[str] = None
    body: List[PolicySection]
    footer_note: Optional[str] = None
    version: int
    is_published: bool
    last_reviewed_at: Optional[datetime] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PolicyPageUpdate(BaseModel):
    """Partial update. Any provided field overwrites the current value; the
    router bumps `version` and stamps `last_reviewed_at` automatically."""
    title: Optional[str] = None
    subtitle: Optional[str] = None
    body: Optional[List[PolicySection]] = None
    footer_note: Optional[str] = None
    is_published: Optional[bool] = None


class PolicyPageCreate(BaseModel):
    slug: str
    title: str
    subtitle: Optional[str] = None
    body: List[PolicySection] = []
    footer_note: Optional[str] = None
    is_published: bool = True
