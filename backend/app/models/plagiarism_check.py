"""Persistent record of a plagiarism/similarity check run.

Every call to POST /ai/plagiarism writes one row here so editors can review
the history of screenings a submission has been through — including who ran
each check, the score, and (when applicable) the top-matching corpus article.

`text_hash` is a SHA-256 hex digest of the text we scored; storing the hash
rather than the text keeps the row small and lets us detect duplicate submissions
without storing the manuscript body in a second place.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class PlagiarismCheck(Base):
    __tablename__ = "plagiarism_checks"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(String(64), nullable=True, index=True)
    text_hash = Column(String(64), nullable=False, index=True)
    score = Column(Integer, nullable=False, default=0)
    top_match_id = Column(
        Integer,
        ForeignKey("articles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
