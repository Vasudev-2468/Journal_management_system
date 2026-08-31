from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ArticleReviewBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=20)
    rating: int = Field(ge=1, le=5)


class ArticleReviewCreate(ArticleReviewBase):
    article_id: int


class ArticleReviewUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    content: Optional[str] = Field(default=None, min_length=20)
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class ArticleReviewRead(ArticleReviewBase):
    id: int
    article_id: int
    reviewer_id: Optional[int] = None
    reviewer_display: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
