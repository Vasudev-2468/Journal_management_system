"""Editorial comment moderation endpoints (JG-Editor-Moderation).

The reviewer comments never go directly to the author — every reviewer
comment first enters an editor-controlled moderation stage. This
router exposes:

  GET  /comment-moderation/{submission_id}         → workspace payload
  PATCH /comment-moderation/{submission_id}/{key}  → save per-comment
  POST /comment-moderation/{submission_id}/release → release all
                                                     AUTHOR_VISIBLE +
                                                     EDITOR_APPROVED
                                                     comments to author

The workspace payload includes:
  * The reviewer comments (original + edited + editor_note + status +
    visibility) for the submission's current round.
  * The Editorial Comment Moderation Agent's per-comment suggestions
    (harsh language, identity leaks, duplicates, softened wording).
  * A per-reviewer rollup counter.
"""

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment_moderation import (
    CommentModeration,
    STATUS_EDITOR_APPROVED, STATUS_EDITOR_EDITED, STATUS_EDITOR_REMOVED,
    STATUS_EDITOR_CONFIDENTIAL, STATUS_EDITOR_REVIEW, STATUS_RELEASED_TO_AUTHOR,
    VIS_AUTHOR_VISIBLE, VIS_CONFIDENTIAL, VIS_EDITOR_ONLY, VIS_REMOVED,
)
from app.models.review import Review, ReviewState
from app.models.submission import Submission
from app.services.editor_auth import require_editor_mfa


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class CommentRow(BaseModel):
    key: str                          # "{review_id}:{kind}:{index}"
    review_id: str
    reviewer_display_name: str
    comment_kind: str
    comment_index: int
    original_text: str
    edited_text: Optional[str] = None
    editor_note: Optional[str] = None
    status: str
    visibility: str
    consolidated_into: Optional[int] = None
    released_at: Optional[datetime] = None


class AgentSuggestion(BaseModel):
    flags: List[str] = []
    reasons: List[str] = []
    duplicate_of: List[Dict[str, Any]] = []
    suggested_edit: Optional[str] = None


class ReviewerRollup(BaseModel):
    reviewer_display_name: str
    total: int
    approved: int
    edited: int
    removed: int
    confidential: int
    pending: int


class ModerationWorkspace(BaseModel):
    submission_id: str
    round_number: int
    comments: List[CommentRow]
    per_reviewer: List[ReviewerRollup]
    suggestions: Dict[str, AgentSuggestion]  # keyed by CommentRow.key
    released_at: Optional[datetime] = None


# ── Helpers ─────────────────────────────────────────────

def _load_list(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:  # noqa: BLE001
        return []


def _extract_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("comment") or item.get("text") or "")
    return ""


def _get_or_create_moderation(
    db: Session, review: Review, kind: str, index: int, original_text: str,
) -> CommentModeration:
    row = (
        db.query(CommentModeration)
        .filter(
            CommentModeration.review_id == review.id,
            CommentModeration.comment_kind == kind,
            CommentModeration.comment_index == index,
        )
        .first()
    )
    if row is None:
        row = CommentModeration(
            review_id=review.id,
            comment_kind=kind,
            comment_index=index,
            original_text=original_text,
            status=STATUS_EDITOR_REVIEW,
            visibility=VIS_AUTHOR_VISIBLE,
        )
        db.add(row)
        db.flush()
    return row


# ── GET workspace ───────────────────────────────────────

