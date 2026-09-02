"""
Journal identifier lifecycle (spec §3-4).

One row per (journal_id, identifier_type). Identifier types are:
  * ISSN         — legacy print/electronic combined
  * EISSN        — electronic ISSN
  * PISSN        — print ISSN
  * DOI_PREFIX   — publisher DOI prefix (e.g. "10.12345")
  * DOI_AGENCY   — registration agency name (Crossref / DataCite / …)

Each identifier carries a state machine so the Journal Identifier
Agent knows exactly what it may report or do. Values move through:

    NOT_REQUESTED
        ↓
    APPLICATION_PREPARED
        ↓
    APPLICATION_SUBMITTED
        ↓
    UNDER_REVIEW
        ↓
    ASSIGNED
        ↓
    VERIFIED
        ↓
    ACTIVE

Terminal branches:
    REJECTED
    CORRECTION_REQUIRED

The value column is nullable at every state below ASSIGNED — the
agent must not invent one. It should be populated by the editor only
after the ISSN authority hands it back.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class IdentifierType(str, enum.Enum):
    issn = "issn"
    eissn = "eissn"
    pissn = "pissn"
    doi_prefix = "doi_prefix"
    doi_agency = "doi_agency"


class IdentifierStatus(str, enum.Enum):
    not_requested = "not_requested"
    application_prepared = "application_prepared"
    application_submitted = "application_submitted"
    under_review = "under_review"
    assigned = "assigned"
    verified = "verified"
    active = "active"
    rejected = "rejected"
    correction_required = "correction_required"


class JournalIdentifier(Base):
    __tablename__ = "journal_identifiers"

    id = Column(Integer, primary_key=True, index=True)
    journal_id = Column(
        Integer,
        ForeignKey("journals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    identifier_type = Column(
        Enum(IdentifierType, name="journal_identifier_type"),
        nullable=False,
        index=True,
    )
    status = Column(
        Enum(IdentifierStatus, name="journal_identifier_status"),
        nullable=False,
        default=IdentifierStatus.not_requested,
        server_default=IdentifierStatus.not_requested.value,
    )
    # The official value — always ``None`` until the authority hands it
    # back. The Journal Identifier Agent MUST NOT populate this.
    value = Column(String(64), nullable=True)
    # A free-text note tracking the last state change or authority
    # correspondence. Read by the agent's status endpoint.
    note = Column(Text, nullable=True)
    # Structured application payload (JSON) prepared by the agent's
    # "Prepare Application" assistant. Kept as text so schema
    # evolution doesn't need a migration.
    application_json = Column(Text, nullable=True)
    application_prepared_at = Column(DateTime, nullable=True)
    application_submitted_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    journal = relationship("Journal")

    __table_args__ = (
        UniqueConstraint("journal_id", "identifier_type", name="uq_journal_identifier"),
    )

    def __repr__(self):  # pragma: no cover — repr only
        return (
            f"<JournalIdentifier(journal={self.journal_id}, "
            f"type={self.identifier_type.value if self.identifier_type else '?'}, "
            f"status={self.status.value if self.status else '?'}, "
            f"value={self.value!r})>"
        )
