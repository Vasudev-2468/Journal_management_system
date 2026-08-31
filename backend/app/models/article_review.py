"""Simple article-attached reader review.

This is distinct from :class:`app.models.review.Review`, which is the formal
peer-review record tied to a Submission through a token-gated flow. An
ArticleReview is a lightweight rating + notes left by an authenticated user
against a published :class:`Article` — JG-403.
"""

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class ArticleReview(Base):
    __tablename__ = "article_reviews"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(
        Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    rating = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    article = relationship("Article", backref="article_reviews")
    reviewer = relationship("User")
