"""Editorial comment moderation (JG-Editor-Moderation).

Reviewer comments are never sent verbatim to the author. This table
holds the editor's moderation state per reviewer comment — the
original reviewer wording is preserved on the parent ``Review`` row's
JSON blob and NEVER modified. This companion row layers on top:

  - original_text — copied from the reviewer JSON at moderation
                    time. Denormalised so the audit trail carries the
                    exact reviewer wording even if a future admin
                    ever purges the parent JSON.
  - edited_text  — the editor's rewrite. NULL until edited.
  - visibility   — AUTHOR_VISIBLE | EDITOR_ONLY | CONFIDENTIAL | REMOVED
  - status       — EDITOR_REVIEW → EDITOR_APPROVED → RELEASED_TO_AUTHOR
                   (also EDITED / REMOVED / CONFIDENTIAL / CONSOLIDATED)
  - consolidated_into — when the editor merges duplicates, the merged
                        row(s) point at the survivor's id
  - editor_note  — internal note visible to editors only

The (review_id, comment_kind, comment_index) triple matches the
RevisionResponse addressing convention so the moderation layer speaks
the same coordinates as the response layer.

The AUTHOR-facing API must ONLY return rows with
    visibility == 'AUTHOR_VISIBLE' AND status == 'RELEASED_TO_AUTHOR'
enforced server-side in ``author_revision.author_decision_view``.
"""

from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey,
    UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


# Status finite-state machine — see the spec's table §28.
STATUS_EDITOR_REVIEW       = "EDITOR_REVIEW"
STATUS_EDITOR_EDITED       = "EDITOR_EDITED"
STATUS_EDITOR_APPROVED     = "EDITOR_APPROVED"
STATUS_EDITOR_REMOVED      = "EDITOR_REMOVED"
STATUS_EDITOR_CONFIDENTIAL = "EDITOR_CONFIDENTIAL"
STATUS_CONSOLIDATED        = "CONSOLIDATED"
STATUS_RELEASED_TO_AUTHOR  = "RELEASED_TO_AUTHOR"

# Visibility — kept separate from status per spec §29.
VIS_AUTHOR_VISIBLE = "AUTHOR_VISIBLE"
VIS_EDITOR_ONLY    = "EDITOR_ONLY"
VIS_CONFIDENTIAL   = "CONFIDENTIAL"
VIS_REMOVED        = "REMOVED"


class CommentModeration(Base):
    __tablename__ = "comment_moderations"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    comment_kind = Column(String(8), nullable=False)   # 'major' | 'minor'
    comment_index = Column(Integer, nullable=False)

    # The reviewer's original wording — copied verbatim from the parent
    # Review's JSON at moderation-record-creation time. Never modified.
    original_text = Column(Text, nullable=False)

    # The editor's rewrite. NULL until the editor edits.
    edited_text = Column(Text, nullable=True)

    # Editor-internal note that the author never sees.
    editor_note = Column(Text, nullable=True)

    status = Column(
        String(32), nullable=False,
        default=STATUS_EDITOR_REVIEW,
        server_default=STATUS_EDITOR_REVIEW,
        index=True,
    )
    visibility = Column(
        String(32), nullable=False,
        default=VIS_AUTHOR_VISIBLE,
        server_default=VIS_AUTHOR_VISIBLE,
    )

    # When merged into another moderation row, this points at the
    # survivor's id and the row's status flips to CONSOLIDATED.
    consolidated_into = Column(
        Integer,
        ForeignKey("comment_moderations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Author-visible text — computed on release. Populated with
    # ``edited_text or original_text`` at the moment of release.
    released_text = Column(Text, nullable=True)
    released_at = Column(DateTime, nullable=True)
    released_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("review_id", "comment_kind", "comment_index", name="uq_moderation_addressing"),
        Index("ix_moderation_status", "status"),
        Index("ix_moderation_visibility", "visibility"),
    )
