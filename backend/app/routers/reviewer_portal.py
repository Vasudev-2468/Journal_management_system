"""
Reviewer Portal Router — end-to-end reviewer workspace.

Every endpoint here is gated on ``get_current_reviewer`` (reviewer
session token) and returns only rows the current reviewer owns.

Endpoints
---------
GET  /reviewer-portal/dashboard
    Aggregated counters (pending / in_progress / due_soon / submitted /
    overdue), the latest 3 alerts, and the active-assignments preview.

GET  /reviewer-portal/assignments
    Full list of the reviewer's assignments with derived state.

GET  /reviewer-portal/assignments/{review_id}
    Assignment detail — enough for the pre-accept COI card AND for
    the "workspace" header on the review form.

POST /reviewer-portal/assignments/{review_id}/accept
    COI declaration + accept. Stamps ``accepted_at`` and flips state
    to ``accepted``.

POST /reviewer-portal/assignments/{review_id}/decline
    Optional reason. Stamps ``declined_at`` and flips state to
    ``declined``.

GET  /reviewer-portal/assignments/{review_id}/draft
POST /reviewer-portal/assignments/{review_id}/draft
    Save-Draft target for the structured review form. Idempotent —
    each POST overwrites the JSON payload and bumps ``saved_at``.

POST /reviewer-portal/assignments/{review_id}/assistant
    Run the Review Assistant agent against a payload the reviewer is
    editing; returns a list of hints. Stateless.

POST /reviewer-portal/assignments/{review_id}/quality-check
    Run the Review Validation agent (a.k.a. Review Quality Check) —
    returns blockers + warnings so the frontend can enable / disable
    the Submit button. The Submit endpoint reruns the same check
    server-side; blockers refuse the submit regardless of frontend
    state.

POST /reviewer-portal/assignments/{review_id}/submit
    Runs quality-check server-side (blockers refuse the submit),
    persists the structured fields on the Review row, runs the
    Editor Summary agent, clears the draft, sets ``state=submitted``
    + ``status=completed`` + ``completed_at``.

GET  /reviewer-portal/history
    Completed reviews with filters (year, recommendation, state).

GET  /reviewer-portal/notifications
    Reviewer-scoped notification feed derived from the assignments
    payload (new invitations, deadline reminders, submit-confirmed).

GET  /reviewer-portal/profile
PATCH /reviewer-portal/profile
    Personal info + academic identifiers (spec §18).

GET  /reviewer-portal/availability
PATCH /reviewer-portal/availability
    Max-active-reviews and unavailable-window (spec §19).

GET  /reviewer-portal/security
    Sessions overview + change-password gate (spec §20). The
    change-password endpoint itself lives at
    /reviewer-auth/change-password (added alongside this router).

GET  /reviewer-portal/rubric
    Rubric schema powering the structured review form. The frontend
    reads this on ReviewFormPage mount so the questions and options
    stay a single source of truth.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.agents.reviewer_agents import (
    CONFIDENCE_OPTIONS,
    RECOMMENDATION_OPTIONS,
    RUBRIC,
    RUBRIC_BY_KEY,
    run_editor_summary_agent,
    run_review_assistant,
    run_review_quality_check,
)
from app.database import get_db
from app.models.manuscript_file import ManuscriptFile
from app.models.manuscript_version import ManuscriptVersion
from app.models.review import OverallRecommendation, Review, ReviewState, ReviewStatus
from app.models.review_draft import ReviewDraft
from app.models.reviewer import Reviewer
from app.models.submission import Submission
from app.services.reviewer_auth_service import get_current_reviewer


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class AssignmentSummary(BaseModel):
    review_id: str
    submission_id: str
    manuscript_id: str
    paper_title: str
    article_type: Optional[str] = None
    subject: Optional[str] = None
    assigned_at: datetime
    deadline: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str
    state: str
    coi_declared_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    recommendation: Optional[str] = None
    link_token: Optional[str] = None


class Alert(BaseModel):
    kind: str            # deadline | new_invite | submitted
    title: str
    detail: str
    action_url: Optional[str] = None
    review_id: Optional[str] = None


class DashboardResponse(BaseModel):
    counters: Dict[str, int]
    alerts: List[Alert]
    active: List[AssignmentSummary]
    reviewer_name: str


class AssignmentDetail(AssignmentSummary):
    abstract: Optional[str] = None
    files: List[Dict[str, Any]] = []
    double_blind: bool = True
    authors_display: Optional[str] = None


class COIAcceptRequest(BaseModel):
    coi_declared: bool = Field(..., description="True if the reviewer confirms no COI; False lets them explain in the reason field.")
    coi_reason: Optional[str] = Field(None, max_length=2000)


class DeclineRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=2000)


class PageAnnotation(BaseModel):
    """A reviewer's comment anchored to a specific PDF location.

    ``lines`` is a free-form string ("214–218", "para 3") so the
    reviewer can be as precise as their PDF allows without the client
    imposing a schema. The Editor Summary Agent only counts these; the
    editor UI renders them verbatim next to the paper viewer.
    """
    page: int = Field(..., ge=1, description="1-indexed page number")
    lines: str = Field("", max_length=64)
    type: str = Field("suggestion", description="major | minor | suggestion")
    text: str = Field(..., min_length=1, max_length=4000)


class StructuredComment(BaseModel):
    """One reviewer comment anchored to a location inside the paper.

    Spec §3-4: Major and Minor comments carry ``page`` / ``section`` /
    ``line`` so the editor knows exactly where the reviewer's issue
    lives. All three location fields are optional strings so the
    reviewer can leave what they don't have.
    """
    page: str = Field("", max_length=32, description="Page number or range")
    section: str = Field("", max_length=120, description="Section / subsection name")
    line: str = Field("", max_length=64, description="Line or paragraph reference")
    comment: str = Field(..., min_length=1, max_length=4000)


class DraftPayload(BaseModel):
    # Front-of-report: overall assessment paragraph and rubric answers.
    overall_assessment: str = ""
    rubric_answers: Dict[str, str] = Field(default_factory=dict)
    # Comments — Major/Minor are structured with location; Suggestions
    # is a repeating list; comments_to_authors is the final overall
    # author-facing report; comments_to_editor is confidential.
    major_comments: List[StructuredComment] = Field(default_factory=list)
    minor_comments: List[StructuredComment] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    suggestions_to_authors: str = ""              # legacy free-text (still saved)
    comments_to_authors: str = ""
    comments_to_editor: str = ""
    # Ethical concern channel (spec §13). Kept off the general comment
    # blocks so the editor can filter reviews carrying an ethics flag.
    ethics_flag: bool = False
    ethics_note: str = ""
    # PDF-anchored comments (spec §16).
    page_annotations: List[PageAnnotation] = Field(default_factory=list)
    recommendation: Optional[str] = None
    confidence: Optional[str] = None
    willing_to_review_revision: Optional[bool] = None
    coi_declared: Optional[bool] = None

    model_config = ConfigDict(extra="ignore")


class DraftResponse(BaseModel):
    payload: DraftPayload
    saved_at: Optional[datetime]


class AssistantHintDTO(BaseModel):
    severity: str
    code: str
    message: str


class AssistantResponse(BaseModel):
    hints: List[AssistantHintDTO]


class QualityCheckResponse(BaseModel):
    ok: bool
    blockers: List[str]
    warnings: List[str]


class SubmitResponse(BaseModel):
    ok: bool
    review_id: str
    editor_summary: str
    completed_at: datetime
    # Counts + recommendation surface so the "Review Submitted"
    # confirmation screen can render the structured Reviewer Report
    # header (spec §10-11) without a follow-up round-trip.
    manuscript_id: str
    recommendation: Optional[str] = None
    confidence: Optional[str] = None
    round_number: int = 1
    major_count: int = 0
    minor_count: int = 0
    suggestions_count: int = 0
    annotations_count: int = 0


class ReviewerReport(BaseModel):
    """Full structured Reviewer Report the editor sees on the paper
    detail page (spec §11-13). Read via GET /report; a completed
    review returns the persisted fields verbatim, a draft returns
    the in-progress payload."""
    review_id: str
    manuscript_id: str
    paper_title: str
    reviewer_display_name: str          # anonymised — "Anonymous Reviewer #N"
    round_number: int
    state: str
    submitted_at: Optional[datetime] = None
    overall_assessment: str = ""
    rubric_answers: Dict[str, str] = {}
    major_comments: List[StructuredComment] = []
    minor_comments: List[StructuredComment] = []
    suggestions: List[str] = []
    comments_to_authors: str = ""
    comments_to_editor: str = ""
    ethics_flag: bool = False
    ethics_note: str = ""
    page_annotations: List[PageAnnotation] = []
    recommendation: Optional[str] = None
    confidence: Optional[str] = None
    willing_to_review_revision: Optional[bool] = None
    editor_summary: str = ""


class ReportCounts(BaseModel):
    major: int
    minor: int
    suggestions: int
    annotations: int


class PreviewResponse(BaseModel):
    """The Preview Review button (spec §9) surfaces this — a
    read-model of the current draft so the reviewer can eyeball the
    exact report before confirming submission."""
    report: ReviewerReport
    counts: ReportCounts
    validation_ok: bool
    validation_blockers: List[str] = []
    validation_warnings: List[str] = []


class ProfileResponse(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    country: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    expertise_tags: List[str] = []
    orcid: Optional[str] = None
    scopus_id: Optional[str] = None
    google_scholar: Optional[str] = None


class ProfilePatch(BaseModel):
    phone: Optional[str] = None
    country: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    expertise_tags: Optional[List[str]] = None
    orcid: Optional[str] = None
    scopus_id: Optional[str] = None
    google_scholar: Optional[str] = None


class AvailabilityResponse(BaseModel):
    available: bool
    current_load: int
    max_assignments: int
    unavailable_from: Optional[datetime] = None
    unavailable_until: Optional[datetime] = None
    preferred_areas: List[str] = []


class AvailabilityPatch(BaseModel):
    max_assignments: Optional[int] = Field(None, ge=1, le=50)
    unavailable_from: Optional[datetime] = None
    unavailable_until: Optional[datetime] = None
    clear_unavailable: bool = False


class SecurityResponse(BaseModel):
    email: str
    email_verified: bool
    password_last_changed_at: Optional[datetime] = None
    twofa_enabled: bool = False
    active_sessions: int = 1


class RubricOptionDTO(BaseModel):
    value: str
    label: str


class RubricQuestionDTO(BaseModel):
    key: str
    prompt: str
    options: List[RubricOptionDTO]
    mandatory: bool
    kind: str
    section: str


class RubricResponse(BaseModel):
    questions: List[RubricQuestionDTO]
    recommendations: List[RubricOptionDTO]
    confidences: List[RubricOptionDTO]


# ── Helpers ─────────────────────────────────────────────

def _manuscript_display_id(review: Review) -> str:
    year = review.assigned_at.year if review.assigned_at else datetime.utcnow().year
    tail = (str(review.submission_id) or "").replace("-", "")[-4:].upper() or "0000"
    return f"MS-{year}-{tail}"


def _reviewer_load(reviewer: Reviewer) -> int:
    """The persisted ``current_load`` counter can drift over time; recompute
    from open review rows so the dashboard is always honest."""
    return sum(
        1 for r in reviewer.reviews
        if r.state in (ReviewState.accepted, ReviewState.in_progress, ReviewState.invited)
    )


def _load_review(db: Session, review_id: uuid.UUID, reviewer: Reviewer) -> Review:
    review = (
        db.query(Review)
        .filter(Review.id == review_id, Review.reviewer_id == reviewer.id)
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return review


def _derive_state(review: Review) -> ReviewState:
    """Compute the reviewer-facing state at read time so old rows
    without a stamped ``state`` still surface a coherent pill. The
    stored value wins whenever it is more specific than the coarse
    inference below."""
    if review.state and review.state != ReviewState.invited:
        # Trust anything explicit that isn't the enum default.
        return review.state
    if review.status == ReviewStatus.completed:
        return ReviewState.submitted
    if review.status == ReviewStatus.expired:
        return ReviewState.declined if review.declined_at else ReviewState.expired
    now = datetime.utcnow()
    if review.link_expires_at and review.link_expires_at < now:
        return ReviewState.overdue
    if review.accepted_at:
        return ReviewState.in_progress if review.draft else ReviewState.accepted
    return ReviewState.invited


def _assignment_summary(review: Review) -> AssignmentSummary:
    state = _derive_state(review)
    submission = review.submission
    return AssignmentSummary(
        review_id=str(review.id),
        submission_id=str(review.submission_id),
        manuscript_id=_manuscript_display_id(review),
        paper_title=(submission.paper_title if submission else "Manuscript"),
        article_type=getattr(submission, "article_type", None),
        subject=getattr(submission, "research_domain", None) or getattr(submission, "field", None),
        assigned_at=review.assigned_at,
        deadline=review.link_expires_at,
        completed_at=review.completed_at,
        status=review.status.value,
        state=state.value,
        coi_declared_at=review.coi_declared_at,
        accepted_at=review.accepted_at,
        recommendation=review.overall_recommendation.value if review.overall_recommendation else None,
        link_token=review.link_token,
    )


def _assignments_for(reviewer: Reviewer) -> List[Review]:
    return sorted(
        reviewer.reviews,
        key=lambda r: (r.assigned_at or datetime.min),
        reverse=True,
    )


# ── Dashboard ───────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    # Diagnostic wrap — any SQL / attribute error hits the server log
    # with a full traceback AND is surfaced in the HTTP response as a
    # 500 carrying the exception class + message. Without this the
    # generic "Internal Server Error" masked the root cause (e.g.
    # 'column reviews.state does not exist' when migrations are
    # behind).
    try:
        return _build_dashboard(reviewer)
    except Exception as exc:
        logger.exception(
            "reviewer_portal.dashboard failed for reviewer_id=%s", reviewer.id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Dashboard load failed: {type(exc).__name__}: {exc}",
        )


def _build_dashboard(reviewer: Reviewer) -> "DashboardResponse":
    assignments = _assignments_for(reviewer)
    summaries = [_assignment_summary(r) for r in assignments]
    # Two distinct "pending" concepts (spec split):
    #   invited          — reviewer has been invited but has not
    #                      accepted or declined yet ("Pending
    #                      Invitations — needs response").
    #   pending_reviews  — reviewer accepted the assignment and needs
    #                      to complete the review ("Pending Reviews —
    #                      needs completion"). Sum of accepted +
    #                      in_progress states.
    #   in_progress      — kept as its own counter for the "review has
    #                      a saved draft" nuance.
    #   completed_this_year — submitted reviews with completed_at in
    #                      the current calendar year (used for the
    #                      Completed card's "This Year" hint).
    counters = {
        "invited": 0,
        "pending_reviews": 0,
        "in_progress": 0,
        "submitted": 0,
        "completed_this_year": 0,
        "overdue": 0,
        "due_soon": 0,
    }
    now = datetime.utcnow()
    current_year = now.year
    for s in summaries:
        if s.state == "invited":
            counters["invited"] += 1
        elif s.state == "accepted":
            counters["pending_reviews"] += 1
        elif s.state == "in_progress":
            counters["pending_reviews"] += 1
            counters["in_progress"] += 1
        elif s.state == "submitted":
            counters["submitted"] += 1
            if s.completed_at and s.completed_at.year == current_year:
                counters["completed_this_year"] += 1
        elif s.state == "overdue":
            counters["overdue"] += 1
        # Due-soon: any in-flight assignment whose deadline is within
        # the next 7 days. Also fires for accepted rows the reviewer
        # hasn't started yet — they're still on the hook.
        if s.state in ("invited", "accepted", "in_progress") and s.deadline:
            days = (s.deadline - now).days
            if 0 <= days <= 7:
                counters["due_soon"] += 1

    alerts: List[Alert] = []
    for s in summaries:
        # New invitations in the last 7 days
        if s.state == "invited" and (now - s.assigned_at).days <= 7:
            alerts.append(Alert(
                kind="new_invite",
                title="New review invitation",
                detail=f"You have been invited to review {s.paper_title}.",
                action_url=f"/reviewer/assignment/{s.review_id}",
                review_id=s.review_id,
            ))
        # Deadline approaching
        if s.state in ("invited", "in_progress") and s.deadline:
            days = (s.deadline - now).days
            if 0 <= days <= 7:
                alerts.append(Alert(
                    kind="deadline",
                    title="Review deadline approaching",
                    detail=f"{s.paper_title} is due in {days} day(s).",
                    action_url=f"/reviewer/assignment/{s.review_id}/review",
                    review_id=s.review_id,
                ))
        # Recently submitted
        if s.state == "submitted" and s.completed_at and (now - s.completed_at).days <= 7:
            alerts.append(Alert(
                kind="submitted",
                title="Review submitted successfully",
                detail=f"Your review for {s.paper_title} was submitted on {s.completed_at.date().isoformat()}.",
                action_url=f"/reviewer/assignment/{s.review_id}",
                review_id=s.review_id,
            ))
    alerts = alerts[:3]

    active = [s for s in summaries if s.state in ("invited", "in_progress", "accepted", "overdue")]

    return DashboardResponse(
        counters=counters,
        alerts=alerts,
        active=active,
        reviewer_name=reviewer.name,
    )


# ── Assignments list ────────────────────────────────────

@router.get("/assignments", response_model=List[AssignmentSummary])
def list_assignments(
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    return [_assignment_summary(r) for r in _assignments_for(reviewer)]


# ── Assignment detail ───────────────────────────────────

@router.get("/assignments/{review_id}", response_model=AssignmentDetail)
def get_assignment(
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    summary = _assignment_summary(review)
    submission = review.submission

    # Double-blind guard: never expose author identity to the reviewer.
    # The submission has ``author_id`` (fk) and possibly other author
    # metadata; we display only an anonymous stand-in.
    authors_display = "Anonymous (double-blind review)"

    files: List[Dict[str, Any]] = []
    # Files live on the manuscript_versions table (one submission has
    # many versions; each version has many files). Surface the current
    # version's files if one exists, else fall back to the newest.
    if submission is not None:
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

        # Fallback path — submissions that came in through the plain
        # POST /submissions pipeline land their PDF on
        # ``submission.pdf_url`` (and optionally ``redacted_pdf_url``)
        # without producing a ManuscriptVersion row. Surface those as
        # synthetic file entries so the reviewer workspace still sees
        # the manuscript. The synthetic id is ``sub-<uuid>`` (or
        # ``sub-<uuid>-redacted``) — the streaming endpoint parses it
        # and reads from storage_service.
        if not files:
            redacted = getattr(submission, "redacted_pdf_url", None)
            raw = getattr(submission, "pdf_url", None)
            paper_id = getattr(submission, "paper_id_code", None) or str(submission.id)[:8]
            for url_val, kind, id_suffix, filename_suffix in [
                (redacted, "redacted",  "-redacted", "_anonymized"),
                (raw,      "manuscript", "",         ""),
            ]:
                if not url_val:
                    continue
                # Best-effort size — a HEAD would be ideal but local
                # files are cheap to size and remote just displays 0.
                size_bytes = 0
                try:
                    from pathlib import Path
                    if url_val.startswith("/uploads/"):
                        p = Path("/app/uploads") / url_val[len("/uploads/"):]
                        if p.exists():
                            size_bytes = p.stat().st_size
                        else:
                            alt = Path("uploads") / url_val[len("/uploads/"):]
                            if alt.exists():
                                size_bytes = alt.stat().st_size
                except Exception:  # noqa: BLE001
                    pass
                files.append({
                    "id": f"sub-{submission.id}{id_suffix}",
                    "filename": f"{paper_id}_manuscript{filename_suffix}.pdf",
                    "size_bytes": size_bytes,
                    "content_type": "application/pdf",
                    "kind": kind,
                })
                # Show only ONE fallback — redacted wins over raw so a
                # reviewer never sees author-identifying pages when a
                # redacted copy exists.
                break

    return AssignmentDetail(
        **summary.model_dump(),
        abstract=getattr(submission, "abstract", None) if submission else None,
        files=files,
        double_blind=True,
        authors_display=authors_display,
    )


# ── COI Accept / Decline ────────────────────────────────

@router.post("/assignments/{review_id}/accept")
def accept_assignment(
    review_id: uuid.UUID,
    body: COIAcceptRequest,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    if review.state == ReviewState.declined:
        raise HTTPException(status_code=409, detail="You have already declined this assignment.")
    if review.state == ReviewState.submitted:
        raise HTTPException(status_code=409, detail="This review has already been submitted.")
    if not body.coi_declared and not body.coi_reason:
        raise HTTPException(
            status_code=400,
            detail="Please describe your conflict of interest, or select the no-conflict option.",
        )
    review.coi_declared_at = datetime.utcnow()
    if body.coi_reason:
        # Stash reviewer's COI note into the confidential comments field so
        # the editor sees it verbatim on the paper detail page.
        prefix = "[COI declared] "
        note = f"{prefix}{body.coi_reason.strip()}\n\n"
        review.comments_to_editor = (note + (review.comments_to_editor or "")).strip()
    review.accepted_at = datetime.utcnow()
    review.state = ReviewState.accepted
    db.commit()
    return {"ok": True, "state": review.state.value}


@router.post("/assignments/{review_id}/decline")
def decline_assignment(
    review_id: uuid.UUID,
    body: DeclineRequest,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    if review.state == ReviewState.submitted:
        raise HTTPException(status_code=409, detail="This review has already been submitted.")
    review.declined_at = datetime.utcnow()
    review.decline_reason = (body.reason or "").strip() or None
    review.state = ReviewState.declined
    review.status = ReviewStatus.expired  # release the slot for editor reassignment
    review.link_used = True
    db.commit()
    return {"ok": True, "state": review.state.value}


# ── Draft (GET/POST) ────────────────────────────────────

def _draft_response(review: Review) -> DraftResponse:
    """Return the reviewer's saved draft, normalising legacy shapes so
    a form that was saved before the structured-comments upgrade still
    loads."""
    if not review.draft:
        return DraftResponse(payload=DraftPayload(), saved_at=None)
    try:
        raw = json.loads(review.draft.payload_json)
    except Exception:  # noqa: BLE001
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    # Convert legacy List[str] Major/Minor entries to
    # [{page:"",section:"",line:"",comment}] so the new DraftPayload
    # accepts them without dropping the reviewer's work.
    for k in ("major_comments", "minor_comments"):
        items = raw.get(k)
        if isinstance(items, list):
            normalised: List[Dict[str, Any]] = []
            for row in items:
                if isinstance(row, str) and row.strip():
                    normalised.append({"page": "", "section": "", "line": "", "comment": row.strip()})
                elif isinstance(row, dict):
                    normalised.append(row)
            raw[k] = normalised
    # Legacy suggestions_to_authors as free-text OR as a JSON list —
    # if it's a JSON list, split it out onto `suggestions`.
    sug = raw.get("suggestions_to_authors")
    if isinstance(sug, str) and sug.strip().startswith("["):
        try:
            arr = json.loads(sug)
            if isinstance(arr, list):
                raw["suggestions"] = [str(x) for x in arr if str(x).strip()]
                raw["suggestions_to_authors"] = ""
        except Exception:  # noqa: BLE001
            pass
    try:
        payload = DraftPayload(**raw)
    except Exception:  # noqa: BLE001 — corrupt draft, hand the reviewer an empty form
        payload = DraftPayload()
    return DraftResponse(payload=payload, saved_at=review.draft.saved_at)


@router.get("/assignments/{review_id}/draft", response_model=DraftResponse)
def get_draft(
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    return _draft_response(review)


@router.post("/assignments/{review_id}/draft", response_model=DraftResponse)
def save_draft(
    review_id: uuid.UUID,
    body: DraftPayload,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    if review.state == ReviewState.submitted:
        raise HTTPException(status_code=409, detail="This review has already been submitted.")
    if review.state in (ReviewState.declined, ReviewState.cancelled):
        raise HTTPException(status_code=409, detail="This assignment is no longer active.")
    payload_json = json.dumps(body.model_dump(), default=str)
    now = datetime.utcnow()
    if review.draft is None:
        review.draft = ReviewDraft(
            review_id=review.id, payload_json=payload_json, saved_at=now, updated_at=now,
        )
    else:
        review.draft.payload_json = payload_json
        review.draft.saved_at = now
        review.draft.updated_at = now
    # A saved draft implies the reviewer is now actively drafting.
    if review.state != ReviewState.in_progress:
        review.state = ReviewState.in_progress
    db.commit()
    return _draft_response(review)


# ── Agents: assistant + quality-check ───────────────────

@router.post("/assignments/{review_id}/assistant", response_model=AssistantResponse)
def review_assistant(
    review_id: uuid.UUID,
    body: DraftPayload,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    _load_review(db, review_id, reviewer)  # ownership check
    hints = run_review_assistant(body.model_dump())
    return AssistantResponse(hints=[
        AssistantHintDTO(severity=h.severity, code=h.code, message=h.message) for h in hints
    ])


@router.post("/assignments/{review_id}/quality-check", response_model=QualityCheckResponse)
def quality_check(
    review_id: uuid.UUID,
    body: DraftPayload,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    _load_review(db, review_id, reviewer)
    report = run_review_quality_check(body.model_dump())
    return QualityCheckResponse(ok=report.ok, blockers=report.blockers, warnings=report.warnings)


# ── Submit ──────────────────────────────────────────────

@router.post("/assignments/{review_id}/submit", response_model=SubmitResponse)
def submit_review(
    review_id: uuid.UUID,
    body: DraftPayload,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    review = _load_review(db, review_id, reviewer)
    if review.state == ReviewState.submitted:
        raise HTTPException(status_code=409, detail="This review has already been submitted.")

    # Server-side quality gate — blockers refuse the submit regardless
    # of what the frontend thinks. Warnings are informational.
    report = run_review_quality_check(body.model_dump())
    if not report.ok:
        raise HTTPException(status_code=422, detail={"blockers": report.blockers, "warnings": report.warnings})

    # Persist the structured fields onto the Review row. Structured
    # comment lists are stored verbatim as JSON so the editor UI can
    # render them exactly as the reviewer wrote them.
    review.overall_assessment = body.overall_assessment.strip() or None
    review.rubric_answers = json.dumps(body.rubric_answers, default=str)
    review.comments_to_authors = body.comments_to_authors.strip() or None
    # Major/Minor now carry {page, section, line, comment} — drop any
    # rows the reviewer left blank so a stray `+ Add` click doesn't
    # pollute the report.
    review.major_comments = json.dumps(
        [m.model_dump() for m in (body.major_comments or []) if m.comment.strip()],
        default=str,
    )
    review.minor_comments = json.dumps(
        [m.model_dump() for m in (body.minor_comments or []) if m.comment.strip()],
        default=str,
    )
    # Suggestions list (structured) + legacy free-text kept for
    # backward compat with the earlier form version.
    suggestions_clean = [s.strip() for s in (body.suggestions or []) if s and s.strip()]
    if suggestions_clean:
        review.suggestions_to_authors = json.dumps(suggestions_clean, default=str)
    else:
        review.suggestions_to_authors = body.suggestions_to_authors.strip() or None
    review.ethics_flag = bool(body.ethics_flag)
    review.ethics_note = body.ethics_note.strip() or None
    review.page_annotations = json.dumps(
        [a.model_dump() for a in (body.page_annotations or [])], default=str,
    )
    # Preserve any editor-confidential COI note stamped in accept_assignment.
    if body.comments_to_editor:
        review.comments_to_editor = (
            (review.comments_to_editor or "") + "\n" + body.comments_to_editor.strip()
        ).strip()
    if body.recommendation:
        try:
            review.overall_recommendation = OverallRecommendation(body.recommendation)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid recommendation value.")
    review.confidence = body.confidence
    review.willing_to_review_revision = body.willing_to_review_revision

    # Editor Summary Agent runs on the just-submitted payload with the
    # full structured input so the editor's card carries the itemised
    # comments verbatim (spec §20 — never rewrite the reviewer's prose).
    summary_text, summary_payload = run_editor_summary_agent(
        overall_assessment=body.overall_assessment or "",
        comments_to_authors=body.comments_to_authors or "",
        comments_to_editor=body.comments_to_editor or "",
        rubric_answers=body.rubric_answers or {},
        recommendation=body.recommendation or "",
        confidence=body.confidence or "",
        major_comments=[m.model_dump() for m in (body.major_comments or []) if m.comment.strip()],
        minor_comments=[m.model_dump() for m in (body.minor_comments or []) if m.comment.strip()],
        suggestions=suggestions_clean,
        suggestions_to_authors=body.suggestions_to_authors or "",
        ethics_flag=bool(body.ethics_flag),
        ethics_note=body.ethics_note or "",
        page_annotations=[a.model_dump() for a in (body.page_annotations or [])],
        round_number=review.round_number or 1,
        willing_to_review_revision=body.willing_to_review_revision,
    )
    review.editor_summary = summary_text
    review.editor_summary_json = json.dumps(summary_payload, default=str)

    now = datetime.utcnow()
    review.completed_at = now
    review.state = ReviewState.submitted
    review.status = ReviewStatus.completed
    review.link_used = True

    if review.draft is not None:
        db.delete(review.draft)
    db.commit()
    db.refresh(review)

    # Notify the editorial office — one Notification row (drives the
    # "🔔 New Reviewer Report" alert on the editor dashboard) plus
    # one email (deliberately carries NO reviewer prose per spec §6).
    _notify_editor_of_new_review(db, review)
    # WS push so the reviewer's own bell updates without a page reload.
    _push_reviewer_ws(reviewer.id, "review_submitted", {"review_id": str(review.id)})

    return SubmitResponse(
        ok=True,
        review_id=str(review.id),
        editor_summary=summary_text,
        completed_at=now,
        manuscript_id=_manuscript_display_id(review),
        recommendation=body.recommendation or None,
        confidence=body.confidence or None,
        round_number=review.round_number or 1,
        major_count=len([m for m in (body.major_comments or []) if m.comment.strip()]),
        minor_count=len([m for m in (body.minor_comments or []) if m.comment.strip()]),
        suggestions_count=len(suggestions_clean),
        annotations_count=len(body.page_annotations or []),
    )


# ── Structured Reviewer Report (read) ──────────────────

def _load_json_list(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        val = json.loads(raw)
    except Exception:  # noqa: BLE001
        return []
    return val if isinstance(val, list) else []


def _load_json_dict(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        val = json.loads(raw)
    except Exception:  # noqa: BLE001
        return {}
    return val if isinstance(val, dict) else {}


def _push_reviewer_ws(reviewer_id, event: str, meta: dict | None = None) -> None:
    """Fire a lightweight WS ping to the reviewer's bell topic."""
    try:
        from app.services import pubsub
        pubsub.publish_threadsafe(
            f"reviewer:{reviewer_id}",
            {"event": event, "meta": meta or {}},
        )
    except Exception:  # noqa: BLE001
        pass


