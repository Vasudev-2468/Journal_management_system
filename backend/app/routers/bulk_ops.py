"""Bulk operations router (editor-gated).

Multi-select actions for the editor dashboard: bulk submission patches,
bulk announcement publish/unpublish, and bulk announcement delete.

Every action leaves an ``audit_logs`` row with ``action='bulk_ops.*'`` and
the affected ids in ``meta`` so an admin can trace who did what.
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.announcement import Announcement
from app.models.audit_log import AuditLog
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────

# Only these submission fields may be bulk-patched. Anything else in the
# ``patch`` dict is silently ignored — the endpoint's contract is to accept
# a partial patch and only apply the allow-listed keys.
_ALLOWED_SUBMISSION_PATCH_FIELDS = {"status", "consult_party_email"}


def _record_audit(
    db: Session,
    *,
    action: str,
    actor: Optional[User],
    ip: Optional[str],
    ids: List[Any],
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Append one audit_logs row summarising a bulk action."""
    meta: Dict[str, Any] = {"ids": [str(x) for x in ids]}
    if extra:
        meta.update(extra)
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        target_type=None,
        target_id=None,
        ip_address=ip,
        meta=meta,
    )
    db.add(entry)


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


# ── Request schemas ────────────────────────────────────────

class BulkSubmissionUpdateRequest(BaseModel):
    ids: List[uuid.UUID] = Field(..., min_length=1)
    patch: Dict[str, Any] = Field(..., description="Partial patch (only status / consult_party_email honoured).")


class BulkAnnouncementPublishRequest(BaseModel):
    ids: List[int] = Field(..., min_length=1)
    is_published: bool


class BulkAnnouncementDeleteRequest(BaseModel):
    ids: List[int] = Field(..., min_length=1)


class BulkResult(BaseModel):
    updated: int = 0
    skipped: int = 0
    deleted: int = 0


# ── Submissions ────────────────────────────────────────────

@router.post("/submissions/update", response_model=BulkResult)
def bulk_update_submissions(
    body: BulkSubmissionUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    """Apply the allow-listed subset of ``body.patch`` to every submission
    whose id is in ``body.ids``. Missing rows are counted as ``skipped``.
    """
    # Build the effective patch: silently drop keys not on the allow-list.
    effective: Dict[str, Any] = {
        k: v for k, v in body.patch.items() if k in _ALLOWED_SUBMISSION_PATCH_FIELDS
    }

    updated = 0
    skipped = 0

    for submission_id in body.ids:
        row = (
            db.query(Submission)
            .filter(Submission.id == submission_id)
            .first()
        )
        if row is None:
            skipped += 1
            continue

        for key, value in effective.items():
            if key == "status":
                # Validate the incoming status against the enum; skip the
                # row (don't raise) so a single bad value doesn't abort a
                # bulk request that would otherwise succeed on N-1 rows.
                try:
                    value = SubmissionStatus(value)
                except ValueError:
                    continue
            setattr(row, key, value)

        updated += 1

    _record_audit(
        db,
        action="bulk_ops.submissions.update",
        actor=editor,
        ip=_client_ip(request),
        ids=body.ids,
        extra={"patch": effective},
    )
    db.commit()

    return BulkResult(updated=updated, skipped=skipped)


# ── Announcements ──────────────────────────────────────────

@router.post("/announcements/publish", response_model=BulkResult)
def bulk_publish_announcements(
    body: BulkAnnouncementPublishRequest,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    """Set ``is_published`` on every matching announcement in one round trip."""
    updated = 0
    skipped = 0

    for aid in body.ids:
        row = db.query(Announcement).filter(Announcement.id == aid).first()
        if row is None:
            skipped += 1
            continue
        row.is_published = bool(body.is_published)
        updated += 1

    _record_audit(
        db,
        action="bulk_ops.announcements.publish",
        actor=editor,
        ip=_client_ip(request),
        ids=body.ids,
        extra={"is_published": bool(body.is_published)},
    )
    db.commit()

    return BulkResult(updated=updated, skipped=skipped)


@router.post("/announcements/delete", response_model=BulkResult)
def bulk_delete_announcements(
    body: BulkAnnouncementDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    """Delete every matching announcement. Missing rows are counted as skipped."""
    deleted = 0
    skipped = 0

    for aid in body.ids:
        row = db.query(Announcement).filter(Announcement.id == aid).first()
        if row is None:
            skipped += 1
            continue
        db.delete(row)
        deleted += 1

    _record_audit(
        db,
        action="bulk_ops.announcements.delete",
        actor=editor,
        ip=_client_ip(request),
        ids=body.ids,
    )
    db.commit()

    return BulkResult(deleted=deleted, skipped=skipped)
