"""Editorial Screening queue (a.k.a. "New Submissions").

Manuscripts that have been successfully submitted but not yet received
an editorial screening decision. Once the editor takes any screening
action (send to peer review / reject without review / request author
correction / transfer), the row leaves this queue.

Endpoints
---------
GET  /editor-portal/new-submissions
    List every submission whose status is in the SCREENING_BUCKET.
    Filters: q (paper_id / title / author), type, submitted_since.
    Each row carries paper_id, title, article_type, corresponding
    author, submitted_at, age_days, priority, and a rolled-up
    automated_screening block.

GET  /editor-portal/new-submissions/{submission_id}
    Full screening detail — everything the list surfaces plus authors,
    files, format-check checks, ethics screening summary. Drives the
    Editorial Screening page.

POST /editor-portal/new-submissions/{submission_id}/screening-decision
    The editor's initial screening action. Consumes:
      { decision: "peer_review" | "reject" | "author_correction" | "transfer",
        comments?: str,
        checklist?: { scope, article_type, complete, ethics, coi, review_ready } }
    Runs through the strict state machine + writes a
    ``submission_transitions`` audit row. The row exits this queue.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.editor_auth import require_editor_mfa


router = APIRouter()


# ── The screening bucket ────────────────────────────────
#
# These are the four pre-reviewer-assignment states — the manuscript
# has been received but no editorial-screening action has been taken.
# Once the editor decides, the row moves to pending_assignment (peer
# review), rejected, returned_to_author (correction), or a transfer
# outcome (also modelled as returned_to_author with a note).
SCREENING_BUCKET = (
    SubmissionStatus.pending_classification,
    SubmissionStatus.awaiting_format_check,
    SubmissionStatus.awaiting_consult_review,
    SubmissionStatus.awaiting_reviewer_suggestions,
)


# ── Schemas ─────────────────────────────────────────────

class ScreeningCheck(BaseModel):
    key: str                 # e.g. "submission_validation"
    label: str
    state: str               # "passed" | "warning" | "flagged" | "pending"
    detail: Optional[str] = None


class NewSubmissionRow(BaseModel):
    submission_id: str
    manuscript_id: str
    title: str
    article_type: str
    corresponding_author: str
    author_affiliation: Optional[str] = None
    author_email: str
    submitted_at: datetime
    age_days: int
    priority: str            # "fast_track" | "special_issue" | "invited" | "normal"
    status: str
    screening: List[ScreeningCheck] = []
    ethics_flagged: bool = False


class NewSubmissionsResponse(BaseModel):
    total: int
    submissions: List[NewSubmissionRow]


class ScreeningDetail(NewSubmissionRow):
    abstract: Optional[str] = None
    keywords: List[str] = []
    files: List[dict] = []
    authors: List[dict] = []
    format_check_report: Optional[dict] = None


class ChecklistPayload(BaseModel):
    scope: Optional[bool] = None
    article_type: Optional[bool] = None
    complete: Optional[bool] = None
    ethics: Optional[bool] = None
    coi: Optional[bool] = None
    review_ready: Optional[bool] = None


class ScreeningDecisionRequest(BaseModel):
    decision: str = Field(
        ...,
        description='One of: peer_review, reject, author_correction, transfer',
    )
    comments: Optional[str] = Field(None, max_length=8000)
    checklist: Optional[ChecklistPayload] = None
    transfer_target: Optional[str] = Field(
        None,
        max_length=200,
        description="Free text — journal/section the paper is being transferred to.",
    )


class ScreeningDecisionResponse(BaseModel):
    ok: bool = True
    submission_id: str
    new_status: str


# ── Helpers ─────────────────────────────────────────────

def _display_id(s: Submission) -> str:
    return s.paper_id_code or f"#{str(s.id)[:8]}"


def _priority(s: Submission) -> str:
    """Derive a queue-priority label.

    No dedicated priority column yet — this is a heuristic:
    * Age ≥ 10 days without a decision  → fast_track (queue is stale)
    * ``special_issue_id`` populated    → special_issue
    * else                              → normal
    """
    if getattr(s, "special_issue_id", None):
        return "special_issue"
    days = (datetime.utcnow() - s.submitted_at).days if s.submitted_at else 0
    if days >= 10:
        return "fast_track"
    return "normal"


def _screening_checks(s: Submission) -> List[ScreeningCheck]:
    """Roll up the automated-screening state from what the agents have
    already produced. Missing signals become ``pending`` — never
    marked failing when we simply don't know yet."""
    checks: List[ScreeningCheck] = []

    # Submission validation — Agent 1 acknowledgement sets the
    # classified_field once metadata parses. Absent = pending.
    submitted_valid = bool(s.abstract and s.paper_title and s.author_email)
    checks.append(ScreeningCheck(
        key="submission_validation",
        label="Submission validation",
        state="passed" if submitted_valid else "pending",
        detail=None if submitted_valid else "Awaiting Agent 1 acknowledgement.",
    ))

    # Metadata / classification — Agent 1 stamps classified_field.
    checks.append(ScreeningCheck(
        key="metadata_validation",
        label="Metadata validation",
        state="passed" if s.classified_field else "pending",
        detail=(f"Classified as {s.classified_field}" if s.classified_field else None),
    ))

    # Format check — Agent 2 writes format_check_report with overall.
    fc = getattr(s, "format_check_report", None) or {}
    overall = (fc.get("overall") if isinstance(fc, dict) else None) or None
    if overall == "pass":
        state = "passed"
    elif overall == "warn":
        state = "warning"
    elif overall == "fail":
        state = "flagged"
    else:
        state = "pending"
    checks.append(ScreeningCheck(
        key="format_validation",
        label="Format validation",
        state=state,
        detail=(f"Agent 2 overall: {overall}" if overall else "Awaiting Agent 2."),
    ))

    # Similarity / plagiarism — a PlagiarismCheck row may or may not exist.
    # Kept as "pending" by default; a real integration surfaces the score.
    checks.append(ScreeningCheck(
        key="similarity",
        label="Similarity screening",
        state="pending",
        detail="Similarity check has not been run for this submission.",
    ))

    # Scope — mirrors classified_field pass. Editor confirms manually.
    checks.append(ScreeningCheck(
        key="scope",
        label="Scope screening",
        state="passed" if s.classified_field else "pending",
        detail=None,
    ))

    # Ethics — surfaced from reviewer flags when reviews arrive. At
    # screening time there are usually no reviews yet, so this is
    # pending unless the intake pipeline stamped ``consult_party_*``
    # with a flag.
    ethics_flag = False
    try:
        for r in (s.reviews or []):
            if getattr(r, "ethics_flag", False):
                ethics_flag = True
                break
    except Exception:  # noqa: BLE001
        ethics_flag = False
    checks.append(ScreeningCheck(
        key="ethics",
        label="Ethics screening",
        state="flagged" if ethics_flag else "pending",
        detail=("At least one reviewer flagged ethics." if ethics_flag else None),
    ))

    return checks


