"""Batch router for the platform-expansion features.

Grouped by domain, each mounted under its own prefix in main.py:
  - /revisions      manuscript version + file uploads (author-scoped)
  - /production     post-acceptance production pipeline (editor-scoped)
  - /special-issues themed collections (public read, editor write)
  - /email-templates editor-editable canned emails (admin)
  - /audit-logs     read-only admin trail
  - /references     per-article reference list
  - /users-admin    minimal user management (admin)
"""

from datetime import datetime
from typing import List, Optional
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference
from app.models.audit_log import AuditLog
from app.models.email_template import EmailTemplate
from app.models.manuscript_file import ManuscriptFile
from app.models.manuscript_version import ManuscriptVersion
from app.models.production_stage import ProductionRecord
from app.models.special_issue import SpecialIssue
from app.models.submission import Submission
from app.models.user import User
from app.schemas.platform import (
    ArticleReferenceCreate,
    ArticleReferenceRead,
    AuditLogRead,
    EmailTemplateCreate,
    EmailTemplateRead,
    EmailTemplateUpdate,
    ManuscriptFileCreate,
    ManuscriptVersionCreate,
    ManuscriptVersionRead,
    ProductionRead,
    ProductionUpdate,
    SpecialIssueCreate,
    SpecialIssueRead,
    SpecialIssueUpdate,
    UserAdminRead,
    UserAdminUpdate,
)
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa
from app.services.permissions import (
    ACTION_MANAGE_USERS,
    ACTION_VIEW_AUDIT,
    require_permission,
)
from app.services.state_machine import transition_or_direct


# ═══════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════

def _log(
    db: Session,
    action: str,
    *,
    actor: Optional[User] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    ip: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    row = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        ip_address=ip,
        meta=meta or {},
    )
    db.add(row)
    db.commit()


def _version_to_read(v: ManuscriptVersion) -> ManuscriptVersionRead:
    return ManuscriptVersionRead(
        id=v.id,
        submission_id=str(v.submission_id),
        version_number=v.version_number,
        label=v.label,
        cover_letter=v.cover_letter,
        response_to_reviewers=v.response_to_reviewers,
        change_summary=v.change_summary,
        is_current=v.is_current,
        created_at=v.created_at,
        files=[
            _file_to_read(f) for f in (v.files or [])
        ],
    )


def _file_to_read(f: ManuscriptFile):
    return {
        "id": f.id,
        "kind": f.kind,
        "original_filename": f.original_filename,
        "stored_url": f.stored_url,
        "mime_type": f.mime_type,
        "size_bytes": f.size_bytes,
        "created_at": f.created_at,
    }


# ═══════════════════════════════════════════════════════════
# 1. Revisions router
# ═══════════════════════════════════════════════════════════

revisions_router = APIRouter()


def _load_submission_for_author(db: Session, submission_id: _uuid.UUID, user: User) -> Submission:
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if (submission.author_email or "").lower() != (user.email or "").lower():
        raise HTTPException(status_code=403, detail="You do not own this submission")
    return submission


