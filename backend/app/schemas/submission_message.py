"""Schemas for the author ↔ editor submission message thread."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SubmissionMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)


class SubmissionMessageRead(BaseModel):
    id: int
    submission_id: uuid.UUID
    sender_role: str
    sender_email: Optional[str] = None
    body: str
    is_from_editor: bool
    read_by_author_at: Optional[datetime] = None
    read_by_editor_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
