"""Journal Volume + Issue and their per-article link."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Volume(Base):
    __tablename__ = "volumes"

    id = Column(Integer, primary_key=True, index=True)
    journal_id = Column(Integer, ForeignKey("journals.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    issues = relationship(
        "Issue", back_populates="volume", cascade="all, delete-orphan", order_by="Issue.number"
    )

    __table_args__ = (
        UniqueConstraint("journal_id", "number", name="uq_volumes_journal_number"),
    )


class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    volume_id = Column(Integer, ForeignKey("volumes.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    title = Column(String(300), nullable=True)
    theme = Column(String(300), nullable=True)
    month = Column(String(20), nullable=True)
    status = Column(String(30), nullable=False, default="planned")  # planned | accepting | published
    editorial_note = Column(Text, nullable=True)
    deadline = Column(String(80), nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    volume = relationship("Volume", back_populates="issues")
    article_links = relationship(
        "IssueArticle",
        back_populates="issue",
        cascade="all, delete-orphan",
        order_by="IssueArticle.sequence",
    )

    __table_args__ = (
        UniqueConstraint("volume_id", "number", name="uq_issues_volume_number"),
    )


class IssueArticle(Base):
    """Join row linking an Article to a published Issue with per-issue metadata."""

    __tablename__ = "issue_articles"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(
        Integer, ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    article_id = Column(
        Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence = Column(Integer, nullable=False, default=1)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    doi = Column(String(200), nullable=True, unique=True)
    category = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    issue = relationship("Issue", back_populates="article_links")
    article = relationship("Article")

    __table_args__ = (
        UniqueConstraint("issue_id", "article_id", name="uq_issue_articles_issue_article"),
    )
