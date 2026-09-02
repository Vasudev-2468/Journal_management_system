"""Immutable audit trail for submission state transitions (spec §14, §43).

The submission state machine (``services/state_machine.py``) writes one
row here per legal transition. Nothing is ever updated — the log is
append-only so we can answer "how did this manuscript get from
under_review to accepted?" without ambiguity.

Attempted illegal transitions also land here with ``allowed=False`` so
we can see who tried what without needing debug logs.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class SubmissionTransition(Base):
    __tablename__ = "submission_transitions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(String(64), nullable=False, index=True)
    from_status = Column(String(32), nullable=True)
    to_status = Column(String(32), nullable=False, index=True)
    allowed = Column(Boolean, nullable=False, default=True)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    performed_by_email = Column(String(255), nullable=True)
    performed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    reason = Column(Text, nullable=True)
