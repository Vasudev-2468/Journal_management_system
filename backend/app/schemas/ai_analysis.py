from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List


class AIAnalysisBase(BaseModel):
    article_id: int
    summary: str
    plagiarism_score: int = Field(ge=0, le=100)
    recommendations: Optional[str] = None


class AIAnalysisCreate(AIAnalysisBase):
    pass


class AIAnalysisRead(AIAnalysisBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class AIAnalysisUpdate(BaseModel):
    summary: Optional[str] = None
    plagiarism_score: Optional[int] = Field(default=None, ge=0, le=100)
    recommendations: Optional[str] = None


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1)
    max_sentences: Optional[int] = Field(default=3, ge=1, le=10)


class SummarizeResponse(BaseModel):
    summary: str


class PlagiarismRequest(BaseModel):
    text: str = Field(min_length=1)
    corpus_article_ids: Optional[List[int]] = None


class PlagiarismMatch(BaseModel):
    article_id: int
    title: str
    similarity: float


class PlagiarismResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    matches: List[PlagiarismMatch] = []


class RecommendationsResponse(BaseModel):
    article_id: int
    related: List[dict] = []


class AnalysisRunResponse(AIAnalysisRead):
    """The persisted AIAnalysis row after a full analysis run."""
