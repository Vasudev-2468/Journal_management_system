from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactMessageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    subject: str = Field(min_length=1, max_length=300)
    message: str = Field(min_length=10)


class ContactMessageRead(BaseModel):
    id: int
    name: str
    email: str
    subject: str
    message: str
    is_read: bool
    resolved: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContactMessageUpdate(BaseModel):
    is_read: Optional[bool] = None
    resolved: Optional[bool] = None
