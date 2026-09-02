"""Bid Room aggregator — one endpoint that hydrates the editor's
per-submission workspace in a single round-trip.

Consolidates data the editor UI otherwise stitches together from four
separate calls (submission detail, per-reviewer status, decision
briefing, transition log). Read-only; write actions (send reminder,
finalise decision, etc.) still route through their dedicated endpoints
so authorisation stays enforced at the mutation surface.

Reviewer-side privacy: the editor view exposes reviewer identities +
their comments to editor. The reviewer's own portal (/reviewer-portal)
never uses this endpoint — reviewers only see their own review row via
that separate surface.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission
from app.models.user import User
from app.services.editor_auth import require_editor_mfa


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class BidRoomReviewer(BaseModel):
    review_id: str
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    status: str                           # pending / completed / expired
    state: Optional[str] = None           # invited / accepted / in_progress / submitted / declined / overdue / cancelled / expired
    assigned_at: datetime
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    overall_recommendation: Optional[str] = None
    days_overdue: int = 0
    is_overdue: bool = False


class BidRoomProgress(BaseModel):
    total: int
    completed: int
    in_progress: int
    not_started: int
    overdue: int
    percent: int


class BidRoomTimelineEvent(BaseModel):
    at: datetime
    kind: str                             # submission_created / reviewer_assigned / reviewer_accepted / reviewer_completed / decision_transition
    label: str
    actor: Optional[str] = None


class BidRoomResponse(BaseModel):
    submission_id: str
    paper_id_code: Optional[str] = None
    paper_title: str
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    submitted_at: datetime
    status: str
    reviewers: List[BidRoomReviewer]
    progress: BidRoomProgress
    timeline: List[BidRoomTimelineEvent]


# ── Endpoint ────────────────────────────────────────────

@router.get("/bid-room/{submission_id}", response_model=BidRoomResponse)
def bid_room(
    submission_id: str,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> BidRoomResponse:
    """Aggregate everything the Bid Room page needs. Accepts either the
    UUID or the paper_id_code."""
    submission: Optional[Submission] = None
    try:
        submission = db.query(Submission).filter(Submission.id == UUID(str(submission_id))).first()
    except (ValueError, TypeError):
        submission = db.query(Submission).filter(Submission.paper_id_code == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = (
        db.query(Review)
        .options(joinedload(Review.reviewer))
        .filter(Review.submission_id == submission.id)
        .order_by(Review.assigned_at)
        .all()
    )

    now = datetime.utcnow()
    reviewers: list[BidRoomReviewer] = []
    completed = in_progress = not_started = overdue = 0
    for r in reviews:
        state_val = r.state.value if r.state else None
        status_val = r.status.value if r.status else "pending"
        is_overdue = (
            status_val != "completed"
            and r.link_expires_at is not None
            and r.link_expires_at < now
        )
        days_overdue = max(0, (now - r.link_expires_at).days) if r.link_expires_at and is_overdue else 0

        if status_val == "completed":
            completed += 1
        elif is_overdue:
            overdue += 1
        elif state_val in ("accepted", "in_progress"):
            in_progress += 1
        else:
            not_started += 1

        reviewers.append(
            BidRoomReviewer(
                review_id=str(r.id),
                reviewer_id=str(r.reviewer_id) if r.reviewer_id else None,
                reviewer_name=(r.reviewer.name if r.reviewer else None),
                reviewer_email=(r.reviewer.email if r.reviewer else None),
                status=status_val,
                state=state_val,
                assigned_at=r.assigned_at,
                accepted_at=r.accepted_at,
                completed_at=r.completed_at,
                deadline=r.link_expires_at,
                overall_recommendation=(
                    r.overall_recommendation.value if r.overall_recommendation else None
                ),
                days_overdue=days_overdue,
                is_overdue=is_overdue,
            )
        )

    total = len(reviews)
    percent = int((completed / total) * 100) if total > 0 else 0
    progress = BidRoomProgress(
        total=total, completed=completed, in_progress=in_progress,
        not_started=not_started, overdue=overdue, percent=percent,
    )

    # Timeline — merge from three signals into a flat, sorted list.
    # More sources (state-machine transitions, editor decisions) can be
    # bolted on later without changing the response shape.
    events: list[BidRoomTimelineEvent] = []
    events.append(BidRoomTimelineEvent(
        at=submission.submitted_at,
        kind="submission_created",
        label="Paper submitted by author",
        actor=submission.author_name,
    ))
    for r in reviews:
        events.append(BidRoomTimelineEvent(
            at=r.assigned_at, kind="reviewer_assigned",
            label=f"Reviewer assigned{' ('+r.reviewer.name+')' if r.reviewer else ''}",
        ))
        if r.accepted_at:
            events.append(BidRoomTimelineEvent(
                at=r.accepted_at, kind="reviewer_accepted",
                label=f"{r.reviewer.name if r.reviewer else 'Reviewer'} accepted",
            ))
        if r.completed_at:
            events.append(BidRoomTimelineEvent(
                at=r.completed_at, kind="reviewer_completed",
                label=(
                    f"{r.reviewer.name if r.reviewer else 'Reviewer'} submitted "
                    f"({r.overall_recommendation.value if r.overall_recommendation else 'no rec'})"
                ),
            ))
    events.sort(key=lambda e: e.at)

    return BidRoomResponse(
        submission_id=str(submission.id),
        paper_id_code=submission.paper_id_code,
        paper_title=submission.paper_title,
        author_name=submission.author_name,
        author_email=submission.author_email,
        submitted_at=submission.submitted_at,
        status=submission.status.value if submission.status else "unknown",
        reviewers=reviewers,
        progress=progress,
        timeline=events,
    )


# ── Send-reminder action ────────────────────────────────

class RemindResponse(BaseModel):
    ok: bool = True
    email_sent: bool
    reviewer_email: str


class ResendInvitationResponse(BaseModel):
    ok: bool = True
    email_sent: bool
    reviewer_email: str
    message: str


# ── Reviewer comparison (spec Review-Room §7 + §comparison) ──

class ComparisonRow(BaseModel):
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    status: str
    overall_recommendation: Optional[str] = None
    score_originality: Optional[float] = None
    score_technical: Optional[float] = None
    score_relevance: Optional[float] = None
    score_clarity: Optional[float] = None
    score_references: Optional[float] = None
    ethics_flag: bool = False
    confidence: Optional[str] = None


class ComparisonResponse(BaseModel):
    dimensions: List[str]                    # order the UI should render columns in
    rows: List[ComparisonRow]
    unique_recommendations: List[str]        # e.g. ['accept', 'major_revision', 'reject'] — non-empty ⇒ conflict
    has_conflict: bool


@router.get(
    "/bid-room/{submission_id}/comparison",
    response_model=ComparisonResponse,
)
def reviewer_comparison(
    submission_id: str,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> ComparisonResponse:
    """Side-by-side per-dimension comparison across the reviewers on
    this submission. Used by the Review Room's comparison table.

    A recommendation is considered a 'conflict' whenever completed
    reviewers picked more than one bucket — the editor sees the
    conflict banner + is nudged toward the Decision Workspace."""
    submission: Optional[Submission] = None
    try:
        submission = db.query(Submission).filter(Submission.id == UUID(str(submission_id))).first()
    except (ValueError, TypeError):
        submission = db.query(Submission).filter(Submission.paper_id_code == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = (
        db.query(Review)
        .options(joinedload(Review.reviewer))
        .filter(Review.submission_id == submission.id)
        .order_by(Review.assigned_at)
        .all()
    )

    rows: list[ComparisonRow] = []
    recs: list[str] = []
    for r in reviews:
        rec = r.overall_recommendation.value if r.overall_recommendation else None
        if r.status == ReviewStatus.completed and rec:
            recs.append(rec)
        rows.append(
            ComparisonRow(
                reviewer_id=str(r.reviewer_id) if r.reviewer_id else None,
                reviewer_name=(r.reviewer.name if r.reviewer else None),
                status=r.status.value if r.status else "pending",
                overall_recommendation=rec,
                score_originality=r.score_originality,
                score_technical=r.score_technical,
                score_relevance=r.score_relevance,
                score_clarity=r.score_clarity,
                score_references=r.score_references,
                ethics_flag=bool(r.ethics_flag),
                confidence=r.confidence,
            )
        )

    unique = sorted(set(recs))
    return ComparisonResponse(
        dimensions=[
            "originality", "technical", "relevance", "clarity", "references",
        ],
        rows=rows,
        unique_recommendations=unique,
        has_conflict=len(unique) > 1,
    )


@router.post("/bid-room/reviews/{review_id}/remind", response_model=RemindResponse)
def remind_reviewer(
    review_id: str,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> RemindResponse:
    """Send a deadline nudge to the reviewer on this review row. Uses
    the shared email pipeline so delivery lands in the notification
    log."""
    review = (
        db.query(Review)
        .options(joinedload(Review.reviewer), joinedload(Review.submission))
        .filter(Review.id == UUID(str(review_id)))
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    if not review.reviewer or not review.reviewer.email:
        raise HTTPException(
            status_code=409,
            detail="Reviewer contact is missing — cannot send a reminder.",
        )
    if review.status == ReviewStatus.completed:
        raise HTTPException(status_code=409, detail="Review already completed.")

    from app.services.email_service import _btn, _send_and_log, _wrap
    from app.config import settings

    review_url = f"{(settings.FRONTEND_URL or '').rstrip('/')}/review/{review.link_token}"
    days_left = 0
    if review.link_expires_at:
        days_left = max(0, (review.link_expires_at - datetime.utcnow()).days)

    body = _wrap(
        f"""
        <p>Dear {review.reviewer.name},</p>
        <p>This is a friendly reminder that your review for
           <strong>{review.submission.paper_title if review.submission else 'a manuscript'}</strong>
           is <strong>{days_left} day{'s' if days_left != 1 else ''}</strong> away from its deadline.</p>
        <div style="text-align:center;">{_btn("Continue review", review_url)}</div>
        <p style="font-size:13px;color:#6b7280;">
          If you can no longer complete this review, please let us know so we can reassign it.
        </p>
        <p>Regards,<br><strong>Editorial Office</strong></p>
        """
    )
    email_sent = _send_and_log(
        review.reviewer.email,
        f"Reminder: review deadline approaching{' ('+str(days_left)+' days)' if days_left else ''}",
        body,
        "reviewer_reminder",
    )
    return RemindResponse(email_sent=email_sent, reviewer_email=review.reviewer.email)


# ── Resend per-paper invitation ─────────────────────────────
#
# The panel-membership resend (POST /reviewers/{id}/resend-invitation)
# refuses when the reviewer has already accepted their panel-level
# invitation — because it's scoped to panel activation, not to a
# per-paper assignment. This endpoint is the correct one for the
# Review Room's "Resend invitation" action: it re-fires Agent 5's
# per-paper review invitation for a specific Review row, so an editor
# can re-send the invitation regardless of the reviewer's panel state
# (fresh reviewer + fresh manuscript both get the credentialed
# template; an activated reviewer + a manuscript gets the assignment
# variant). Gated by editor MFA — the same gate that runs the initial
# assignment.

@router.post(
    "/bid-room/reviews/{review_id}/resend-invitation",
    response_model=ResendInvitationResponse,
)
def resend_review_invitation(
    review_id: str,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> ResendInvitationResponse:
    """Re-fire the per-paper review invitation email for this Review
    row via Agent 5. Runs regardless of the reviewer's panel-invitation
    state, since this is a per-assignment message, not a panel-level
    one. Refuses only when:
      * the row does not exist
      * the reviewer contact is missing
      * the review is already completed (nothing to invite for)
    """
    review = (
        db.query(Review)
        .options(joinedload(Review.reviewer), joinedload(Review.submission))
        .filter(Review.id == UUID(str(review_id)))
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    if not review.reviewer or not review.reviewer.email:
        raise HTTPException(
            status_code=409,
            detail="Reviewer contact is missing — cannot resend.",
        )
    if review.status == ReviewStatus.completed:
        raise HTTPException(
            status_code=409,
            detail="This review is already completed — nothing to resend.",
        )

    from app.config import settings

    submission = review.submission
    paper_id_display = (
        getattr(submission, "paper_id_code", None)
        or (f"#{str(submission.id)[:8]}" if submission else "unassigned")
        or "unassigned"
    )
    paper_title = getattr(submission, "paper_title", None) or "(untitled manuscript)"
    article_type = (
        getattr(submission, "classified_field", None) if submission else None
    ) or "Research Article"

    # Rebuild the review_data dict Agent 5 expects and reuse the same
    # code path the assignment pipeline uses — so the resend email
    # matches the initial invitation byte-for-byte (barring the fresh
    # credentials on the never-activated path).
    review_data = {
        "review_id": str(review.id),
        "reviewer_id": str(review.reviewer_id),
        "reviewer_name": review.reviewer.name,
        "reviewer_email": review.reviewer.email,
        "reviewer_whatsapp": getattr(review.reviewer, "whatsapp_number", None),
        "review_url": (
            f"{(settings.FRONTEND_URL or '').rstrip('/')}/review/{review.link_token}"
        ),
        "token": review.link_token,
        "expires_at": (
            review.link_expires_at.isoformat() if review.link_expires_at else ""
        ),
    }

    # Best-effort PDF fetch — same policy as the assignment path:
    # prefer redacted, fall back to full, silently omit if missing.
    pdf_attachments: list[dict] = []
    pdf_url = (
        getattr(submission, "redacted_pdf_url", None)
        or getattr(submission, "pdf_url", None)
        if submission else None
    )
    if pdf_url:
        try:
            from app.services.storage_service import download_bytes
            pdf_bytes = download_bytes(pdf_url)
            pdf_is_redacted = bool(getattr(submission, "redacted_pdf_url", None))
            filename = (
                f"{paper_id_display}_manuscript"
                f"{'_anonymized' if pdf_is_redacted else ''}.pdf"
            ).replace("/", "-").replace("\\", "-")
            pdf_attachments = [{
                "filename": filename,
                "content": pdf_bytes,
                "content_type": "application/pdf",
            }]
        except Exception:  # noqa: BLE001
            pass

    from app.agents.agent5_notification import NotificationBotAgent
    email_sent = True
    try:
        NotificationBotAgent(db)._send_reviewer_email(
            review_data, paper_id_display, paper_title, article_type,
            pdf_attachments=pdf_attachments,
        )
    except Exception as exc:  # noqa: BLE001
        # Send failures do not raise — surface them through the
        # response payload so the frontend can toast the editor.
        email_sent = False
        return ResendInvitationResponse(
            ok=False,
            email_sent=False,
            reviewer_email=review.reviewer.email,
            message=f"Resend attempted but delivery failed: {exc}",
        )

    return ResendInvitationResponse(
        email_sent=email_sent,
        reviewer_email=review.reviewer.email,
        message=(
            f"Invitation for {paper_id_display} resent to {review.reviewer.email}."
        ),
    )
