"""Revision Comparison (V1 ↔ V2) endpoints.

Reviewers in round 2 need to see what the author actually changed —
otherwise the second review is a re-read of the whole manuscript. This
router surfaces:

* GET /revision-comparison/submissions/{submission_id}/versions
    Every ManuscriptVersion for the submission, newest first: version
    number, label, cover letter, change summary, response to reviewers.

* GET /revision-comparison/submissions/{submission_id}/diff?from=N&to=M
    Structured "what changed between v{from} and v{to}" — the author's
    change summary + response to reviewers on the target version.
    Includes file diffs at file-metadata level (filename / kind / size).
    The endpoint deliberately doesn't try to diff PDF content in place —
    the reviewer opens both PDFs from the returned file list.

Ownership: any assigned reviewer OR the paper's author OR an editor.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.manuscript_version import ManuscriptVersion
from app.models.review import Review
from app.models.submission import Submission


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class VersionFile(BaseModel):
    id: str
    filename: str
    kind: Optional[str] = None
    size_bytes: Optional[int] = None


class VersionRow(BaseModel):
    id: int
    version_number: int
    label: str
    cover_letter: Optional[str] = None
    response_to_reviewers: Optional[str] = None
    change_summary: Optional[str] = None
    is_current: bool
    created_at: datetime
    files: List[VersionFile] = []


class FileDiff(BaseModel):
    filename: str
    change: str          # "added" | "removed" | "unchanged" | "modified"
    from_size: Optional[int] = None
    to_size: Optional[int] = None
    kind: Optional[str] = None


class DiffResponse(BaseModel):
    submission_id: str
    from_version: VersionRow
    to_version: VersionRow
    file_changes: List[FileDiff]
    author_summary: Optional[str] = None
    response_to_reviewers: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────

def _authorised(db: Session, submission_id: uuid.UUID, user) -> Submission:
    """Ownership: assigned reviewer OR author OR editor. Returns the
    submission or raises 403 / 404."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    # Author path — author_id matches the current session user.
    author_id = getattr(submission, "author_id", None)
    if author_id is not None and getattr(user, "id", None) == author_id:
        return submission
    # Reviewer path — user is a Reviewer with a Review row on this submission.
    reviewer_id = getattr(user, "id", None)
    if reviewer_id is not None:
        r = (
            db.query(Review)
            .filter(
                Review.submission_id == submission_id,
                Review.reviewer_id == reviewer_id,
            )
            .first()
        )
        if r is not None:
            return submission
    # Editor path — the User model exposes an `is_staff`-shaped flag.
    role = getattr(user, "role", None)
    if role is not None:
        role_v = getattr(role, "value", str(role)).lower()
        if role_v in {"editor", "managing_editor", "admin", "super_admin", "section_editor"}:
            return submission
    raise HTTPException(status_code=403, detail="Not authorised to see this submission.")


def _to_row(v: ManuscriptVersion) -> VersionRow:
    files = [
        VersionFile(
            id=str(f.id),
            filename=f.original_filename or "manuscript",
            kind=f.kind,
            size_bytes=f.size_bytes,
        )
        for f in (v.files or [])
    ]
    return VersionRow(
        id=v.id,
        version_number=v.version_number,
        label=v.label,
        cover_letter=v.cover_letter,
        response_to_reviewers=v.response_to_reviewers,
        change_summary=v.change_summary,
        is_current=v.is_current,
        created_at=v.created_at,
        files=files,
    )


def _load_version(db: Session, submission_id: uuid.UUID, version_number: int) -> ManuscriptVersion:
    v = (
        db.query(ManuscriptVersion)
        .options(joinedload(ManuscriptVersion.files))
        .filter(
            ManuscriptVersion.submission_id == submission_id,
            ManuscriptVersion.version_number == version_number,
        )
        .first()
    )
    if v is None:
        raise HTTPException(
            status_code=404,
            detail=f"Version {version_number} not found for this submission.",
        )
    return v


def _file_diff(from_files, to_files) -> List[FileDiff]:
    from_map = {f.original_filename or "manuscript": f for f in (from_files or [])}
    to_map   = {f.original_filename or "manuscript": f for f in (to_files or [])}
    seen = set()
    out: List[FileDiff] = []
    for name, f_to in to_map.items():
        f_from = from_map.get(name)
        seen.add(name)
        if f_from is None:
            out.append(FileDiff(
                filename=name, change="added",
                from_size=None, to_size=f_to.size_bytes, kind=f_to.kind,
            ))
        elif (f_from.size_bytes or 0) != (f_to.size_bytes or 0):
            out.append(FileDiff(
                filename=name, change="modified",
                from_size=f_from.size_bytes, to_size=f_to.size_bytes, kind=f_to.kind,
            ))
        else:
            out.append(FileDiff(
                filename=name, change="unchanged",
                from_size=f_from.size_bytes, to_size=f_to.size_bytes, kind=f_to.kind,
            ))
    for name, f_from in from_map.items():
        if name in seen:
            continue
        out.append(FileDiff(
            filename=name, change="removed",
            from_size=f_from.size_bytes, to_size=None, kind=f_from.kind,
        ))
    return out


# ── Endpoints ───────────────────────────────────────────

# Editors/reviewers use the plain JWT auth-service dependency; the same
# lookup pattern the rest of the app uses (see author_revision.py).
from app.services.auth_service import get_current_user


@router.get(
    "/submissions/{submission_id}/versions",
    response_model=List[VersionRow],
)
def list_versions(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> List[VersionRow]:
    """Every ManuscriptVersion for the submission, newest first."""
    _authorised(db, submission_id, user)
    versions = (
        db.query(ManuscriptVersion)
        .options(joinedload(ManuscriptVersion.files))
        .filter(ManuscriptVersion.submission_id == submission_id)
        .order_by(ManuscriptVersion.version_number.desc())
        .all()
    )
    return [_to_row(v) for v in versions]


@router.get(
    "/submissions/{submission_id}/diff",
    response_model=DiffResponse,
)
def diff_versions(
    submission_id: uuid.UUID,
    from_version: int,
    to_version: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> DiffResponse:
    """Structured diff between two versions on this submission.

    The endpoint returns file-metadata changes and the author's textual
    change summary + response-to-reviewers on the *to* version. It
    deliberately does not attempt PDF content diffing — that belongs
    in the reviewer's side-by-side viewer, which uses the two file
    URLs from ``VersionRow.files``.
    """
    _authorised(db, submission_id, user)
    if from_version == to_version:
        raise HTTPException(
            status_code=400,
            detail="from_version and to_version must be different.",
        )
    v_from = _load_version(db, submission_id, from_version)
    v_to = _load_version(db, submission_id, to_version)
    return DiffResponse(
        submission_id=str(submission_id),
        from_version=_to_row(v_from),
        to_version=_to_row(v_to),
        file_changes=_file_diff(v_from.files, v_to.files),
        author_summary=v_to.change_summary,
        response_to_reviewers=v_to.response_to_reviewers,
    )