def _corresponding_author(s: Submission) -> str:
    return (s.author_name or "").strip() or "—"


def _to_row(s: Submission) -> NewSubmissionRow:
    now = datetime.utcnow()
    age = (now - s.submitted_at).days if s.submitted_at else 0
    checks = _screening_checks(s)
    ethics_flagged = any(c.key == "ethics" and c.state == "flagged" for c in checks)
    return NewSubmissionRow(
        submission_id=str(s.id),
        manuscript_id=_display_id(s),
        title=s.paper_title,
        article_type=s.classified_field or "Research Article",
        corresponding_author=_corresponding_author(s),
        author_affiliation=None,
        author_email=s.author_email,
        submitted_at=s.submitted_at,
        age_days=max(0, age),
        priority=_priority(s),
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
        screening=checks,
        ethics_flagged=ethics_flagged,
    )


# ── Endpoints ───────────────────────────────────────────

@router.get("/new-submissions", response_model=NewSubmissionsResponse)
def list_new_submissions(
    q: Optional[str] = None,
    article_type: Optional[str] = None,
    since_days: Optional[int] = None,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> NewSubmissionsResponse:
    """Screening-queue listing. Newest first.

    ``q`` matches paper_id_code / paper_title / author_name /
    author_email as a case-insensitive substring. ``article_type``
    matches ``classified_field`` exactly. ``since_days`` limits to
    rows submitted in the last N days ("Today" = 1, "This week" = 7).
    """
    query = (
        db.query(Submission)
        .filter(Submission.status.in_(SCREENING_BUCKET))
    )
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Submission.paper_id_code.ilike(needle),
                Submission.paper_title.ilike(needle),
                Submission.author_name.ilike(needle),
                Submission.author_email.ilike(needle),
            )
        )
    if article_type:
        query = query.filter(Submission.classified_field == article_type)
    if since_days is not None and since_days > 0:
        threshold = datetime.utcnow() - timedelta(days=since_days)
        query = query.filter(Submission.submitted_at >= threshold)

    rows = query.order_by(Submission.submitted_at.desc()).all()
    return NewSubmissionsResponse(
        total=len(rows),
        submissions=[_to_row(r) for r in rows],
    )


