from pydantic import BaseModel
from typing import Optional, List

# Schema for creating a new article
class ArticleCreate(BaseModel):
    title: str
    abstract: str
    content: str
    authors: List[str]  # List of author names
    journal_id: int  # Foreign key to the journal

# Schema for reading an article
class ArticleRead(ArticleCreate):
    id: int  # Article ID
    created_at: str  # Timestamp of creation
    updated_at: str  # Timestamp of last update

# Schema for updating an article
class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    abstract: Optional[str] = None
    content: Optional[str] = None
    authors: Optional[List[str]] = None

# Schema for article response with additional fields
class ArticleResponse(ArticleRead):
    reviews_count: int  # Number of reviews for the article
    ai_analysis: Optional[str] = None  # AI analysis results if available

# TODO: Implement validation and additional fields as necessary