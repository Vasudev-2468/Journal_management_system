"""Editor-editable email templates.

`slug` is the internal name (e.g. submission_confirmation, reviewer_invite).
Templates use `{{placeholders}}` — the sender substitutes them at render time.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    subject = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    description = Column(String(500), nullable=True)
    placeholders = Column(String(800), nullable=True)  # comma-separated list for the UI
    is_active = Column(Boolean, nullable=False, default=True)
    updated_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