@router.get(
    "/new-submissions/{submission_id}",
    response_model=ScreeningDetail,
)
def screening_detail(
    submission_id: str,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> ScreeningDetail:
    submission = _resolve_submission(db, submission_id)
    row = _to_row(submission).model_dump()

    # Files — surface both the versioned uploads (if any) and the
    # submission-level pdf_url fallback the reviewer portal uses.
    files: list[dict] = []
    try:
        from app.models.manuscript_version import ManuscriptVersion
        version = (
            db.query(ManuscriptVersion)
            .filter(ManuscriptVersion.submission_id == submission.id)
            .order_by(
                ManuscriptVersion.is_current.desc(),
                ManuscriptVersion.version_number.desc(),
            )
            .first()
        )
        if version is not None:
            for f in version.files or []:
                files.append({
                    "id": str(f.id),
                    "filename": f.original_filename or "manuscript",
                    "size_bytes": f.size_bytes,
                    "content_type": f.mime_type,
                    "kind": f.kind,
                })
    except Exception:  # noqa: BLE001
        pass
    if not files:
        if submission.redacted_pdf_url:
            files.append({
                "id": f"sub-{submission.id}-redacted",
                "filename": f"{row['manuscript_id']}_manuscript_anonymized.pdf",
                "content_type": "application/pdf",
                "kind": "redacted",
                "url": submission.redacted_pdf_url,
            })
        elif submission.pdf_url:
            files.append({
                "id": f"sub-{submission.id}",
                "filename": f"{row['manuscript_id']}_manuscript.pdf",
                "content_type": "application/pdf",
                "kind": "manuscript",
                "url": submission.pdf_url,
            })

    row["abstract"] = submission.abstract
    row["keywords"] = list(submission.keywords or [])
    row["files"] = files
    # Authors — this codebase currently stores only the corresponding
    # author on the submission row. Co-authors will populate once the
    # multi-author intake ships; for now the corresponding author is
    # returned as the single entry so the UI has a shape to render.
    row["authors"] = [{
        "name": submission.author_name,
        "email": submission.author_email,
        "corresponding": True,
    }]
    row["format_check_report"] = submission.format_check_report or None
    return ScreeningDetail(**row)


@router.post(
    "/new-submissions/{submission_id}/screening-decision",
    response_model=ScreeningDecisionResponse,
)
def screening_decision(
    submission_id: str,
    body: ScreeningDecisionRequest,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> ScreeningDecisionResponse:
    """Editor's initial screening decision. Moves the row out of the
    New Submissions queue via the strict state machine so illegal
    transitions hard-fail with 409 and every attempt lands in
    ``submission_transitions``.
    """
    from app.services.state_machine import transition, IllegalTransitionError

    submission = _resolve_submission(db, submission_id)
    if submission.status not in SCREENING_BUCKET:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This manuscript is no longer in the screening queue "
                f"(current status: {submission.status.value})."
            ),
        )

    target = _map_decision(body.decision)
    audit = _compose_audit(body)

    try:
        transition(db, submission, target, actor=editor, reason=audit)
    except IllegalTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Best-effort author notification. Non-fatal.
    try:
        from app.services.email_service import _send_and_log, _wrap
        subject_by_decision = {
            "peer_review": "Your manuscript has been sent for peer review",
            "reject": "Editorial decision on your manuscript",
            "author_correction": "Please make corrections to your manuscript",
            "transfer": "Your manuscript has been transferred",
        }
        subject = subject_by_decision.get(body.decision, "Update on your manuscript")
        _send_and_log(
            submission.author_email,
            subject,
            _wrap(
                f"<p>Dear {submission.author_name or 'Author'},</p>"
                f"<p>Your manuscript <strong>{submission.paper_title}</strong> "
                f"({_display_id(submission)}) has been reviewed by the editorial team.</p>"
                f"<p><strong>Editor's note:</strong><br>"
                f"{(body.comments or 'No additional comments provided.').replace(chr(10), '<br>')}</p>"
            ),
            "editorial_screening_decision",
        )
    except Exception:  # noqa: BLE001
        pass

    return ScreeningDecisionResponse(
        submission_id=str(submission.id),
        new_status=submission.status.value if hasattr(submission.status, "value") else str(submission.status),
    )


# ── Local helpers ───────────────────────────────────────

def _resolve_submission(db: Session, key: str) -> Submission:
    submission: Optional[Submission] = None
    try:
        submission = db.query(Submission).filter(Submission.id == UUID(str(key))).first()
    except (ValueError, TypeError):
        submission = (
            db.query(Submission).filter(Submission.paper_id_code == key).first()
        )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return submission


def _map_decision(decision: str) -> SubmissionStatus:
    """Editor screening decision → target state machine node.

    * peer_review     → pending_assignment  (Agent 4/5 dispatch next)
    * reject          → rejected            (terminal)
    * author_correction → returned_to_author (author must re-upload)
    * transfer        → returned_to_author + note on comments
    """
    mapping = {
        "peer_review":         SubmissionStatus.pending_assignment,
        "reject":              SubmissionStatus.rejected,
        "author_correction":   SubmissionStatus.returned_to_author,
        "transfer":            SubmissionStatus.returned_to_author,
    }
    target = mapping.get(decision)
    if target is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown decision '{decision}'. Expected one of {sorted(mapping)}.",
        )
    return target


def _compose_audit(body: ScreeningDecisionRequest) -> str:
    parts = [f"Screening decision: {body.decision}"]
    if body.checklist:
        boxes = {
            "scope": "Within scope",
            "article_type": "Article type OK",
            "complete": "Complete",
            "ethics": "Ethics OK",
            "coi": "No COI",
            "review_ready": "Suitable for peer review",
        }
        ticked = [label for k, label in boxes.items() if getattr(body.checklist, k, False)]
        if ticked:
            parts.append(f"Checklist ticked: {', '.join(ticked)}")
    if body.transfer_target:
        parts.append(f"Transfer target: {body.transfer_target}")
    if body.comments:
        parts.append(f"Comments: {body.comments}")
    return " | ".join(parts)
