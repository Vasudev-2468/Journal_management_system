from pydantic import BaseModel
from typing import Optional, List

# Schema for AI Analysis results
class AIAnalysisBase(BaseModel):
    article_id: int
    summary: str
    keywords: List[str]
    plagiarism_score: Optional[float] = None

# Schema for creating a new AI Analysis
class AIAnalysisCreate(AIAnalysisBase):
    pass

# Schema for reading AI Analysis results
class AIAnalysisRead(AIAnalysisBase):
    id: int

    class Config:
        orm_mode = True

# Schema for updating AI Analysis results
class AIAnalysisUpdate(BaseModel):
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None
    plagiarism_score: Optional[float] = None