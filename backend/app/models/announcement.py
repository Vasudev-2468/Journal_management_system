"""News, announcements, and Call-for-Papers items shown on the public home page."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    kind = Column(String(30), nullable=False, default="news")  # news | cfp | update
    link_url = Column(String(500), nullable=True)
    is_published = Column(Boolean, nullable=False, default=True)
    published_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Multi-journal scaffolding (additive). NULL = primary journal.
    # See app.services.tenancy.
    journal_id = Column(Integer, ForeignKey("journals.id"), nullable=True, index=True)