@revisions_router.get(
    "/submission/{submission_id}", response_model=List[ManuscriptVersionRead]
)
def list_versions_for_submission(
    submission_id: _uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    # Author sees only own; editors see everything.
    if user.role in ("editor", "section_editor", "admin"):
        pass
    elif (submission.author_email or "").lower() != (user.email or "").lower():
        raise HTTPException(status_code=403, detail="Forbidden")
    versions = (
        db.query(ManuscriptVersion)
        .options(joinedload(ManuscriptVersion.files))
        .filter(ManuscriptVersion.submission_id == submission_id)
        .order_by(ManuscriptVersion.version_number)
        .all()
    )
    return [_version_to_read(v) for v in versions]


@revisions_router.post(
    "/submission/{submission_id}",
    response_model=ManuscriptVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_revision(
    submission_id: _uuid.UUID,
    payload: ManuscriptVersionCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = _load_submission_for_author(db, submission_id, user)

    # Compute the next version number.
    latest = (
        db.query(ManuscriptVersion)
        .filter(ManuscriptVersion.submission_id == submission_id)
        .order_by(ManuscriptVersion.version_number.desc())
        .first()
    )
    next_number = 1 if latest is None else (latest.version_number + 1)
    label = payload.label or (f"revised-{next_number - 1}" if next_number > 1 else "original")

    # Mark previous current versions inactive.
    db.query(ManuscriptVersion).filter(
        ManuscriptVersion.submission_id == submission_id,
        ManuscriptVersion.is_current.is_(True),
    ).update({ManuscriptVersion.is_current: False})

    version = ManuscriptVersion(
        submission_id=submission_id,
        version_number=next_number,
        label=label,
        cover_letter=payload.cover_letter,
        response_to_reviewers=payload.response_to_reviewers,
        change_summary=payload.change_summary,
        is_current=True,
    )
    db.add(version)
    db.flush()

    for f in payload.files:
        db.add(
            ManuscriptFile(
                version_id=version.id,
                kind=f.kind,
                original_filename=f.original_filename,
                stored_url=f.stored_url,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                checksum=f.checksum,
            )
        )

    # Move the submission back into review pipeline if a revision was requested.
    if submission.status.value in ("revision_requested", "returned_to_author"):
        from app.models.submission import SubmissionStatus
        transition_or_direct(db, submission, SubmissionStatus.under_review)
    db.commit()
    db.refresh(version)

    # ── REVISION_SUBMITTED event ────────────────────────
    # Explicit event row so the editorial queue and dashboard counter
    # never depend on the email side-effect landing. Writing this row
    # is the system-of-record signal that a revision was submitted:
    # any downstream agent (queue, notification, revision-comparison,
    # audit) reacts to the row's presence, not to email delivery.
    #
    # The trigger_event carries the submission id so ``editor_portal.queue``
    # can join back to the submission by prefix match, and the row's
    # ``sent_at`` is stamped at emit time so time-based filters work.
    try:
        from app.models.notification import Notification, NotificationChannel, NotificationStatus
        event_row = Notification(
            recipient_email="editorial-queue@internal",  # sentinel — this row is an event, not a message
            channel=NotificationChannel.email,
            trigger_event=f"revision_submitted:{submission_id}",
            message_body=(
                f"Revision R{next_number} submitted for {submission.paper_title} "
                f"by {getattr(submission, 'author_name', 'author')}."
            ),
            status=NotificationStatus.sent,   # the event itself is complete
            sent_at=datetime.utcnow(),
        )
        db.add(event_row)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()  # event write must not fail the resubmit

    # ── Notify the handling editor (email side-effect) ──
    # Best-effort; the event row above is the authoritative signal.
    try:
        from app.services.email_service import _send_and_log, _wrap
        from app.config import settings as _settings

        editor_inbox = getattr(_settings, "EDITORIAL_INBOX_EMAIL", None) or getattr(
            _settings, "SENDGRID_FROM_EMAIL", None,
        )
        if editor_inbox:
            paper_id = getattr(submission, "paper_id_code", None) or str(submission_id)[:8]
            frontend = (getattr(_settings, "FRONTEND_URL", "") or "").rstrip("/")
            review_url = f"{frontend}/editor/submissions/{submission_id}/revision-assessment"
            body = _wrap(f"""
                <p>A revision has just been submitted.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                       style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:6px 0;color:#374151;width:170px;"><strong>Manuscript ID:</strong></td>
                      <td style="padding:6px 0;color:#111827;">{paper_id}</td></tr>
                  <tr><td style="padding:6px 0;color:#374151;"><strong>Title:</strong></td>
                      <td style="padding:6px 0;color:#111827;">{submission.paper_title}</td></tr>
                  <tr><td style="padding:6px 0;color:#374151;"><strong>Round:</strong></td>
                      <td style="padding:6px 0;color:#111827;">{next_number}</td></tr>
                  <tr><td style="padding:6px 0;color:#374151;"><strong>Author:</strong></td>
                      <td style="padding:6px 0;color:#111827;">{getattr(submission, 'author_name', '—')}</td></tr>
                </table>
                <p><a href="{review_url}" style="display:inline-block;padding:12px 28px;
                       background:#1e40af;color:#ffffff;text-decoration:none;
                       font-weight:600;border-radius:6px;">Review revision</a></p>
                <p style="font-size:13px;color:#6b7280;">
                    The revision is currently marked <strong>under_review</strong> pending your assessment.
                </p>
            """)
            _send_and_log(
                editor_inbox,
                f"Revision submitted: {paper_id}",
                body,
                f"revision_submitted:{submission_id}:email",
            )
    except Exception:  # noqa: BLE001
        pass  # editor notify is best-effort

    _log(
        db,
        "revision.submitted",
        actor=user,
        target_type="submission",
        target_id=str(submission_id),
        ip=request.client.host if request.client else None,
        meta={"version_number": next_number, "label": label, "files": len(payload.files)},
    )

    version = (
        db.query(ManuscriptVersion)
        .options(joinedload(ManuscriptVersion.files))
        .filter(ManuscriptVersion.id == version.id)
        .first()
    )
    return _version_to_read(version)


@revisions_router.post(
    "/{version_id}/files",
    response_model=ManuscriptVersionRead,
)
def add_files_to_version(
    version_id: int,
    payload: List[ManuscriptFileCreate],
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    version = (
        db.query(ManuscriptVersion)
        .options(joinedload(ManuscriptVersion.files))
        .filter(ManuscriptVersion.id == version_id)
        .first()
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    submission = db.query(Submission).filter(Submission.id == version.submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if (submission.author_email or "").lower() != (user.email or "").lower():
        raise HTTPException(status_code=403, detail="Forbidden")

    for f in payload:
        db.add(
            ManuscriptFile(
                version_id=version.id,
                kind=f.kind,
                original_filename=f.original_filename,
                stored_url=f.stored_url,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                checksum=f.checksum,
            )
        )
    db.commit()
    _log(
        db,
        "revision.files_added",
        actor=user,
        target_type="version",
        target_id=str(version_id),
        ip=request.client.host if request.client else None,
        meta={"count": len(payload)},
    )
    db.refresh(version)
    return _version_to_read(version)


# ═══════════════════════════════════════════════════════════
# 2. Production router (editor)
# ═══════════════════════════════════════════════════════════

production_router = APIRouter()


@production_router.get("/queue", response_model=List[ProductionRead])
def production_queue(
    stage: Optional[str] = None,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    q = db.query(ProductionRecord)
    if stage:
        q = q.filter(ProductionRecord.stage == stage)
    rows = q.order_by(ProductionRecord.updated_at.desc()).all()
    return [
        ProductionRead(
            **{**r.__dict__, "submission_id": str(r.submission_id)}
        )
        for r in rows
    ]


@production_router.post(
    "/from-accepted/{submission_id}",
    response_model=ProductionRead,
    status_code=201,
)
def create_from_accepted(
    submission_id: _uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    existing = db.query(ProductionRecord).filter(ProductionRecord.submission_id == submission_id).first()
    if existing:
        return ProductionRead(**{**existing.__dict__, "submission_id": str(existing.submission_id)})
    record = ProductionRecord(submission_id=submission_id, stage="copy_editing")
    db.add(record)
    db.commit()
    db.refresh(record)
    _log(
        db,
        "production.opened",
        actor=editor,
        target_type="submission",
        target_id=str(submission_id),
        ip=request.client.host if request.client else None,
    )
    return ProductionRead(**{**record.__dict__, "submission_id": str(record.submission_id)})


@production_router.patch(
    "/{record_id}",
    response_model=ProductionRead,
)
def update_production(
    record_id: int,
    payload: ProductionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    row = db.query(ProductionRecord).filter(ProductionRecord.id == record_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Production record not found")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("stage") == "published" and not row.published_at and not updates.get("published_at"):
        updates["published_at"] = datetime.utcnow()
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "production.updated",
        actor=editor,
        target_type="production_record",
        target_id=str(record_id),
        ip=request.client.host if request.client else None,
        meta=updates,
    )
    return ProductionRead(**{**row.__dict__, "submission_id": str(row.submission_id)})


# ═══════════════════════════════════════════════════════════
# 3. Special issues router
# ═══════════════════════════════════════════════════════════

special_issues_router = APIRouter()


@special_issues_router.get("/", response_model=List[SpecialIssueRead])
def list_special_issues(
    include_unpublished: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(SpecialIssue)
    if not include_unpublished:
        q = q.filter(SpecialIssue.is_published.is_(True))
    return q.order_by(SpecialIssue.status, SpecialIssue.submission_deadline.desc().nullslast()).all()


@special_issues_router.get("/{slug}", response_model=SpecialIssueRead)
def get_special_issue(slug: str, db: Session = Depends(get_db)):
    row = db.query(SpecialIssue).filter(SpecialIssue.slug == slug).first()
    if row is None or not row.is_published:
        raise HTTPException(status_code=404, detail="Special issue not found")
    return row


@special_issues_router.post("/", response_model=SpecialIssueRead, status_code=201)
def create_special_issue(
    payload: SpecialIssueCreate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    if db.query(SpecialIssue).filter(SpecialIssue.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="A special issue with this slug already exists")
    row = SpecialIssue(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "special_issue.created",
        actor=editor,
        target_type="special_issue",
        target_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return row


@special_issues_router.patch("/{slug}", response_model=SpecialIssueRead)
def update_special_issue(
    slug: str,
    payload: SpecialIssueUpdate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    row = db.query(SpecialIssue).filter(SpecialIssue.slug == slug).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Special issue not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "special_issue.updated",
        actor=editor,
        target_type="special_issue",
        target_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return row


@special_issues_router.delete("/{slug}", status_code=204)
def delete_special_issue(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    row = db.query(SpecialIssue).filter(SpecialIssue.slug == slug).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Special issue not found")
    db.delete(row)
    db.commit()
    _log(
        db,
        "special_issue.deleted",
        actor=editor,
        target_type="special_issue",
        target_id=slug,
        ip=request.client.host if request.client else None,
    )
    return None


# ═══════════════════════════════════════════════════════════
# 4. Email templates router
# ═══════════════════════════════════════════════════════════

email_templates_router = APIRouter()


@email_templates_router.get("/", response_model=List[EmailTemplateRead])
def list_email_templates(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    return (
        db.query(EmailTemplate).order_by(EmailTemplate.slug).all()
    )


@email_templates_router.get("/{slug}", response_model=EmailTemplateRead)
def get_email_template(
    slug: str,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(EmailTemplate).filter(EmailTemplate.slug == slug).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


@email_templates_router.post("/", response_model=EmailTemplateRead, status_code=201)
def create_email_template(
    payload: EmailTemplateCreate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    if db.query(EmailTemplate).filter(EmailTemplate.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Template slug already exists")
    row = EmailTemplate(**payload.model_dump(), updated_by=editor.email if editor else None)
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "email_template.created",
        actor=editor,
        target_type="email_template",
        target_id=payload.slug,
        ip=request.client.host if request.client else None,
    )
    return row


@email_templates_router.patch("/{slug}", response_model=EmailTemplateRead)
def update_email_template(
    slug: str,
    payload: EmailTemplateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    row = db.query(EmailTemplate).filter(EmailTemplate.slug == slug).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_by = editor.email if editor else row.updated_by
    db.commit()
    db.refresh(row)
    _log(
        db,
        "email_template.updated",
        actor=editor,
        target_type="email_template",
        target_id=slug,
        ip=request.client.host if request.client else None,
    )
    return row


# ═══════════════════════════════════════════════════════════
# 5. Audit log (read-only)
# ═══════════════════════════════════════════════════════════

audit_router = APIRouter()


@audit_router.get("/", response_model=List[AuditLogRead])
def list_audit(
    action: Optional[str] = Query(None),
    actor_email: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Substring on action / target / actor"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _editor=Depends(require_permission(ACTION_VIEW_AUDIT)),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if actor_email:
        query = query.filter(AuditLog.actor_email == actor_email)
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)
    if q:
        needle = f"%{q}%"
        query = query.filter(
            or_(
                AuditLog.action.ilike(needle),
                AuditLog.actor_email.ilike(needle),
                AuditLog.target_id.ilike(needle),
            )
        )
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()


# ═══════════════════════════════════════════════════════════
# 6. Article references (public read + editor write)
# ═══════════════════════════════════════════════════════════

references_router = APIRouter()


@references_router.get("/article/{article_id}", response_model=List[ArticleReferenceRead])
def list_references(article_id: int, db: Session = Depends(get_db)):
    return (
        db.query(ArticleReference)
        .filter(ArticleReference.article_id == article_id)
        .order_by(ArticleReference.sequence)
        .all()
    )


@references_router.post(
    "/article/{article_id}",
    response_model=ArticleReferenceRead,
    status_code=201,
)
def add_reference(
    article_id: int,
    payload: ArticleReferenceCreate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    if not db.query(Article).filter(Article.id == article_id).first():
        raise HTTPException(status_code=404, detail="Article not found")
    row = ArticleReference(article_id=article_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "reference.added",
        actor=editor,
        target_type="article",
        target_id=str(article_id),
        ip=request.client.host if request.client else None,
    )
    return row


@references_router.delete("/{reference_id}", status_code=204)
def delete_reference(
    reference_id: int,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
):
    row = db.query(ArticleReference).filter(ArticleReference.id == reference_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    db.delete(row)
    db.commit()
    _log(
        db,
        "reference.deleted",
        actor=editor,
        target_type="reference",
        target_id=str(reference_id),
        ip=request.client.host if request.client else None,
    )
    return None


# ═══════════════════════════════════════════════════════════
# 7. User admin (list / patch / deactivate)
# ═══════════════════════════════════════════════════════════

users_admin_router = APIRouter()


@users_admin_router.get("/", response_model=List[UserAdminRead])
def list_users(
    role: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if q:
        needle = f"%{q}%"
        query = query.filter(
            or_(User.email.ilike(needle), User.username.ilike(needle), User.full_name.ilike(needle))
        )
    return query.order_by(User.id).all()


@users_admin_router.patch("/{user_id}", response_model=UserAdminRead)
def update_user(
    user_id: int,
    payload: UserAdminUpdate,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission(ACTION_MANAGE_USERS)),
):
    row = db.query(User).filter(User.id == user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    _log(
        db,
        "user.updated",
        actor=editor,
        target_type="user",
        target_id=str(user_id),
        ip=request.client.host if request.client else None,
        meta=updates,
    )
    return row


@users_admin_router.post("/{user_id}/deactivate", response_model=UserAdminRead)
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission(ACTION_MANAGE_USERS)),
):
    row = db.query(User).filter(User.id == user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    row.is_active = False
    db.commit()
    db.refresh(row)
    _log(
        db,
        "user.deactivated",
        actor=editor,
        target_type="user",
        target_id=str(user_id),
        ip=request.client.host if request.client else None,
    )
    return row
