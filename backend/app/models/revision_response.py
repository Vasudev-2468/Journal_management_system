"""
Author revision responses (spec §18).

One row per (review comment, author response) — the author pairs
their response text and the location of the change in the revised
manuscript against each Major/Minor reviewer comment. The editor's
revision-checklist endpoint aggregates comments across every
reviewer's Major/Minor lists; this table stores the author's answer
to each item.

``review_id + comment_kind + comment_index`` uniquely identifies the
source reviewer comment. It's not a FK because the comments live
inside a JSON blob on the Review row — the composite key is what
gives us referential integrity without normalising the comment list
into its own table.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class RevisionResponse(Base):
    __tablename__ = "revision_responses"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    review_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    round_number = Column(Integer, nullable=False, default=1, server_default="1")

    # Locates the reviewer comment inside the Review's JSON blob.
    #   comment_kind  ∈ {"major", "minor"}
    #   comment_index — 0-indexed position within that list
    comment_kind = Column(String(8), nullable=False)
    comment_index = Column(Integer, nullable=False)

    # Author's response payload.
    response_text = Column(Text, nullable=False, default="")
    change_location = Column(String(500), nullable=False, default="")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint(
            "review_id", "comment_kind", "comment_index",
            name="uq_revision_response_comment",
        ),
    )