def _notify_editor_of_new_review(db: Session, review: Review) -> None:
    """Record a Notification row and dispatch the editor email when a
    reviewer submits their report. Best-effort — a mail-delivery
    failure does NOT roll back the review submission; the reviewer's
    work is already persisted and the notification row records the
    outcome for the editor's audit view."""
    from app.config import settings
    from app.models.notification import Notification, NotificationChannel, NotificationStatus
    from app.models.user import User
    from app.services.editor_auth import EDITOR_ROLES
    from app.services.email_service import notify_editor_new_review

    # Resolve the editor address of record. Prefer the configured
    # EDITORIAL_INBOX_EMAIL; fall back to the first active editor.
    editor_email = (settings.EDITORIAL_INBOX_EMAIL or "").strip()
    if not editor_email:
        first_editor = (
            db.query(User)
            .filter(User.role.in_(EDITOR_ROLES), User.is_active.is_(True))
            .order_by(User.id.asc())
            .first()
        )
        if first_editor is not None:
            editor_email = first_editor.email
    if not editor_email:
        logger.warning(
            "reviewer_portal.submit: no editor address configured — "
            "notification row/email skipped for review %s",
            review.id,
        )
        return

    manuscript_id = _manuscript_display_id(review)
    submission = review.submission
    paper_title = submission.paper_title if submission else "Manuscript"
    reviewer_name = _reviewer_display_for(review)
    recommendation = (
        review.overall_recommendation.value if review.overall_recommendation else "unspecified"
    )
    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    portal_url = f"{frontend}/editor/reviewer-report/{review.id}" if frontend else f"/editor/reviewer-report/{review.id}"

    # 1) Editor-dashboard row — same trigger_event the WS notifier and
    #    the editor's Notifications feed already understand.
    try:
        row = Notification(
            recipient_email=editor_email,
            channel=NotificationChannel.email,
            trigger_event=f"reviewer_report_submitted:{review.id}",
            message_body=(
                f"{reviewer_name} submitted a {recommendation.replace('_', ' ')} "
                f"recommendation for {manuscript_id} — {paper_title}."
            ),
            status=NotificationStatus.pending,
        )
        db.add(row)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("reviewer_portal.submit: notification row insert failed")
        row = None

    # 2) Email — deliberately no reviewer prose (spec §6).
    try:
        ok = notify_editor_new_review(
            editor_email=editor_email,
            manuscript_id=manuscript_id,
            paper_title=paper_title,
            reviewer_display_name=reviewer_name,
            recommendation=recommendation,
            round_number=review.round_number or 1,
            portal_url=portal_url,
        )
    except Exception:  # noqa: BLE001
        logger.exception("reviewer_portal.submit: editor email dispatch failed")
        ok = False

    if row is not None:
        try:
            row.status = NotificationStatus.sent if ok else NotificationStatus.failed
            row.sent_at = datetime.utcnow() if ok else None
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception(
                "reviewer_portal.submit: notification-row status update failed"
            )


