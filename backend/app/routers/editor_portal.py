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
from app.services.permissions import ACTION_ASSIGN_REVIEWERS, require_permission

_require_assign_reviewers = require_permission(ACTION_ASSIGN_REVIEWERS)
from app.services.review_service import (
    count_overdue_reviews,
    submissions_with_overdue_reviews,
)
from app.models.submission import Submission, SubmissionStatus
from app.services.state_machine import transition_or_direct
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
    # No hard cap — the editor decides how many reviewers a
    # manuscript warrants. At least one ID is required so the
    # endpoint never fires with an empty selection.
    reviewer_ids: List[uuid.UUID] = Field(..., min_length=1)


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
        transition_or_direct(db, submission, SubmissionStatus.returned_to_author)
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
    # ASSIGN_REVIEWERS is the RBAC gate that authorises actual
    # invitation dispatch (Agent 4 mints review links, Agent 5 emails).
    # A user without this permission gets 403 and no invitations go out.
    user=Depends(_require_assign_reviewers),
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
    body_html: Optional[str] = None
    # Full rendered HTML for the expand-in-modal view. Kept separate from
    # ``preview`` so the log table stays plain-text and the frontend only
    # renders the raw HTML in an intentionally-sandboxed surface.


import re

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _plaintext_preview(html: str, limit: int = 180) -> Optional[str]:
    """Strip HTML tags and collapse whitespace so the notification-log
    table shows a readable snippet instead of raw markup."""
    if not html:
        return None
    text = _HTML_TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit - 60:
        cut = cut[:space]
    return cut.rstrip() + "…"


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
            preview=_plaintext_preview(row.message_body or ""),
            body_html=row.message_body or None,
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


# ── Handling-editor delegation ─────────────────────────

class AssignHandlingEditorRequest(BaseModel):
    editor_id: Optional[int] = Field(
        None,
        description="Editor user id, or null to unassign / clear.",
    )


@router.post("/submissions/{submission_id}/handling-editor")
def assign_handling_editor(
    submission_id: uuid.UUID,
    body: AssignHandlingEditorRequest,
    db: Session = Depends(get_db),
    editor=Depends(require_editor_mfa),
):
    """Claim or delegate a submission to a specific handling editor.

    Pass ``editor_id=<caller.id>`` to self-claim, another id to
    delegate, or ``null`` to clear the assignment. Only users with an
    editor role can be assigned as the handling editor."""
    from app.models.user import User as _User
    from app.services.editor_auth import EDITOR_ROLES
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if body.editor_id is None:
        s.handling_editor_id = None
    else:
        target = db.query(_User).filter(_User.id == body.editor_id).first()
        if target is None or not target.is_active or target.role not in EDITOR_ROLES:
            raise HTTPException(
                status_code=400,
                detail="Target user must be an active editor.",
            )
        s.handling_editor_id = target.id
    db.commit()
    return {"ok": True, "handling_editor_id": s.handling_editor_id}


