"""Indexing submission tracker (spec: Indexing status dashboard).

One row per (article, service) submission. Editors log each push to
an external discovery service — DOAJ, OpenAlex, Google Scholar,
CrossRef Search, PubMed Central — and record the outcome so the
dashboard can show which articles are and aren't indexed where.

Append-only from the app's perspective: statuses are updated in
place, but rows are never deleted. Editors read the log to answer
"why isn't this paper on Google Scholar yet?" without having to
rebuild the history from ad-hoc emails.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class IndexingService(str, enum.Enum):
    doaj = "doaj"
    openalex = "openalex"
    google_scholar = "google_scholar"
    crossref = "crossref"
    pubmed_central = "pubmed_central"
    scopus = "scopus"
    web_of_science = "web_of_science"
    other = "other"


class IndexingState(str, enum.Enum):
    # Editor has queued the article for submission but nothing sent yet.
    pending = "pending"
    # Submission dispatched to the service — awaiting acknowledgement.
    submitted = "submitted"
    # Service confirmed indexing — searchable now.
    indexed = "indexed"
    # Service rejected the submission with a reason — see notes.
    rejected = "rejected"
    # Human decision — this article won't be sent to this service.
    skipped = "skipped"


class IndexingStatus(Base):
    __tablename__ = "indexing_status"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(
        Integer,
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    service = Column(
        Enum(IndexingService, name="indexing_service"),
        nullable=False, index=True,
    )
    state = Column(
        Enum(IndexingState, name="indexing_state"),
        nullable=False, default=IndexingState.pending, index=True,
    )
    # Free-text audit trail. Editors write "submitted via web form",
    # "sent XML by email", "rejected — DOI not in Crossref yet".
    notes = Column(Text, nullable=True)
    external_id = Column(String(200), nullable=True)  # e.g. OpenAlex work id
    external_url = Column(String(500), nullable=True)  # public URL once indexed

    submitted_at = Column(DateTime, nullable=True)
    indexed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    article = relationship("Article")

    def __repr__(self) -> str:  # pragma: no cover - repr only
        return (
            f"<IndexingStatus article={self.article_id} "
            f"service={self.service.value if self.service else None} "
            f"state={self.state.value if self.state else None}>"
        )