def _reviewer_display_for(review: Review) -> str:
    """Editors see all reviewers on a paper as 'Anonymous Reviewer #N'
    where N is the 1-indexed position of this review on the parent
    submission's roster. Keeps the reviewer anonymous while still
    letting the editor tell reviewers apart across the paper."""
    submission = review.submission
    if submission is None:
        return "Anonymous Reviewer"
    ordered = sorted(
        submission.reviews or [],
        key=lambda r: r.assigned_at or datetime.min,
    )
    for idx, r in enumerate(ordered, start=1):
        if r.id == review.id:
            return f"Anonymous Reviewer #{idx}"
    return "Anonymous Reviewer"


def _report_from_review(review: Review) -> ReviewerReport:
    submission = review.submission
    majors_raw = _load_json_list(review.major_comments)
    minors_raw = _load_json_list(review.minor_comments)
    def _norm(items: list) -> List[StructuredComment]:
        out: List[StructuredComment] = []
        for row in items:
            if isinstance(row, str) and row.strip():
                out.append(StructuredComment(comment=row.strip()))
            elif isinstance(row, dict) and str(row.get("comment") or "").strip():
                out.append(StructuredComment(
                    page=str(row.get("page") or "")[:32],
                    section=str(row.get("section") or "")[:120],
                    line=str(row.get("line") or "")[:64],
                    comment=str(row.get("comment")).strip(),
                ))
        return out

    # Suggestions may be stored as a JSON list OR a bare string; both
    # accepted so old rows still render.
    sug_raw = review.suggestions_to_authors or ""
    try:
        sug_json = json.loads(sug_raw) if sug_raw else None
    except Exception:  # noqa: BLE001
        sug_json = None
    if isinstance(sug_json, list):
        suggestions = [str(s).strip() for s in sug_json if str(s).strip()]
    else:
        suggestions = [sug_raw.strip()] if sug_raw.strip() else []

    annotations_raw = _load_json_list(review.page_annotations)
    annotations: List[PageAnnotation] = []
    for row in annotations_raw:
        if not isinstance(row, dict):
            continue
        try:
            annotations.append(PageAnnotation(
                page=int(row.get("page") or 1),
                lines=str(row.get("lines") or "")[:64],
                type=str(row.get("type") or "suggestion"),
                text=str(row.get("text") or "").strip(),
            ))
        except Exception:  # noqa: BLE001
            continue

    return ReviewerReport(
        review_id=str(review.id),
        manuscript_id=_manuscript_display_id(review),
        paper_title=(submission.paper_title if submission else "Manuscript"),
        reviewer_display_name=_reviewer_display_for(review),
        round_number=review.round_number or 1,
        state=(review.state.value if review.state else "invited"),
        submitted_at=review.completed_at,
        overall_assessment=review.overall_assessment or "",
        rubric_answers=_load_json_dict(review.rubric_answers),
        major_comments=_norm(majors_raw),
        minor_comments=_norm(minors_raw),
        suggestions=suggestions,
        comments_to_authors=review.comments_to_authors or "",
        comments_to_editor=review.comments_to_editor or "",
        ethics_flag=bool(review.ethics_flag),
        ethics_note=review.ethics_note or "",
        page_annotations=annotations,
        recommendation=(
            review.overall_recommendation.value if review.overall_recommendation else None
        ),
        confidence=review.confidence,
        willing_to_review_revision=review.willing_to_review_revision,
        editor_summary=review.editor_summary or "",
    )


