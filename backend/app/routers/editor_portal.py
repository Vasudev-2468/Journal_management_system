"""
Editor Portal API — Agent-based editorial workflow endpoints.

Provides endpoints for:
  - Consult party format review & reviewer suggestion
  - Editor reviewer assignment with agent pipeline
  - Format check report retrieval
  - Submission agent status
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.editor_auth import require_editor_mfa
from app.services.review_service import (
    count_overdue_reviews,
    submissions_with_overdue_reviews,
)
from app.models.submission import Submission, SubmissionStatus
from app.models.reviewer import Reviewer
from app.models.notification import Notification
from app.tasks import (
    run_agent_intake_pipeline,
    run_agent_reviewer_suggestion,
    run_agent_reviewer_assignment,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────

class ConsultPartyReviewerSuggestion(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    orcid: Optional[str] = ""
    affiliation: Optional[str] = ""
    expertise: Optional[str] = ""


class ConsultPartyDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject)$")
    comments: Optional[str] = ""
    suggested_reviewers: List[ConsultPartyReviewerSuggestion] = Field(default_factory=list)


class TriggerAgentPipelineRequest(BaseModel):
    consult_party_email: Optional[EmailStr] = None


class EditorAssignReviewersRequest(BaseModel):
    reviewer_ids: List[uuid.UUID] = Field(..., min_length=2, max_length=4)


class FormatCheckReportResponse(BaseModel):
    paper_id_code: Optional[str]
    overall: Optional[str]
    checks: Optional[list] = []
    checked_at: Optional[str]
    passed: int = 0
    warnings: int = 0
    failures: int = 0


class SubmissionAgentStatusResponse(BaseModel):
    submission_id: uuid.UUID
    paper_id_code: Optional[str]
    status: str
    format_check_report: Optional[dict] = None
    consult_party_email: Optional[str] = None
    consult_party_decision: Optional[str] = None
    suggested_reviewers: Optional[list] = None


# ── Endpoints ────────────────────────────────────────────

@router.post("/trigger-pipeline/{submission_id}")
def trigger_agent_pipeline(
    submission_id: uuid.UUID,
    body: TriggerAgentPipelineRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Manually trigger the agent intake pipeline (Stages 1+2) for a submission."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    run_agent_intake_pipeline.delay(
        str(submission_id),
        consult_party_email=body.consult_party_email,
    )
    return {
        "message": "Agent pipeline triggered",
        "submission_id": str(submission_id),
        "stages": "1 (Acknowledgement) + 2 (Format Validation)",
    }


@router.get("/format-report/{submission_id}", response_model=FormatCheckReportResponse)
def get_format_report(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get the format check report for a submission (requires MFA-verified editor)."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    report = submission.format_check_report or {}
    return FormatCheckReportResponse(
        paper_id_code=submission.paper_id_code,
        overall=report.get("overall"),
        checks=report.get("checks", []),
        checked_at=report.get("checked_at"),
        passed=report.get("passed", 0),
        warnings=report.get("warnings", 0),
        failures=report.get("failures", 0),
    )


@router.post("/consult-party-decision/{submission_id}")
def submit_consult_party_decision(
    submission_id: uuid.UUID,
    body: ConsultPartyDecisionRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """
    Consult party submits their format review decision + optional reviewer suggestions.
    Triggers Agent 3 (Reviewer Suggester).
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status not in (
        SubmissionStatus.awaiting_consult_review,
        SubmissionStatus.awaiting_format_check,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Submission is not awaiting consult review (current: {submission.status.value})",
        )

    # Record decision
    submission.consult_party_decision = body.decision
    submission.consult_party_comments = body.comments
    db.commit()

    if body.decision == "reject":
        # Return to author
        submission.status = SubmissionStatus.returned_to_author
        db.commit()
        return {
            "message": "Paper returned to author for revision",
            "submission_id": str(submission_id),
            "decision": "reject",
        }

    # Approved — trigger Agent 3 with provided reviewers
    provided = [r.dict() for r in body.suggested_reviewers] if body.suggested_reviewers else None
    run_agent_reviewer_suggestion.delay(str(submission_id), provided_reviewers=provided)

    return {
        "message": "Decision recorded. Reviewer suggestion agent triggered.",
        "submission_id": str(submission_id),
        "decision": "approve",
        "reviewers_suggested": len(body.suggested_reviewers),
    }


@router.get("/agent-status/{submission_id}", response_model=SubmissionAgentStatusResponse)
def get_agent_status(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get current agent pipeline status for a submission."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    return SubmissionAgentStatusResponse(
        submission_id=submission.id,
        paper_id_code=submission.paper_id_code,
        status=submission.status.value,
        format_check_report=submission.format_check_report,
        consult_party_email=submission.consult_party_email,
        consult_party_decision=submission.consult_party_decision,
        suggested_reviewers=submission.suggested_reviewers_data,
    )


@router.get("/suggested-reviewers/{submission_id}")
def get_suggested_reviewers(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get auto-suggested reviewers for editor to review and assign."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    return {
        "submission_id": str(submission_id),
        "paper_id_code": submission.paper_id_code,
        "suggestions": submission.suggested_reviewers_data or [],
        "consult_party_decision": submission.consult_party_decision,
    }


