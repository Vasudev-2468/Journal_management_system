"""Special issue / themed collection with guest editors."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class SpecialIssue(Base):
    __tablename__ = "special_issues"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=False)
    guest_editors = Column(Text, nullable=True)   # newline-separated names/affiliations
    topics = Column(Text, nullable=True)          # newline-separated topic list
    cover_image_url = Column(String(500), nullable=True)
    submission_deadline = Column(DateTime, nullable=True)
    publication_date = Column(DateTime, nullable=True)
    status = Column(String(30), nullable=False, default="open")  # open | closed | published
    is_published = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