def _report_from_draft(review: Review, draft: DraftPayload) -> ReviewerReport:
    """Build a Reviewer Report projection from an in-progress draft."""
    return ReviewerReport(
        review_id=str(review.id),
        manuscript_id=_manuscript_display_id(review),
        paper_title=(review.submission.paper_title if review.submission else "Manuscript"),
        reviewer_display_name=_reviewer_display_for(review),
        round_number=review.round_number or 1,
        state=(review.state.value if review.state else "in_progress"),
        submitted_at=None,
        overall_assessment=draft.overall_assessment,
        rubric_answers=draft.rubric_answers,
        major_comments=[m for m in draft.major_comments if m.comment.strip()],
        minor_comments=[m for m in draft.minor_comments if m.comment.strip()],
        suggestions=[s for s in draft.suggestions if s.strip()],
        comments_to_authors=draft.comments_to_authors,
        comments_to_editor=draft.comments_to_editor,
        ethics_flag=bool(draft.ethics_flag),
        ethics_note=draft.ethics_note,
        page_annotations=draft.page_annotations,
        recommendation=draft.recommendation,
        confidence=draft.confidence,
        willing_to_review_revision=draft.willing_to_review_revision,
        editor_summary="",
    )


@router.get("/assignments/{review_id}/report", response_model=ReviewerReport)
def get_report(
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    """Return the structured Reviewer Report for a completed review.

    404 if the review isn't submitted yet (drafts don't have a final
    report; the reviewer should hit /preview instead).
    """
    review = _load_review(db, review_id, reviewer)
    if review.state != ReviewState.submitted:
        raise HTTPException(status_code=404, detail="Review not submitted yet — use /preview.")
    return _report_from_review(review)


@router.post("/assignments/{review_id}/preview", response_model=PreviewResponse)
def preview_report(
    review_id: uuid.UUID,
    body: DraftPayload,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    """The Preview Review button (spec §9) → render the report exactly
    as the editor will see it, plus the Review Validation Agent
    verdict so the reviewer knows whether Submit will succeed."""
    review = _load_review(db, review_id, reviewer)
    report = _report_from_draft(review, body)
    v = run_review_quality_check(body.model_dump())
    counts = ReportCounts(
        major=len(report.major_comments),
        minor=len(report.minor_comments),
        suggestions=len(report.suggestions),
        annotations=len(report.page_annotations),
    )
    return PreviewResponse(
        report=report,
        counts=counts,
        validation_ok=v.ok,
        validation_blockers=v.blockers,
        validation_warnings=v.warnings,
    )


# ── History / Notifications ─────────────────────────────

@router.get("/history", response_model=List[AssignmentSummary])
def history(
    year: Optional[int] = Query(None),
    recommendation: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    """History = every review row for the reviewer, most recent first,
    optionally narrowed by year / recommendation / state."""
    rows = [_assignment_summary(r) for r in _assignments_for(reviewer)]
    if year is not None:
        rows = [r for r in rows if (r.completed_at or r.assigned_at).year == year]
    if recommendation:
        rows = [r for r in rows if (r.recommendation or "") == recommendation]
    if state:
        rows = [r for r in rows if r.state == state]
    return rows


@router.get("/notifications", response_model=List[Alert])
def notifications(
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    """A single feed of every dashboard-alert-eligible event for the
    reviewer, ordered newest first. Same shape as ``/dashboard.alerts``
    but not capped at 3."""
    now = datetime.utcnow()
    feed: List[Alert] = []
    for r in _assignments_for(reviewer):
        s = _assignment_summary(r)
        if s.state == "invited":
            feed.append(Alert(
                kind="new_invite",
                title="New review invitation",
                detail=f"You were invited to review {s.paper_title}.",
                action_url=f"/reviewer/assignment/{s.review_id}",
                review_id=s.review_id,
            ))
        if s.state in ("invited", "in_progress") and s.deadline:
            days = (s.deadline - now).days
            if 0 <= days <= 7:
                feed.append(Alert(
                    kind="deadline",
                    title="Deadline reminder",
                    detail=f"{s.paper_title} is due in {days} day(s).",
                    action_url=f"/reviewer/assignment/{s.review_id}/review",
                    review_id=s.review_id,
                ))
        if s.state == "submitted" and s.completed_at:
            feed.append(Alert(
                kind="submitted",
                title="Review submitted",
                detail=f"Your review for {s.paper_title} was submitted.",
                action_url=f"/reviewer/assignment/{s.review_id}",
                review_id=s.review_id,
            ))
    return feed


# ── Profile ─────────────────────────────────────────────

@router.get("/profile", response_model=ProfileResponse)
def get_profile(reviewer: Reviewer = Depends(get_current_reviewer)):
    return ProfileResponse(
        name=reviewer.name,
        email=reviewer.email,
        phone=reviewer.phone,
        country=reviewer.country,
        institution=reviewer.institution,
        department=reviewer.department,
        designation=reviewer.designation,
        expertise_tags=list(reviewer.expertise_tags or []),
        orcid=reviewer.orcid,
        scopus_id=reviewer.scopus_id,
        google_scholar=reviewer.google_scholar,
    )


@router.patch("/profile", response_model=ProfileResponse)
def patch_profile(
    body: ProfilePatch,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    data = body.model_dump(exclude_unset=True)
    for field_name, value in data.items():
        setattr(reviewer, field_name, value)
    db.commit()
    return get_profile(reviewer)


# ── Availability ────────────────────────────────────────

def _availability(reviewer: Reviewer) -> AvailabilityResponse:
    now = datetime.utcnow()
    in_window = bool(
        reviewer.unavailable_from and reviewer.unavailable_until
        and reviewer.unavailable_from <= now <= reviewer.unavailable_until
    )
    return AvailabilityResponse(
        available=reviewer.is_active and not in_window,
        current_load=_reviewer_load(reviewer),
        max_assignments=reviewer.max_assignments,
        unavailable_from=reviewer.unavailable_from,
        unavailable_until=reviewer.unavailable_until,
        preferred_areas=list(reviewer.expertise_tags or []),
    )


@router.get("/availability", response_model=AvailabilityResponse)
def get_availability(reviewer: Reviewer = Depends(get_current_reviewer)):
    return _availability(reviewer)


@router.patch("/availability", response_model=AvailabilityResponse)
def patch_availability(
    body: AvailabilityPatch,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    if body.max_assignments is not None:
        reviewer.max_assignments = body.max_assignments
    if body.clear_unavailable:
        reviewer.unavailable_from = None
        reviewer.unavailable_until = None
    else:
        if body.unavailable_from is not None:
            reviewer.unavailable_from = body.unavailable_from
        if body.unavailable_until is not None:
            reviewer.unavailable_until = body.unavailable_until
        if reviewer.unavailable_from and reviewer.unavailable_until and reviewer.unavailable_from > reviewer.unavailable_until:
            raise HTTPException(status_code=400, detail="Unavailable-from must be before unavailable-until.")
    db.commit()
    return _availability(reviewer)


# ── Security ────────────────────────────────────────────

@router.get("/security", response_model=SecurityResponse)
def get_security(reviewer: Reviewer = Depends(get_current_reviewer)):
    return SecurityResponse(
        email=reviewer.email,
        email_verified=reviewer.email_verified_at is not None,
        password_last_changed_at=None,  # not tracked per-reviewer yet
        twofa_enabled=False,             # reviewer TOTP not exposed yet
        active_sessions=1,               # single-session model for reviewers
    )


# ── Rubric schema ───────────────────────────────────────

# ── PDF stream for the review workspace side-by-side viewer ─
#
# The reviewer form's PDF panel points at this endpoint. It streams
# the manuscript PDF only when the requesting reviewer has an active
# assignment against the file's submission — a reviewer never gets to
# read a paper they weren't invited on.

def _reviewer_from_query_token(token: Optional[str], db: Session) -> Reviewer:
    """PDF viewer helper — an ``<iframe src>`` cannot attach an
    Authorization header, so the frontend appends ``?token=…`` on this
    one endpoint. Same signature validation as ``get_current_reviewer``,
    just sourcing the JWT from the query string."""
    from jose import JWTError, jwt as _jwt
    from uuid import UUID
    from app.config import settings as _s

    unauth = HTTPException(status_code=401, detail="Not authorised.")
    if not token:
        raise unauth
    try:
        payload = _jwt.decode(token, _s.SECRET_KEY, algorithms=[_s.ALGORITHM])
    except JWTError:
        raise unauth
    if payload.get("role") != "reviewer" or payload.get("scope") not in (None, "session"):
        raise unauth
    sub = payload.get("sub")
    try:
        reviewer_id = UUID(str(sub))
    except (ValueError, AttributeError):
        raise unauth
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None or not reviewer.is_active:
        raise unauth
    return reviewer


@router.get("/files/{file_id}/pdf")
def stream_manuscript_pdf(
    file_id: str,
    token: Optional[str] = Query(None, description="Reviewer session JWT (iframes cannot send Authorization headers)"),
    db: Session = Depends(get_db),
):
    """Stream a manuscript PDF to the reviewer's inline viewer.

    Accepts two ID shapes:

    * ``<int>`` — a real ``ManuscriptFile.id`` (versioned uploads).
      302-redirects the browser to the stored URL so the FastAPI
      worker never proxies megabytes.

    * ``sub-<submission_uuid>`` / ``sub-<submission_uuid>-redacted`` —
      a synthetic id for submissions that landed the PDF on
      ``submission.pdf_url`` directly (no ManuscriptVersion). The
      endpoint reads the bytes via ``storage_service.download_bytes``
      and streams them inline, since local paths can't be redirected
      to and S3 URLs may not be publicly readable.
    """
    reviewer = _reviewer_from_query_token(token, db)

    # ── Synthetic ID path — submission-level PDF ─────────
    if file_id.startswith("sub-"):
        rest = file_id[len("sub-"):]
        is_redacted = rest.endswith("-redacted")
        if is_redacted:
            rest = rest[: -len("-redacted")]
        try:
            submission_uuid = uuid.UUID(rest)
        except (ValueError, AttributeError):
            raise HTTPException(status_code=404, detail="File not found.")
        # Ownership check — reviewer must have a Review against this
        # submission. Same guarantee as the ManuscriptFile branch.
        owned = (
            db.query(Review)
            .filter(
                Review.reviewer_id == reviewer.id,
                Review.submission_id == submission_uuid,
            )
            .first()
        )
        if owned is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this manuscript.")

        submission = (
            db.query(Submission).filter(Submission.id == submission_uuid).first()
        )
        if submission is None:
            raise HTTPException(status_code=404, detail="Submission not found.")

        url_val = (
            getattr(submission, "redacted_pdf_url", None)
            if is_redacted else None
        ) or getattr(submission, "pdf_url", None)
        if not url_val:
            raise HTTPException(status_code=404, detail="No manuscript file on this submission.")

        # Public HTTPS URL — hand the browser a redirect so we don't
        # proxy. Local file → stream the bytes directly.
        if url_val.startswith("http://") or url_val.startswith("https://"):
            return RedirectResponse(url_val, status_code=302)
        try:
            from app.services.storage_service import download_bytes
            data = download_bytes(url_val)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        from fastapi.responses import Response
        paper_id = getattr(submission, "paper_id_code", None) or str(submission.id)[:8]
        filename = (
            f"{paper_id}_manuscript{'_anonymized' if is_redacted else ''}.pdf"
        )
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )

    # ── ManuscriptFile path — versioned uploads ─────────
    try:
        file_pk = int(file_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found.")
    f = db.query(ManuscriptFile).filter(ManuscriptFile.id == file_pk).first()
    if f is None:
        raise HTTPException(status_code=404, detail="File not found.")
    version = f.version
    if version is None:
        raise HTTPException(status_code=404, detail="File version missing.")
    owned = (
        db.query(Review)
        .filter(
            Review.reviewer_id == reviewer.id,
            Review.submission_id == version.submission_id,
        )
        .first()
    )
    if owned is None:
        raise HTTPException(status_code=403, detail="You are not assigned to this manuscript.")
    if not f.stored_url:
        raise HTTPException(status_code=404, detail="File has no storage URL.")
    return RedirectResponse(f.stored_url, status_code=302)


# ── Annotation Assistant Agent endpoint ────────────────

class AnnotationSuggestRequest(BaseModel):
    selected_text: str


class AnnotationSuggestResponse(BaseModel):
    suggested_type: str
    suggested_prompt: str
    keyword_hits: List[str]


@router.post(
    "/assignments/{review_id}/annotation-assistant",
    response_model=AnnotationSuggestResponse,
)
def annotation_assistant(
    review_id: uuid.UUID,
    body: AnnotationSuggestRequest,
    db: Session = Depends(get_db),
    reviewer: Reviewer = Depends(get_current_reviewer),
):
    """Classify a pasted PDF selection into major / minor / suggestion
    and hand back a starter prompt the reviewer edits before saving."""
    from app.agents.reviewer_agents import run_annotation_assistant

    _load_review(db, review_id, reviewer)  # ownership check
    result = run_annotation_assistant(selected_text=body.selected_text)
    return AnnotationSuggestResponse(
        suggested_type=result["suggested_type"],
        suggested_prompt=result["suggested_prompt"],
        keyword_hits=result["keyword_hits"],
    )


@router.get("/rubric", response_model=RubricResponse)
def get_rubric():
    return RubricResponse(
        questions=[
            RubricQuestionDTO(
                key=q.key, prompt=q.prompt, mandatory=q.mandatory,
                kind=q.kind, section=q.section,
                options=[RubricOptionDTO(value=o.value, label=o.label) for o in q.options],
            )
            for q in RUBRIC
        ],
        recommendations=[RubricOptionDTO(value=v, label=l) for v, l in RECOMMENDATION_OPTIONS],
        confidences=[RubricOptionDTO(value=v, label=l) for v, l in CONFIDENCE_OPTIONS],
    )
