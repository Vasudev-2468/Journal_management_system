"""CSV export router (editor-gated).

Streams CSV downloads for the editor's core lists — submissions, reviewers,
announcements, and the audit log. Uses only Python's stdlib ``csv`` module
so no new dependency is introduced. Each response carries a filename with
today's date so browsers save distinct files without prompting.
"""

import csv
from datetime import datetime
from io import StringIO
from typing import List, Sequence

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.announcement import Announcement
from app.models.audit_log import AuditLog
from app.models.reviewer import Reviewer
from app.models.submission import Submission
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────

def _fmt(value) -> str:
    """CSV-safe rendering of a scalar value."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value"):  # SQLAlchemy enum wrappers
        try:
            return str(value.value)
        except Exception:  # pragma: no cover — defensive
            return str(value)
    return str(value)


def _csv_response(headers: Sequence[str], rows: List[List], kind: str) -> Response:
    """Serialise ``rows`` (each a list matching ``headers``) into a CSV
    response with a dated attachment filename."""
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(list(headers))
    for row in rows:
        writer.writerow([_fmt(cell) for cell in row])
    stamp = datetime.utcnow().strftime("%Y%m%d")
    filename = f"{kind}-{stamp}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Type": "text/csv",
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ── Submissions ────────────────────────────────────────────

@router.get("/submissions")
def export_submissions(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    headers = [
        "paper_id_code",
        "paper_title",
        "author_name",
        "author_email",
        "status",
        "submitted_at",
        "updated_at",
        "classified_field",
        "classification_confidence",
    ]
    rows = []
    for s in db.query(Submission).order_by(Submission.submitted_at.desc()).all():
        rows.append(
            [
                s.paper_id_code,
                s.paper_title,
                s.author_name,
                s.author_email,
                s.status,
                s.submitted_at,
                s.updated_at,
                s.classified_field,
                s.classification_confidence,
            ]
        )
    return _csv_response(headers, rows, "submissions")


# ── Reviewers ──────────────────────────────────────────────

@router.get("/reviewers")
def export_reviewers(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    headers = [
        "name",
        "email",
        "institution",
        "expertise_tags",
        "current_load",
        "max_assignments",
        "is_active",
        "created_at",
    ]
    rows = []
    for r in db.query(Reviewer).order_by(Reviewer.created_at.desc()).all():
        tags = ";".join(r.expertise_tags or [])
        rows.append(
            [
                r.name,
                r.email,
                r.institution,
                tags,
                r.current_load,
                r.max_assignments,
                r.is_active,
                r.created_at,
            ]
        )
    return _csv_response(headers, rows, "reviewers")


# ── Announcements ──────────────────────────────────────────

@router.get("/announcements")
def export_announcements(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    headers = [
        "id",
        "title",
        "body",
        "kind",
        "link_url",
        "is_published",
        "published_at",
        "expires_at",
        "created_at",
        "updated_at",
    ]
    rows = []
    for a in db.query(Announcement).order_by(Announcement.published_at.desc()).all():
        rows.append(
            [
                a.id,
                a.title,
                a.body,
                a.kind,
                a.link_url,
                a.is_published,
                a.published_at,
                a.expires_at,
                a.created_at,
                a.updated_at,
            ]
        )
    return _csv_response(headers, rows, "announcements")


# ── Audit log ──────────────────────────────────────────────

@router.get("/audit-log")
def export_audit_log(
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    headers = [
        "id",
        "created_at",
        "actor_email",
        "action",
        "target_type",
        "target_id",
        "ip_address",
        "meta",
    ]
    rows = []
    query = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    for entry in query:
        rows.append(
            [
                entry.id,
                entry.created_at,
                entry.actor_email,
                entry.action,
                entry.target_type,
                entry.target_id,
                entry.ip_address,
                entry.meta,
            ]
        )
    return _csv_response(headers, rows, "audit-log")
