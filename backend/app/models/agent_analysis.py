"""Persisted Agent Analysis briefings (spec: Layer-2 audit separation).

Every call to the Editorial Decision Agent's ``build_briefing(...)``
should also persist its output here, so an editor can:

* Compare briefings across rounds (was the AI's confidence rising?)
* See which briefing informed a decision (transition audit points at
  a briefing_id)
* Reconstruct what the AI advised at the moment of the editor's
  decision, even after later reviews arrive that would produce a
  different suggestion today.

Append-only. Never mutated after write. ``rebuild`` on demand simply
adds a new row.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AgentAnalysis(Base):
    __tablename__ = "agent_analysis"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Which agent produced this row. The Editorial Decision Agent is
    # the first writer here — Reviewer Analysis / Ethics Screening
    # slot into the same table.
    agent_name = Column(String(120), nullable=False, index=True)

    # Round marker so decision rounds are diffable. NULL means "unbound"
    # (agent produced the briefing outside a specific round).
    round_number = Column(Integer, nullable=True, index=True)

    # Structured payload — the full DecisionBriefing serialised as JSON.
    # Kept as a JSON column rather than typed columns so the schema
    # doesn't need to migrate every time the briefing shape gains a
    # field (confidence was added mid-flight; more will follow).
    payload = Column(JSON, nullable=False)

    # Denormalised for quick indexing without loading payload.
    suggested_decision = Column(String(80), nullable=True, index=True)
    confidence = Column(String(20), nullable=True)  # high / medium / low
    reviews_received = Column(Integer, nullable=True)
    reviews_expected = Column(Integer, nullable=True)

    # Notes an editor may add before decision — e.g. "override rationale
    # captured on transition". Immutable once written.
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<AgentAnalysis id={self.id} agent={self.agent_name} "
            f"submission={self.submission_id} suggested={self.suggested_decision}>"
        )
