"""Immutable audit trail for DOI lifecycle events (spec §12).

Every DOI operation an editor performs — eligibility check, assignment,
registration, retry, deactivation — writes exactly one row here.
Nothing on this table is ever updated; the log is append-only so a
future compliance query can answer "who assigned this DOI, when, and
under what authorization?" without ambiguity.

The audit is separate from ``audit_logs`` (generic editor actions)
because DOI events have their own vocabulary (previous/new status,
proposed DOI, registration response snippet) that don't fit the
generic table cleanly.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class DoiAuditLog(Base):
    __tablename__ = "doi_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    # submission_id is denormalised so an audit query can join back to
    # the manuscript-level history without re-hopping through articles.
    submission_id = Column(String(64), nullable=True, index=True)

    action = Column(String(64), nullable=False, index=True)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    performed_by_email = Column(String(255), nullable=True)
    performed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    previous_status = Column(String(32), nullable=True)
    new_status = Column(String(32), nullable=True)
    proposed_doi = Column(String(200), nullable=True)
    reason = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    meta = Column(JSONB, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<DoiAuditLog(id={self.id}, article={self.article_id}, "
            f"action={self.action}, {self.previous_status}→{self.new_status})>"
        )
