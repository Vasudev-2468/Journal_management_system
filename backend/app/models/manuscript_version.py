"""Version history for a submitted manuscript.

Every revision creates a new row — the manuscript timeline is never
overwritten. The active version has `is_current=True`; there is at most
one current version per submission, enforced by a partial unique index.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ManuscriptVersion(Base):
    __tablename__ = "manuscript_versions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False)
    label = Column(String(80), nullable=False, default="original")  # original / revised-1 / revised-N / final
    cover_letter = Column(Text, nullable=True)
    response_to_reviewers = Column(Text, nullable=True)
    change_summary = Column(Text, nullable=True)
    is_current = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    files = relationship(
        "ManuscriptFile",
        back_populates="version",
        cascade="all, delete-orphan",
        order_by="ManuscriptFile.id",
    )