@router.get(
    "/{submission_id}",
    response_model=ModerationWorkspace,
)
def get_moderation_workspace(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Assemble the editor's moderation workspace for one submission."""
    from app.agents.comment_moderation_agent import analyze_comments

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = sorted(
        [r for r in (submission.reviews or []) if r.state == ReviewState.submitted],
        key=lambda r: r.assigned_at or datetime.min,
    )
    if not reviews:
        return ModerationWorkspace(
            submission_id=str(submission.id),
            round_number=1,
            comments=[], per_reviewer=[], suggestions={},
        )

    target_round = max((r.round_number or 1 for r in reviews), default=1)
    current = [r for r in reviews if (r.round_number or 1) == target_round]

    # Build (or backfill) a moderation row for every comment in the
    # current round.
    rows_out: List[CommentRow] = []
    per_reviewer: List[ReviewerRollup] = []
    for i, r in enumerate(current, start=1):
        display = f"Reviewer #{i}"
        rollup = ReviewerRollup(
            reviewer_display_name=display,
            total=0, approved=0, edited=0, removed=0, confidential=0, pending=0,
        )
        for kind, raw in (("major", r.major_comments), ("minor", r.minor_comments)):
            for idx, item in enumerate(_load_list(raw)):
                text = _extract_text(item)
                if not text.strip():
                    continue
                mod = _get_or_create_moderation(db, r, kind, idx, text)
                rows_out.append(CommentRow(
                    key=f"{r.id}:{kind}:{idx}",
                    review_id=str(r.id),
                    reviewer_display_name=display,
                    comment_kind=kind,
                    comment_index=idx,
                    original_text=mod.original_text,
                    edited_text=mod.edited_text,
                    editor_note=mod.editor_note,
                    status=mod.status,
                    visibility=mod.visibility,
                    consolidated_into=mod.consolidated_into,
                    released_at=mod.released_at,
                ))
                rollup.total += 1
                if mod.status == STATUS_EDITOR_APPROVED:
                    rollup.approved += 1
                elif mod.status == STATUS_EDITOR_EDITED:
                    rollup.edited += 1
                elif mod.status == STATUS_EDITOR_REMOVED:
                    rollup.removed += 1
                elif mod.status == STATUS_EDITOR_CONFIDENTIAL:
                    rollup.confidential += 1
                else:
                    rollup.pending += 1
        per_reviewer.append(rollup)
    db.commit()

    suggestions_raw = analyze_comments(db, submission.id)
    suggestions_out: Dict[str, AgentSuggestion] = {
        k: AgentSuggestion(
            flags=s.flags,
            reasons=s.reasons,
            duplicate_of=s.duplicate_of,
            suggested_edit=s.suggested_edit,
        )
        for k, s in suggestions_raw.items()
    }

    # released_at — if every moderation row for the current round is
    # RELEASED_TO_AUTHOR, surface the newest released_at as the workspace timestamp.
    all_rows = [
        r for r in db.query(CommentModeration).filter(
            CommentModeration.review_id.in_([rv.id for rv in current]),
        ).all()
    ]
    released_at = None
    if all_rows and all(r.status == STATUS_RELEASED_TO_AUTHOR for r in all_rows):
        released_at = max((r.released_at for r in all_rows if r.released_at), default=None)

    return ModerationWorkspace(
        submission_id=str(submission.id),
        round_number=target_round,
        comments=rows_out,
        per_reviewer=per_reviewer,
        suggestions=suggestions_out,
        released_at=released_at,
    )


# ── PATCH one comment ───────────────────────────────────

_VALID_STATUS = {
    STATUS_EDITOR_REVIEW, STATUS_EDITOR_APPROVED, STATUS_EDITOR_EDITED,
    STATUS_EDITOR_REMOVED, STATUS_EDITOR_CONFIDENTIAL,
}
_VALID_VISIBILITY = {VIS_AUTHOR_VISIBLE, VIS_EDITOR_ONLY, VIS_CONFIDENTIAL, VIS_REMOVED}


class UpdateModerationRequest(BaseModel):
    # All three optional — the editor may PATCH just the status, or
    # just the edited text, etc. Explicit ``None`` cannot be set for
    # ``status`` / ``visibility`` because the FSM requires a value.
    edited_text: Optional[str] = None
    editor_note: Optional[str] = None
    status: Optional[str] = Field(default=None)
    visibility: Optional[str] = Field(default=None)


@router.patch(
    "/{submission_id}/{key}",
    response_model=CommentRow,
)
def patch_moderation(
    submission_id: uuid.UUID,
    key: str,
    payload: UpdateModerationRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Update the moderation state of a single comment.

    ``key`` is the address string ``{review_id}:{kind}:{index}`` — same
    shape returned by GET so the frontend can send it back verbatim.
    """
    try:
        rid_str, kind, idx_str = key.split(":")
        review_id = uuid.UUID(rid_str)
        idx = int(idx_str)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Malformed moderation key.")

    if kind not in ("major", "minor"):
        raise HTTPException(status_code=400, detail="comment_kind must be 'major' or 'minor'.")

    row = (
        db.query(CommentModeration)
        .filter(
            CommentModeration.review_id == review_id,
            CommentModeration.comment_kind == kind,
            CommentModeration.comment_index == idx,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Moderation row not found — open workspace first to backfill.")

    if payload.status is not None:
        if payload.status not in _VALID_STATUS:
            raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(_VALID_STATUS)}")
        row.status = payload.status
        # Convenience: EDITOR_EDITED / EDITOR_REMOVED / EDITOR_CONFIDENTIAL
        # imply a visibility default. The editor can still override
        # visibility explicitly in the same PATCH.
        if payload.visibility is None:
            if payload.status == STATUS_EDITOR_REMOVED:
                row.visibility = VIS_REMOVED
            elif payload.status == STATUS_EDITOR_CONFIDENTIAL:
                row.visibility = VIS_CONFIDENTIAL

    if payload.visibility is not None:
        if payload.visibility not in _VALID_VISIBILITY:
            raise HTTPException(status_code=400, detail=f"Invalid visibility. Allowed: {sorted(_VALID_VISIBILITY)}")
        row.visibility = payload.visibility

    if payload.edited_text is not None:
        row.edited_text = payload.edited_text
        # Editing implicitly flips status to EDITOR_EDITED unless the
        # editor already set a terminal state.
        if row.status == STATUS_EDITOR_REVIEW:
            row.status = STATUS_EDITOR_EDITED

    if payload.editor_note is not None:
        row.editor_note = payload.editor_note

    db.commit()
    db.refresh(row)

    return CommentRow(
        key=key,
        review_id=str(row.review_id),
        reviewer_display_name="",   # populated only from workspace GET; safe to leave blank on PATCH
        comment_kind=row.comment_kind,
        comment_index=row.comment_index,
        original_text=row.original_text,
        edited_text=row.edited_text,
        editor_note=row.editor_note,
        status=row.status,
        visibility=row.visibility,
        consolidated_into=row.consolidated_into,
        released_at=row.released_at,
    )


# ── Release-to-author ───────────────────────────────────

class ReleaseResponse(BaseModel):
    ok: bool = True
    submission_id: str
    released_count: int
    withheld_count: int


@router.post(
    "/{submission_id}/release",
    response_model=ReleaseResponse,
)
def release_to_author(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    editor=Depends(require_editor_mfa),
):
    """Mark every moderation row for the current round as released.

    Only rows with ``visibility == AUTHOR_VISIBLE`` become RELEASED_TO_AUTHOR
    with ``released_text`` populated from ``edited_text or original_text``.
    Confidential / removed rows are left as-is — the author-facing
    endpoint filters on ``status == RELEASED_TO_AUTHOR AND visibility ==
    AUTHOR_VISIBLE`` so those rows will never leak.
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = [r for r in (submission.reviews or []) if r.state == ReviewState.submitted]
    if not reviews:
        raise HTTPException(status_code=400, detail="No submitted reviews to release.")
    target_round = max((r.round_number or 1 for r in reviews), default=1)
    current_review_ids = [r.id for r in reviews if (r.round_number or 1) == target_round]

    rows = (
        db.query(CommentModeration)
        .filter(CommentModeration.review_id.in_(current_review_ids))
        .all()
    )
    now = datetime.utcnow()
    released = 0
    withheld = 0
    editor_id = getattr(editor, "id", None)
    for row in rows:
        if row.visibility == VIS_AUTHOR_VISIBLE and row.status != STATUS_EDITOR_REMOVED:
            row.status = STATUS_RELEASED_TO_AUTHOR
            row.released_text = row.edited_text or row.original_text
            row.released_at = now
            row.released_by = editor_id
            released += 1
        else:
            withheld += 1

    db.commit()

    return ReleaseResponse(
        submission_id=str(submission_id),
        released_count=released,
        withheld_count=withheld,
    )
