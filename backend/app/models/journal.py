from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Journal(Base):
    __tablename__ = 'journals'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    # ── Publication identity (JG-101) ────────────────────
    # One source of truth for masthead, DOI metadata, Scholar tags,
    # citation export and the public footer. Every field except licence
    # is nullable — a fresh journal fills these in as they are earned.
    issn_online = Column(String(20), nullable=True)
    issn_print = Column(String(20), nullable=True)
    abbreviation = Column(String(100), nullable=True)
    subject_area = Column(String(200), nullable=True)
    language = Column(String(50), nullable=True)
    start_year = Column(Integer, nullable=True)
    frequency = Column(String(100), nullable=True)
    publisher_name = Column(String(200), nullable=True)
    publisher_address = Column(Text, nullable=True)
    licence = Column(String(50), nullable=False, default='CC-BY-4.0')
    doi_prefix = Column(String(50), nullable=True)
    oai_identifier_prefix = Column(String(200), nullable=True)

    # Which record represents the currently-active JGAIR journal.
    # Only one row should carry is_active=True; GET /journals/current returns it.
    is_active = Column(Boolean, nullable=False, default=False)

    # ── Contact block (added by h4d8e5f6a2c1) ─────────────
    # Rendered by the public ContactPage sidebar when populated.
    phone = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)
    twitter_url = Column(String(300), nullable=True)
    linkedin_url = Column(String(300), nullable=True)
    email_editorial = Column(String(200), nullable=True)
    email_publisher = Column(String(200), nullable=True)

    articles = relationship("Article", back_populates="journal")