@router.post("/assign-reviewers/{submission_id}")
def editor_assign_reviewers(
    submission_id: uuid.UUID,
    body: EditorAssignReviewersRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """
    Editor finalizes reviewer selection.
    Triggers Agent 4 (Link Generator) + Agent 5 (Notification Bot).
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    run_agent_reviewer_assignment.delay(
        str(submission_id),
        [str(rid) for rid in body.reviewer_ids],
    )

    return {
        "message": "Reviewer assignment triggered via agent pipeline",
        "submission_id": str(submission_id),
        "reviewer_count": len(body.reviewer_ids),
        "stages": "4 (Link Generation) + 5 (Notifications)",
    }


# ── Analytics ────────────────────────────────────────────

class AnalyticsStatCard(BaseModel):
    key: str
    label: str
    value: str
    hint: Optional[str] = None


class AnalyticsMonthlyBucket(BaseModel):
    month: str      # "2026-03"
    label: str      # "Mar 2026"
    count: int


class AnalyticsFunnelStage(BaseModel):
    key: str
    label: str
    count: int


class AnalyticsOverview(BaseModel):
    range: str
    generated_at: str
    stat_cards: List[AnalyticsStatCard]
    submissions_over_time: List[AnalyticsMonthlyBucket]
    status_funnel: List[AnalyticsFunnelStage]


_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _add_months(dt: datetime, months: int) -> datetime:
    """Add *months* to *dt* landing on the first of the month."""
    total = (dt.year * 12 + (dt.month - 1)) + months
    return datetime(total // 12, (total % 12) + 1, 1)


# Statuses that count as "actively under review" (post-triage, awaiting a decision).
_UNDER_REVIEW_STATUSES = (
    SubmissionStatus.under_review,
    SubmissionStatus.pending_assignment,
)

# Statuses that count as "a decision has been rendered".
# Note: revision_requested is a decision even though the paper may come back.
_DECIDED_STATUSES = (
    SubmissionStatus.accepted,
    SubmissionStatus.rejected,
    SubmissionStatus.revision_requested,
    SubmissionStatus.returned_to_author,
)

# Terminal statuses used to compute acceptance rate.
_TERMINAL_STATUSES = (SubmissionStatus.accepted, SubmissionStatus.rejected)


@router.get("/analytics/overview", response_model=AnalyticsOverview)
def get_analytics_overview(
    # NOTE: alias="range" keeps the public URL contract stable while the
    # local parameter avoids shadowing the built-in range() used below.
    date_range: str = Query("this_year", alias="range", pattern="^(this_year|all_time)$"),
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """
    Editor analytics: stat cards, submissions-over-time, and status funnel.

    ``range=this_year`` restricts submissions_over_time and the range-scoped
    stat cards to Jan 1 of the current year onward. Snapshot metrics like
    "active reviewers" ignore the range because they're a current-state view.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if date_range == "this_year":
        range_start = datetime(now.year, 1, 1)
    else:
        range_start = None  # all time

    # ── Stat card computations ────────────────────────────
    subs_q = db.query(Submission)
    if range_start is not None:
        subs_q = subs_q.filter(Submission.submitted_at >= range_start)

    total_submissions = subs_q.count()

    under_review = subs_q.filter(Submission.status.in_(_UNDER_REVIEW_STATUSES)).count()

    accepted = subs_q.filter(Submission.status == SubmissionStatus.accepted).count()
    rejected = subs_q.filter(Submission.status == SubmissionStatus.rejected).count()
    total_terminal = accepted + rejected
    acceptance_pct = (accepted / total_terminal * 100.0) if total_terminal else None

    # Avg days to first decision: submitted_at → updated_at on any decided row.
    # updated_at is a reasonable proxy for the decision timestamp because the
    # last DB mutation on a decided row is typically the status change itself.
    decided_deltas = (
        subs_q
        .filter(Submission.status.in_(_DECIDED_STATUSES))
        .with_entities(
            func.avg(
                func.extract("epoch", Submission.updated_at - Submission.submitted_at)
            ).label("avg_seconds")
        )
        .scalar()
    )
    avg_days = (float(decided_deltas) / 86400.0) if decided_deltas else None

    # Reviewers is a snapshot metric — always current, not range-scoped.
    active_reviewers = db.query(Reviewer).filter(Reviewer.is_active.is_(True)).count()

    stat_cards = [
        AnalyticsStatCard(
            key="total_submissions",
            label="Total Submissions",
            value=str(total_submissions),
            hint="This year" if date_range == "this_year" else "All time",
        ),
        AnalyticsStatCard(
            key="under_review",
            label="Under Review",
            value=str(under_review),
            hint="Awaiting decision",
        ),
        AnalyticsStatCard(
            key="acceptance_rate",
            label="Acceptance Rate",
            value=(f"{acceptance_pct:.1f}%" if acceptance_pct is not None else "—"),
            hint=f"{accepted}/{total_terminal} decided" if total_terminal else "No decisions yet",
        ),
        AnalyticsStatCard(
            key="avg_first_decision_days",
            label="Avg. days to first decision",
            value=(f"{avg_days:.1f}" if avg_days is not None else "—"),
            hint="Submitted → decision",
        ),
        AnalyticsStatCard(
            key="published_articles",
            label="Accepted Articles",
            value=str(accepted),
            hint="This year" if date_range == "this_year" else "All time",
        ),
        AnalyticsStatCard(
            key="active_reviewers",
            label="Active Reviewers",
            value=str(active_reviewers),
            hint="Snapshot",
        ),
    ]

    # ── Submissions over time (12-bucket window) ─────────
    current_month_start = datetime(now.year, now.month, 1)
    if date_range == "this_year":
        first_month = datetime(now.year, 1, 1)
        month_count = now.month  # only through current month
    else:
        first_month = _add_months(current_month_start, -11)
        month_count = 12

    # Pre-seed buckets with zeros so the chart never has gaps.
    buckets: dict[str, int] = {}
    labels: dict[str, str] = {}
    cursor = first_month
    for _ in range(month_count):
        key = cursor.strftime("%Y-%m")
        buckets[key] = 0
        labels[key] = f"{_MONTH_LABELS[cursor.month - 1]} {cursor.year}"
        cursor = _add_months(cursor, 1)

    rows = (
        db.query(
            func.to_char(func.date_trunc("month", Submission.submitted_at), "YYYY-MM").label("m"),
            func.count().label("c"),
        )
        .filter(Submission.submitted_at >= first_month)
        .group_by("m")
        .all()
    )
    for r in rows:
        if r.m in buckets:
            buckets[r.m] = int(r.c)

    submissions_over_time = [
        AnalyticsMonthlyBucket(month=k, label=labels[k], count=v)
        for k, v in buckets.items()
    ]

    # ── Status funnel ────────────────────────────────────
    def _count_in(statuses: tuple) -> int:
        return subs_q.filter(Submission.status.in_(statuses)).count()

    status_funnel = [
        AnalyticsFunnelStage(key="submitted", label="Submitted", count=total_submissions),
        AnalyticsFunnelStage(key="under_review", label="Under Review", count=under_review),
        AnalyticsFunnelStage(
            key="revision_requested",
            label="Revision Requested",
            count=_count_in((SubmissionStatus.revision_requested, SubmissionStatus.returned_to_author)),
        ),
        AnalyticsFunnelStage(key="accepted", label="Accepted", count=accepted),
        AnalyticsFunnelStage(key="rejected", label="Rejected", count=rejected),
    ]

    return AnalyticsOverview(
        range=date_range,
        generated_at=now.isoformat(),
        stat_cards=stat_cards,
        submissions_over_time=submissions_over_time,
        status_funnel=status_funnel,
    )


# ── Notification log (JG-304) ───────────────────────────

class NotificationLogEntry(BaseModel):
    id: uuid.UUID
    channel: str
    trigger_event: str
    recipient: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    preview: Optional[str] = None


class NotificationLogResponse(BaseModel):
    total: int
    entries: List[NotificationLogEntry]


@router.get("/notifications", response_model=NotificationLogResponse)
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    channel: Optional[str] = Query(None, pattern="^(email|whatsapp)$"),
    status_filter: Optional[str] = Query(
        None, alias="status", pattern="^(pending|sent|failed)$"
    ),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Return the most recent notification-log entries for the editor dashboard.

    Newest first. Fills the ActivityFeed panel — see JG-304 in the frontend
    dashboard component.
    """
    q = db.query(Notification)
    if channel:
        q = q.filter(Notification.channel == channel)
    if status_filter:
        q = q.filter(Notification.status == status_filter)

    total = q.count()
    rows = (
        q.order_by(Notification.sent_at.desc().nullslast(), Notification.id.desc())
        .limit(limit)
        .all()
    )

    entries = [
        NotificationLogEntry(
            id=row.id,
            channel=row.channel.value if row.channel else "email",
            trigger_event=row.trigger_event,
            recipient=row.recipient_email or row.recipient_whatsapp,
            status=row.status.value if row.status else "pending",
            sent_at=row.sent_at,
            error_message=row.error_message,
            preview=(row.message_body or "")[:180] or None,
        )
        for row in rows
    ]
    return NotificationLogResponse(total=total, entries=entries)


# ── Overdue reviews (editor dashboard chip) ──────────────
#
# Feeds the "Overdue" filter chip in the editor's submissions list. The
# chip shows a live count via `count` and, when active, restricts the
# submissions table client-side to `submission_ids`.

class OverdueReviewsResponse(BaseModel):
    count: int
    submission_ids: List[uuid.UUID]


@router.get("/overdue-reviews", response_model=OverdueReviewsResponse)
def get_overdue_reviews(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Return submissions with at least one pending review past its expiry."""
    ids = submissions_with_overdue_reviews(db)
    return OverdueReviewsResponse(
        count=count_overdue_reviews(db),
        submission_ids=ids,
    )
