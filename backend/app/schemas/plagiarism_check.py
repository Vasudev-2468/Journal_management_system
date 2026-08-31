"""Read schemas for persisted plagiarism checks."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class PlagiarismCheckRead(BaseModel):
    id: int
    submission_id: Optional[str] = None
    text_hash: str
    score: int
    top_match_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PlagiarismCheckList(BaseModel):
    checks: List[PlagiarismCheckRead]
