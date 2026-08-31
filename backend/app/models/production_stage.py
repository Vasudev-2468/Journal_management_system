"""Post-acceptance production pipeline for an accepted submission.

Each row tracks one stage: copy_editing → typesetting → proof → author_proof →
final_pdf → doi_assigned → published. A submission has at most one active
production row.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


PRODUCTION_STAGES = (
    "copy_editing",
    "typesetting",
    "proof",
    "author_proof_pending",
    "author_proof_approved",
    "final_pdf",
    "doi_assigned",
    "published",
)


class ProductionRecord(Base):
    __tablename__ = "production_records"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    stage = Column(String(40), nullable=False, default="copy_editing", index=True)
    copy_edit_notes = Column(Text, nullable=True)
    typesetting_notes = Column(Text, nullable=True)
    proof_pdf_url = Column(String(1024), nullable=True)
    author_corrections = Column(Text, nullable=True)
    final_pdf_url = Column(String(1024), nullable=True)
    doi = Column(String(200), nullable=True, unique=True)
    published_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