@router.get("/submissions/{submission_id}/handling-editor")
def get_handling_editor(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    from app.models.user import User as _User
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if not s.handling_editor_id:
        return {"handling_editor_id": None, "handling_editor_name": None, "handling_editor_email": None}
    editor = db.query(_User).filter(_User.id == s.handling_editor_id).first()
    return {
        "handling_editor_id": s.handling_editor_id,
        "handling_editor_name": editor.full_name if editor else None,
        "handling_editor_email": editor.email if editor else None,
    }


# ── Editorial analytics ────────────────────────────────

@router.get("/analytics/editorial-overview")
def editorial_analytics_overview(
    days: int = Query(180, ge=7, le=365),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Editorial throughput dashboard payload.

    Runs entirely off the ``submissions`` + ``editorial_decisions`` +
    ``reviews`` tables. All numbers are honest — no smoothing, no
    joins that would inflate counts."""
    from datetime import datetime, timedelta
    from app.models.editorial_decision import EditorialDecision as _EdDec
    from app.models.review import Review as _Rev, ReviewState as _RS

    cutoff = datetime.utcnow() - timedelta(days=days)
    subs = (
        db.query(Submission)
        .filter(Submission.submitted_at >= cutoff)
        .all()
    )

    by_month: dict = {}
    for s in subs:
        if not s.submitted_at:
            continue
        key = s.submitted_at.strftime("%Y-%m")
        by_month.setdefault(key, {"received": 0, "accepted": 0, "rejected": 0, "revision": 0})
        by_month[key]["received"] += 1
        if s.status == SubmissionStatus.accepted:
            by_month[key]["accepted"] += 1
        elif s.status in (SubmissionStatus.rejected, SubmissionStatus.reject_and_resubmit):
            by_month[key]["rejected"] += 1
        elif s.status == SubmissionStatus.revision_requested:
            by_month[key]["revision"] += 1

    # Decision distribution over the same window.
    decisions = (
        db.query(_EdDec)
        .filter(_EdDec.decided_at >= cutoff)
        .all()
    )
    from collections import Counter
    tally: Counter = Counter(d.decision for d in decisions)

    # Average review turnaround — assigned_at → completed_at for
    # submitted reviews, in whole days.
    submitted_reviews = (
        db.query(_Rev)
        .filter(
            _Rev.state == _RS.submitted,
            _Rev.completed_at.isnot(None),
            _Rev.assigned_at.isnot(None),
        )
        .all()
    )
    durations = [
        (r.completed_at - r.assigned_at).total_seconds() / 86400.0
        for r in submitted_reviews if r.completed_at and r.assigned_at
    ]
    avg_review_days = round(sum(durations) / len(durations), 1) if durations else None

    # Average editor turnaround — round decision made vs. last
    # reviewer report received (across all decided rows in window).
    editor_turnaround: list = []
    for d in decisions:
        matching_reviews = (
            db.query(_Rev)
            .filter(
                _Rev.submission_id == d.submission_id,
                _Rev.state == _RS.submitted,
                _Rev.round_number == d.round_number,
            )
            .all()
        )
        if not matching_reviews:
            continue
        newest = max((r.completed_at for r in matching_reviews if r.completed_at), default=None)
        if newest is None:
            continue
        editor_turnaround.append((d.decided_at - newest).total_seconds() / 86400.0)
    avg_editor_decision_days = round(sum(editor_turnaround) / len(editor_turnaround), 1) if editor_turnaround else None

    return {
        "window_days": days,
        "totals": {
            "received": len(subs),
            "decided": len(decisions),
            "accepted": sum(1 for s in subs if s.status == SubmissionStatus.accepted),
            "rejected": sum(1 for s in subs if s.status in (SubmissionStatus.rejected, SubmissionStatus.reject_and_resubmit)),
            "under_review": sum(1 for s in subs if s.status == SubmissionStatus.under_review),
            "in_revision": sum(1 for s in subs if s.status == SubmissionStatus.revision_requested),
        },
        "by_month": [
            {"month": k, **v}
            for k, v in sorted(by_month.items())
        ],
        "decision_distribution": [
            {"decision": k, "count": v}
            for k, v in tally.most_common()
        ],
        "avg_review_days": avg_review_days,
        "avg_editor_decision_days": avg_editor_decision_days,
    }


# ── Editorial detection agent endpoints ────────────────

@router.get("/submissions/{submission_id}/duplicate-check")
def duplicate_check(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Run the Duplicate Submission Agent over the whole submissions
    table."""
    from app.agents.editorial_agents import run_duplicate_submission_agent
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    others = db.query(Submission).filter(Submission.id != submission_id).all()
    report = run_duplicate_submission_agent(
        submission_id=str(s.id),
        title=s.paper_title or "",
        author_name=s.author_name or "",
        author_email=s.author_email or "",
        other_submissions=[{
            "id": str(o.id),
            "paper_title": o.paper_title,
            "author_name": o.author_name,
            "author_email": o.author_email,
        } for o in others],
    )
    return {
        "submission_id": str(s.id),
        "is_duplicate": report.is_duplicate,
        "hits": [
            {"submission_id": h.submission_id, "paper_title": h.paper_title,
             "author_name": h.author_name, "reason": h.reason}
            for h in report.hits
        ],
    }


class ReviewerBiasRequest(BaseModel):
    reviewer_id: uuid.UUID


@router.post("/submissions/{submission_id}/reviewer-bias-check")
def reviewer_bias_check(
    submission_id: uuid.UUID,
    body: ReviewerBiasRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Run the Reviewer Bias Agent for a candidate reviewer against
    the manuscript's author + affiliations."""
    from app.agents.editorial_agents import run_reviewer_bias_agent
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    r = db.query(Reviewer).filter(Reviewer.id == body.reviewer_id).first()
    if r is None:
        raise HTTPException(status_code=404, detail="Reviewer not found.")
    author_emails = [s.author_email] if s.author_email else []
    author_institutions = [getattr(s, "author_affiliation", None) or ""]
    verdict = run_reviewer_bias_agent(
        reviewer_email=r.email or "",
        reviewer_institution=r.institution or "",
        author_emails=author_emails,
        author_institutions=author_institutions,
    )
    return {
        "reviewer_id": str(r.id),
        "is_conflict": verdict.is_conflict,
        "severity": verdict.severity,
        "reasons": verdict.reasons,
    }


@router.get("/submissions/{submission_id}/panel-balance")
def panel_balance_check(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Run the Panel Balance Agent over the current-round reviewer
    roster."""
    from app.agents.editorial_agents import run_panel_balance_agent
    from app.models.review import Review, ReviewState
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    reviews = list(s.reviews or [])
    cur_round = max((r.round_number or 1 for r in reviews), default=1)
    reviewer_rows: list = []
    for r in reviews:
        if (r.round_number or 1) != cur_round or r.reviewer is None:
            continue
        rv = r.reviewer
        reviewer_rows.append({
            "email": rv.email,
            "institution": rv.institution,
            "country": getattr(rv, "country", None),
        })
    report = run_panel_balance_agent(reviewers=reviewer_rows)
    return {
        "submission_id": str(s.id),
        "round": cur_round,
        "ok": report.ok,
        "warnings": report.warnings,
        "dominant_country": report.dominant_country,
        "dominant_institution": report.dominant_institution,
    }


@router.get("/submissions/{submission_id}/cross-round-consistency")
def cross_round_consistency(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Run the Cross-Round Consistency Agent — flags current-round
    comments whose keywords overlap heavily with a previous-round
    comment."""
    from app.agents.editorial_agents import run_cross_round_consistency_agent
    from app.models.review import Review, ReviewState
    import json as _json
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    reviews = list(s.reviews or [])
    if not reviews:
        return {"ok": True, "repeated_concerns": []}
    cur_round = max((r.round_number or 1 for r in reviews), default=1)
    if cur_round < 2:
        return {"ok": True, "repeated_concerns": [], "message": "Only one round on record."}

    def _extract(round_no: int) -> list:
        out: list = []
        for r in reviews:
            if (r.round_number or 1) != round_no or r.state != ReviewState.submitted:
                continue
            for raw in (r.major_comments, r.minor_comments):
                if not raw:
                    continue
                try:
                    arr = _json.loads(raw)
                    if isinstance(arr, list):
                        for item in arr:
                            if isinstance(item, dict) and item.get("comment"):
                                out.append(str(item["comment"]))
                            elif isinstance(item, str):
                                out.append(item)
                except Exception:  # noqa: BLE001
                    pass
        return out

    prev = _extract(cur_round - 1)
    cur = _extract(cur_round)
    report = run_cross_round_consistency_agent(
        previous_round_comments=prev, current_round_comments=cur,
    )
    return {
        "submission_id": str(s.id),
        "round": cur_round,
        "ok": report.ok,
        "repeated_concerns": report.repeated_concerns,
    }


# ── Round-N automation (spec §19) ──────────────────────
#
# When the editor decides Major or Minor Revision on a manuscript,
# the author submits a revised version and the editorial workflow
# needs to re-open the review with fresh Review rows. Rather than
# re-invite reviewers manually, this endpoint spawns one Review row
# per reviewer who submitted in the current round, incremented to
# ``round + 1`` and set to state=invited. Reviewer selection can be
# widened later by the editor (invite new reviewer, decline old).

class OpenRoundRequest(BaseModel):
    carry_previous: bool = Field(
        True,
        description="Re-invite the reviewers who submitted in the current round.",
    )
    new_reviewer_ids: List[uuid.UUID] = Field(
        default_factory=list,
        description="Additional reviewers to invite on this new round (dedup by id).",
    )


@router.post("/submissions/{submission_id}/open-round")
def open_review_round(
    submission_id: uuid.UUID,
    body: Optional[OpenRoundRequest] = None,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Create round+1 Review rows for every reviewer who submitted the
    current round. Returns the new round number and the new
    review_ids so the editor UI can jump straight to the reviewer
    roster."""
    from datetime import timedelta
    from app.config import settings
    from app.models.review import Review, ReviewState, ReviewStatus
    from app.utils.link_tokens import create_review_link_token
    import uuid as _uuid

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = list(submission.reviews or [])
    if not reviews:
        raise HTTPException(
            status_code=409,
            detail="No prior reviewer rows on this submission — invite reviewers instead of opening a round.",
        )
    current_round = max((r.round_number or 1) for r in reviews)
    next_round = current_round + 1

    # If a next-round row already exists, refuse — the editor should
    # cancel or complete the existing round before spawning another.
    if any((r.round_number or 1) == next_round for r in reviews):
        raise HTTPException(
            status_code=409,
            detail=f"Round {next_round} is already open on this submission.",
        )

    opts = body or OpenRoundRequest()
    seed_reviews = [r for r in reviews if (r.round_number or 1) == current_round]
    submitted_seed = [r for r in seed_reviews if r.state == ReviewState.submitted]

    # Reviewer-id set for the next round — union of carried previous
    # reviewers (opt-in) and any newly-picked ones from the editor's
    # round-N picker. Dedup preserves the assignment order.
    seen_reviewers: set = set()
    next_reviewer_ids: list = []
    if opts.carry_previous:
        for r in submitted_seed:
            if r.reviewer_id and r.reviewer_id not in seen_reviewers:
                seen_reviewers.add(r.reviewer_id)
                next_reviewer_ids.append(r.reviewer_id)
    for rid in opts.new_reviewer_ids or []:
        if rid not in seen_reviewers:
            seen_reviewers.add(rid)
            next_reviewer_ids.append(rid)

    if not next_reviewer_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                "No reviewers to seed the next round with. Either carry the "
                "previous reviewers or provide new_reviewer_ids."
            ),
        )

    ttl_days = getattr(settings, "JWT_EXPIRE_DAYS", None) or 21
    new_reviews: list[Review] = []
    for rid in next_reviewer_ids:
        new_id = _uuid.uuid4()
        row = Review(
            id=new_id,
            submission_id=submission.id,
            reviewer_id=rid,
            link_token=create_review_link_token(new_id),
            link_expires_at=datetime.utcnow() + timedelta(days=ttl_days),
            status=ReviewStatus.pending,
            state=ReviewState.invited,
            round_number=next_round,
            assigned_at=datetime.utcnow(),
        )
        db.add(row)
        new_reviews.append(row)

    transition_or_direct(db, submission, SubmissionStatus.under_review)
    db.commit()
    for r in new_reviews:
        db.refresh(r)

    return {
        "submission_id": str(submission.id),
        "round": next_round,
        "review_ids": [str(r.id) for r in new_reviews],
        "message": f"Round {next_round} opened with {len(new_reviews)} reviewer(s).",
    }


# ── Editor PDF stream (spec §8 — side-by-side viewer) ──
#
# The editor's Full Report page embeds this via <iframe> so PDF ↔
# reviewer report sit next to each other. iframes cannot attach an
# Authorization header, so the editor's session JWT rides in a query
# param — same pattern the reviewer form uses. Ownership is trivial:
# any editor with MFA can read any manuscript's PDF.

@router.get("/reviews/{review_id}/pdf")
def editor_reviewer_pdf(
    review_id: uuid.UUID,
    token: Optional[str] = Query(None, description="Editor session JWT (iframes cannot send Authorization headers)"),
    db: Session = Depends(get_db),
):
    from fastapi.responses import RedirectResponse
    from jose import JWTError, jwt as _jwt
    from app.config import settings as _s
    from app.models.review import Review
    from app.models.manuscript_file import ManuscriptFile
    from app.models.manuscript_version import ManuscriptVersion
    from app.models.user import User
    from app.services.editor_auth import EDITOR_ROLES

    unauth = HTTPException(status_code=401, detail="Not authorised.")
    if not token:
        raise unauth
    try:
        payload = _jwt.decode(token, _s.SECRET_KEY, algorithms=[_s.ALGORITHM])
    except JWTError:
        raise unauth
    if not payload.get("mfa_verified"):
        raise unauth
    email = payload.get("sub")
    if not email:
        raise unauth
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active or user.role not in EDITOR_ROLES:
        raise unauth

    review = db.query(Review).filter(Review.id == review_id).first()
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    version = (
        db.query(ManuscriptVersion)
        .filter(ManuscriptVersion.submission_id == review.submission_id)
        .order_by(
            ManuscriptVersion.is_current.desc(),
            ManuscriptVersion.version_number.desc(),
        )
        .first()
    )
    if version is None:
        raise HTTPException(status_code=404, detail="No manuscript version for this review.")
    pdf = next(
        (
            f for f in version.files or []
            if (f.mime_type or "").lower().find("pdf") >= 0
        ),
        None,
    )
    if pdf is None or not pdf.stored_url:
        raise HTTPException(status_code=404, detail="No PDF attached to this manuscript.")
    return RedirectResponse(pdf.stored_url, status_code=302)


# ── Under Review manuscript list (spec §2) ─────────────

@router.get("/under-review")
def under_review_manuscripts(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Return every submission whose current status is ``under_review``
    with per-submission review progress + consensus recommendation.

    Columns rendered by the EditorDashboard's Under Review tab:
      * submission_id, manuscript_id, paper_title
      * received / total  ("3/3 Reviews Received")
      * round
      * consensus_recommendation (from the Consensus Agent output —
        or the single recommendation when there's only one reviewer)
      * ethics_flag (any reviewer marked one)
    """
    from app.models.review import Review, ReviewState
    from app.routers.reviewer_portal import _manuscript_display_id
    from app.agents.reviewer_agents import run_reviewer_consensus_agent
    from app.routers.reviewer_portal import _report_from_review

    submissions = (
        db.query(Submission)
        .filter(Submission.status == SubmissionStatus.under_review)
        .order_by(Submission.submitted_at.desc())
        .all()
    )

    from app.models.reviewer import Reviewer

    out = []
    for s in submissions:
        reviews = list(s.reviews or [])
        target_round = max((r.round_number or 1 for r in reviews), default=1)
        current_round_reviews = [r for r in reviews if (r.round_number or 1) == target_round]
        total = len(current_round_reviews)
        submitted = [r for r in current_round_reviews if r.state == ReviewState.submitted]
        received = len(submitted)

        # Assigned reviewers on the current round. Nullable reviewer_id is
        # tolerated — SET NULL on delete leaves an "unassigned" placeholder.
        reviewer_ids = {r.reviewer_id for r in current_round_reviews if r.reviewer_id}
        reviewer_lookup = {}
        if reviewer_ids:
            reviewer_lookup = {
                rv.id: rv for rv in db.query(Reviewer).filter(Reviewer.id.in_(reviewer_ids)).all()
            }
        reviewers_out = []
        for r in current_round_reviews:
            rv = reviewer_lookup.get(r.reviewer_id) if r.reviewer_id else None
            reviewers_out.append({
                "review_id": str(r.id),
                "reviewer_id": str(r.reviewer_id) if r.reviewer_id else None,
                "name": rv.name if rv else "Unassigned",
                "email": rv.email if rv else None,
                "state": r.state.value if r.state else None,
                "has_submitted": r.state == ReviewState.submitted,
            })

        # Cheapest possible "consensus": if all in and one clear
        # winner, surface it. Otherwise run the same aggregation the
        # workspace uses so the label matches.
        consensus_rec = None
        consensus_strength = "n/a"
        ethics_flag = False
        if submitted:
            reports = [_report_from_review(r).model_dump() for r in submitted]
            consensus = run_reviewer_consensus_agent(reports)
            consensus_rec = consensus.get("consensus_recommendation")
            consensus_strength = consensus.get("consensus_strength", "n/a")
            ethics_flag = bool(consensus.get("ethics_flag_count", 0))

        # Manuscript display id — derive from the newest review, else
        # fall back to submission-id fingerprint.
        display_id = None
        if reviews:
            display_id = _manuscript_display_id(reviews[0])
        else:
            year = s.submitted_at.year if s.submitted_at else datetime.utcnow().year
            display_id = f"MS-{year}-{str(s.id).replace('-', '')[-4:].upper()}"

        newest_submission_at = None
        if submitted:
            newest_submission_at = max(
                (r.completed_at for r in submitted if r.completed_at),
                default=None,
            )
        out.append({
            "submission_id": str(s.id),
            "manuscript_id": display_id,
            "paper_title": s.paper_title,
            "round": target_round,
            "received": received,
            "total": total,
            "consensus_recommendation": consensus_rec,
            "consensus_strength": consensus_strength,
            "ethics_flag": ethics_flag,
            "newest_review_at": newest_submission_at.isoformat() if newest_submission_at else None,
            "reviewers": reviewers_out,
        })
    # Newest activity on top so the editor sees the just-completed
    # reviewer reports without hunting.
    out.sort(
        key=lambda r: (r["received"] == r["total"], r["newest_review_at"] or ""),
        reverse=True,
    )
    return out


# ── Editor Reviewer Report views (spec §7-14) ──────────
#
# The reviewer submits a structured Reviewer Report; the editor needs
# to (a) read one full report and (b) see every reviewer's report on
# a single submission side-by-side. Both endpoints reuse the same
# report projection the reviewer sees at /reviewer-portal/report so
# there's a single source of truth.

@router.get("/reviews/{review_id}/report")
def editor_reviewer_report(
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Return the full structured Reviewer Report for a review.

    Reviewers stay anonymous — the display name is
    ``Anonymous Reviewer #N`` where N is the reviewer's 1-indexed
    position on the paper's reviewer roster.
    """
    from app.routers.reviewer_portal import _report_from_review
    from app.models.review import Review, ReviewState

    review = db.query(Review).filter(Review.id == review_id).first()
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    if review.state != ReviewState.submitted:
        raise HTTPException(
            status_code=409,
            detail=f"Review is not submitted yet (state={review.state.value if review.state else 'unknown'}).",
        )
    return _report_from_review(review)


@router.get("/submissions/{submission_id}/reviewer-reports")
def editor_reviewer_reports(
    submission_id: uuid.UUID,
    round: Optional[int] = Query(None, description="Filter by review round; defaults to the max round on the submission."),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Multi-reviewer panel (spec §14).

    Returns per-reviewer summary rows for a submission — one card per
    reviewer with recommendation, confidence, submitted timestamp,
    counts, and the review_id the editor clicks through to open the
    full report.
    """
    from app.models.review import Review, ReviewState
    import json as _json

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    target_round = round if round is not None else max(
        (r.round_number or 1 for r in reviews), default=1,
    )

    def _count(raw):
        try:
            v = _json.loads(raw or "")
            return len(v) if isinstance(v, list) else 0
        except Exception:  # noqa: BLE001
            return 0

    rows = []
    for idx, r in enumerate(reviews, start=1):
        if (r.round_number or 1) != target_round:
            continue
        rows.append({
            "review_id": str(r.id),
            "reviewer_display_name": f"Anonymous Reviewer #{idx}",
            "state": r.state.value if r.state else "unknown",
            "recommendation": r.overall_recommendation.value if r.overall_recommendation else None,
            "confidence": r.confidence,
            "submitted_at": r.completed_at.isoformat() if r.completed_at else None,
            "counts": {
                "major": _count(r.major_comments),
                "minor": _count(r.minor_comments),
                "suggestions": _count(r.suggestions_to_authors),
                "annotations": _count(r.page_annotations),
            },
            "ethics_flag": bool(r.ethics_flag),
            "editor_summary": r.editor_summary or "",
        })

    return {
        "submission_id": str(submission.id),
        "round": target_round,
        "reviews": rows,
    }


# ── Reviewer Consensus Agent (spec §15) ────────────────

@router.get("/submissions/{submission_id}/reviewer-consensus")
def editor_reviewer_consensus(
    submission_id: uuid.UUID,
    round: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Cross-reviewer AI summary (spec §15).

    Consolidates every submitted reviewer report on this submission's
    current round into:
      * recommendation tally
      * consensus recommendation (most common)
      * shared / conflicting concerns
      * common positive signals

    Never rewrites reviewer prose — buckets carry the reviewer's own
    first-sentence excerpts and the raw report ids so the editor can
    always click through to the original.
    """
    from app.agents.reviewer_agents import run_reviewer_consensus_agent
    from app.routers.reviewer_portal import _report_from_review
    from app.models.review import Review, ReviewState

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    target_round = round if round is not None else max(
        (r.round_number or 1 for r in reviews), default=1,
    )
    submitted = [
        r for r in reviews
        if r.state == ReviewState.submitted and (r.round_number or 1) == target_round
    ]
    reports = [_report_from_review(r).model_dump() for r in submitted]
    consensus = run_reviewer_consensus_agent(reports)
    return {
        "submission_id": str(submission.id),
        "round": target_round,
        "reviewer_count": len(reports),
        **consensus,
    }


# ── Editorial Decision Letter Drafter (spec §10) ────────

class DecisionLetterRequest(BaseModel):
    editor_decision: str
    editor_note: str = ""


@router.post("/submissions/{submission_id}/decision-letter-draft")
def draft_decision_letter(
    submission_id: uuid.UUID,
    body: DecisionLetterRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Compose a draft decision letter from every submitted reviewer
    report on the current round + the editor's chosen decision +
    optional editor note. Editor reviews and edits before sending
    (spec §10)."""
    from app.agents.reviewer_agents import run_decision_letter_agent
    from app.routers.reviewer_portal import _report_from_review, _manuscript_display_id
    from app.models.review import Review, ReviewState

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    target_round = max((r.round_number or 1 for r in reviews), default=1)
    submitted = [
        r for r in reviews
        if r.state == ReviewState.submitted and (r.round_number or 1) == target_round
    ]
    reports = [_report_from_review(r).model_dump() for r in submitted]
    manuscript_id = _manuscript_display_id(submitted[0]) if submitted else f"MS-{datetime.utcnow().year}-{str(submission.id).replace('-', '')[-4:].upper()}"

    return run_decision_letter_agent(
        editor_decision=body.editor_decision,
        manuscript_id=manuscript_id,
        paper_title=submission.paper_title or "Manuscript",
        reports=reports,
        editor_note=body.editor_note,
    )


# ── Author Revision Checklist (spec §19) ────────────────
#
# When the editor's decision on a paper is Major or Minor Revision,
# the reviewer's Major + Minor comments are the raw material for the
# author's revision. Aggregating them into a single checklist ensures
# the author addresses every reviewer point rather than reading three
# separate reports and inferring what to do.

@router.get("/submissions/{submission_id}/revision-checklist")
def revision_checklist(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Emit an aggregated revision checklist across every submitted
    reviewer report on this submission's current round.

    Response shape::

      {
        "submission_id": "...",
        "round": 1,
        "reviewers": [
          {
            "reviewer_display_name": "Anonymous Reviewer #1",
            "recommendation": "major_revision",
            "items": [
              {"kind": "major", "page": "7", "section": "3.2",
               "line": "", "comment": "Explain dataset splitting"},
              ...
            ]
          },
          ...
        ]
      }
    """
    import json as _json
    from app.models.review import Review, ReviewState

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    ordered = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or 0,
    )
    reviewers_out = []
    round_number = max((r.round_number or 1) for r in ordered) if ordered else 1

    for idx, review in enumerate(ordered, start=1):
        if review.state != ReviewState.submitted:
            continue

        def _load(raw):
            try:
                v = _json.loads(raw or "")
                return v if isinstance(v, list) else []
            except Exception:  # noqa: BLE001
                return []

        items = []
        for kind, raw in (
            ("major", review.major_comments),
            ("minor", review.minor_comments),
        ):
            for row in _load(raw):
                if isinstance(row, str):
                    text = row.strip()
                    if text:
                        items.append({
                            "kind": kind, "page": "", "section": "",
                            "line": "", "comment": text,
                        })
                elif isinstance(row, dict) and str(row.get("comment") or "").strip():
                    items.append({
                        "kind": kind,
                        "page": str(row.get("page") or ""),
                        "section": str(row.get("section") or ""),
                        "line": str(row.get("line") or ""),
                        "comment": str(row.get("comment")).strip(),
                    })

        reviewers_out.append({
            "reviewer_display_name": f"Anonymous Reviewer #{idx}",
            "recommendation": (
                review.overall_recommendation.value if review.overall_recommendation else None
            ),
            "confidence": review.confidence,
            "items": items,
        })

    return {
        "submission_id": str(submission.id),
        "round": round_number,
        "reviewers": reviewers_out,
    }
