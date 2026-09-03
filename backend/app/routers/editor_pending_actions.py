"""Editor Pending Actions inbox.

The editor's operational inbox: only items that require a human/editor
action, never informational events. Backed by deterministic queries on
existing tables — the endpoint returns categorised, prioritised action
items with a CTA URL and a display label.

Design principle
    Pending Actions contains ONLY things where someone needs to do
    something. If a signal is informational (reviewer accepted, DOI
    registered, paper published), it does not appear here. See the
    JG-Pending-Actions spec table for the full inclusion/exclusion
    matrix.

Categories
    urgent       — high-priority items that are blocking or overdue
    submissions  — early-pipeline manuscripts awaiting editorial work
    peer_review  — reviewer selection, invitations, overdue reports
    revisions    — resubmissions awaiting assessment or re-review
    acceptance   — post-accept DOI + metadata + eligibility
    production   — proof / typesetting / publication authorization
    exceptions   — withdrawal / correction / ethics / COI

Each item carries its own priority so a single item can be surfaced
under both its category and the top-of-inbox "urgent" bucket.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contact_message import ContactMessage
from app.models.notification import Notification
from app.models.review import Review, ReviewState, ReviewStatus
from app.models.submission import Submission, SubmissionStatus
from app.services.editor_auth import require_editor_mfa


router = APIRouter()


Priority = str          # 'urgent' | 'due_soon' | 'normal'
Category = str          # 'urgent' | 'submissions' | ...


class ActionItem(BaseModel):
    id: str                # dedupe key, e.g. "decision:{submission_id}"
    kind: str              # concrete action type
    category: Category
    priority: Priority
    title: str             # bold headline
    subtitle: str = ""     # supporting one-liner
    cta_label: str
    cta_url: str
    meta: Dict[str, str] = {}   # small key/value details for the card body


class PendingActionsResponse(BaseModel):
    total: int
    priority_counts: Dict[str, int]     # urgent / due_soon / normal
    category_counts: Dict[str, int]
    items: List[ActionItem]


# ── Priority rules ──────────────────────────────────────
# Any item that's overdue or blocks the pipeline is ``urgent``.
# Items with a 7-day horizon that need action soon are ``due_soon``.
# Everything else is ``normal``.

_URGENT_HORIZON = timedelta(days=0)     # already overdue / hard blocker
_DUE_SOON_HORIZON = timedelta(days=7)


def _priority_for_days_left(days_left: Optional[float]) -> Priority:
    if days_left is None:
        return "normal"
    if days_left < 0:
        return "urgent"
    if days_left <= 7:
        return "due_soon"
    return "normal"


def _paper_ref(sub: Submission) -> str:
    """Human-readable manuscript reference for the card title."""
    return getattr(sub, "paper_id_code", None) or str(sub.id)[:8]


# ── The aggregator ──────────────────────────────────────
# Pure function — no auth. Called both by the editor-gated route below
# and by the badge-counts endpoint (which needs the urgent count
# without paying auth twice). Keeping the logic in one place is the
# design invariant: badge and page must never diverge.

def compute_pending_actions(db: Session) -> PendingActionsResponse:
    from app.models.editorial_decision import EditorialDecision

    now = datetime.utcnow()
    items: List[ActionItem] = []

    # ── 1. New submissions awaiting editorial screening ──
    screening_statuses = (
        SubmissionStatus.pending_classification,
        SubmissionStatus.awaiting_format_check,
        SubmissionStatus.awaiting_consult_review,
    )
    for s in (
        db.query(Submission)
        .filter(Submission.status.in_(screening_statuses))
        .order_by(Submission.submitted_at.asc())
        .all()
    ):
        # Anything sitting > 5 days is due-soon; > 10 days urgent.
        age_days = (now - (s.submitted_at or now)).days
        prio: Priority = "urgent" if age_days > 10 else "due_soon" if age_days > 5 else "normal"
        items.append(ActionItem(
            id=f"screening:{s.id}",
            kind="editorial_screening",
            category="submissions",
            priority=prio,
            title=f"New manuscript — editorial screening",
            subtitle=f"{_paper_ref(s)} · {s.paper_title}",
            cta_label="Start editorial screening",
            cta_url=f"/editor/manuscripts/{s.id}",
            meta={"submitted": (s.submitted_at or now).date().isoformat(), "days_open": str(age_days)},
        ))

    # ── 2. Awaiting reviewer selection ──
    for s in (
        db.query(Submission)
        .filter(Submission.status.in_((
            SubmissionStatus.awaiting_reviewer_suggestions,
            SubmissionStatus.pending_assignment,
        )))
        .order_by(Submission.submitted_at.asc())
        .all()
    ):
        age_days = (now - (s.submitted_at or now)).days
        prio: Priority = "urgent" if age_days > 7 else "due_soon"
        items.append(ActionItem(
            id=f"pick_reviewers:{s.id}",
            kind="reviewer_selection",
            category="submissions",
            priority=prio,
            title="Reviewer selection required",
            subtitle=f"{_paper_ref(s)} · {s.paper_title}",
            cta_label="Select reviewers",
            cta_url=f"/editor/bid-room/{s.id}",
            meta={"days_open": str(age_days)},
        ))

    # ── 3. Peer review — overdue reports ──
    overdue_reviews = (
        db.query(Review)
        .filter(
            Review.status == ReviewStatus.pending,
            Review.state != ReviewState.submitted,
            Review.link_expires_at < now,
        )
        .all()
    )
    for r in overdue_reviews:
        if r.submission is None:
            continue
        days_overdue = (now - (r.link_expires_at or now)).days
        items.append(ActionItem(
            id=f"overdue:{r.id}",
            kind="overdue_review",
            category="peer_review",
            priority="urgent",
            title=f"Overdue review — {days_overdue}d",
            subtitle=f"{_paper_ref(r.submission)} · {r.submission.paper_title}",
            cta_label="Send reminder / reassign",
            cta_url=f"/editor/bid-room/{r.submission.id}",
            meta={"days_overdue": str(days_overdue)},
        ))

    # ── 4. Peer review — declined reviewers awaiting replacement ──
    # Declined = link_used=False and state=declined.
    declined_reviews = (
        db.query(Review)
        .filter(Review.state == ReviewState.declined)
        .all()
    )
    # Group by submission so we only emit one "replace reviewer" card per paper.
    per_submission_declined: Dict[str, int] = {}
    for r in declined_reviews:
        if r.submission is None:
            continue
        per_submission_declined[str(r.submission_id)] = per_submission_declined.get(str(r.submission_id), 0) + 1
    for sub_id, cnt in per_submission_declined.items():
        sub = db.query(Submission).filter(Submission.id == sub_id).first()
        if sub is None or sub.status != SubmissionStatus.under_review:
            continue
        items.append(ActionItem(
            id=f"replace_reviewer:{sub_id}",
            kind="reviewer_replacement",
            category="peer_review",
            priority="urgent",
            title=f"Reviewer replacement — {cnt} declined",
            subtitle=f"{_paper_ref(sub)} · {sub.paper_title}",
            cta_label="Find replacement",
            cta_url=f"/editor/bid-room/{sub_id}",
            meta={"declined_count": str(cnt)},
        ))

    # ── 5. All reports in → decision required ──
    # Every current-round review is submitted, no editorial decision yet.
    under_review_subs = (
        db.query(Submission)
        .filter(Submission.status == SubmissionStatus.under_review)
        .all()
    )
    for s in under_review_subs:
        reviews = list(s.reviews or [])
        if not reviews:
            continue
        target_round = max((r.round_number or 1 for r in reviews), default=1)
        current = [r for r in reviews if (r.round_number or 1) == target_round]
        if not current or not all(r.state == ReviewState.submitted for r in current):
            continue
        # Skip if a decision has already been made for the current round.
        last_dec = (
            db.query(EditorialDecision)
            .filter(EditorialDecision.submission_id == s.id)
            .order_by(EditorialDecision.decided_at.desc())
            .first()
        )
        latest_review_at = max((r.completed_at or now for r in current), default=now)
        if last_dec and (last_dec.decided_at or now) > latest_review_at:
            continue
        recs = {(r.overall_recommendation.value if r.overall_recommendation else None) for r in current}
        distinct = len([x for x in recs if x])
        conflicting = distinct >= 3
        items.append(ActionItem(
            id=f"decision:{s.id}",
            kind="decision_required",
            category="peer_review",
            priority="urgent",
            title="Decision required — all reports in" + (" · conflicting" if conflicting else ""),
            subtitle=f"{_paper_ref(s)} · {s.paper_title}",
            cta_label="Make decision",
            cta_url=f"/editor/submissions/{s.id}/decision",
            meta={"reports": f"{len(current)}/{len(current)}", "distinct_recs": str(distinct)},
        ))

    # ── 6. Revisions submitted — assess ──
    # Sourced from the REVISION_SUBMITTED event notifications (system of
    # record) — same logic as /editor-portal/queue so the two views agree.
    revision_events = (
        db.query(Notification)
        .filter(Notification.trigger_event.like("revision_submitted:%"))
        .filter(~Notification.trigger_event.like("%:email"))
        .all()
    )
    seen_rev_sub: set = set()
    for ev in revision_events:
        try:
            import uuid as _uuid
            sub_id = _uuid.UUID(ev.trigger_event.split(":", 1)[1])
        except Exception:  # noqa: BLE001
            continue
        if sub_id in seen_rev_sub:
            continue
        newer = (
            db.query(EditorialDecision)
            .filter(EditorialDecision.submission_id == sub_id)
            .filter(EditorialDecision.decided_at > (ev.sent_at or datetime.min))
            .first()
        )
        if newer is not None:
            continue
        sub = db.query(Submission).filter(Submission.id == sub_id).first()
        if sub is None:
            continue
        seen_rev_sub.add(sub_id)
        days_since = (now - (ev.sent_at or now)).days
        prio: Priority = "urgent" if days_since > 5 else "due_soon"
        items.append(ActionItem(
            id=f"assess_revision:{sub_id}",
            kind="revision_submitted",
            category="revisions",
            priority=prio,
            title="Revision submitted — assess",
            subtitle=f"{_paper_ref(sub)} · {sub.paper_title}",
            cta_label="Assess revision",
            cta_url=f"/editor/submissions/{sub_id}/revision-assessment",
            meta={"days_since": str(days_since)},
        ))

    # ── 7. Accepted — DOI / publication follow-up ──
    accepted_subs = (
        db.query(Submission)
        .filter(Submission.status == SubmissionStatus.accepted)
        .order_by(Submission.updated_at.desc())
        .all()
    )
    for s in accepted_subs:
        items.append(ActionItem(
            id=f"accepted_next:{s.id}",
            kind="acceptance_pipeline",
            category="acceptance",
            priority="due_soon",
            title="Accepted — start publication pipeline",
            subtitle=f"{_paper_ref(s)} · {s.paper_title}",
            cta_label="Proceed to publication",
            cta_url=f"/editor/production",
            meta={},
        ))

    # ── 8. Exceptions — contact-inbox items awaiting reply ──
    unread_contact = (
        db.query(ContactMessage)
        .filter(ContactMessage.is_read.is_(False))
        .order_by(ContactMessage.created_at.desc())
        .limit(20)
        .all()
    )
    for m in unread_contact:
        items.append(ActionItem(
            id=f"contact:{m.id}",
            kind="contact_message",
            category="exceptions",
            priority="normal",
            title="Contact message awaiting reply",
            subtitle=(m.subject or "Unread message")[:120],
            cta_label="Open inbox",
            cta_url="/editor/contact-inbox",
            meta={"from": (m.email or "—")[:80]},
        ))

    # ── Ordering ────────────────────────────────────────
    priority_order = {"urgent": 0, "due_soon": 1, "normal": 2}
    items.sort(key=lambda it: priority_order.get(it.priority, 3))

    # ── Aggregates ──────────────────────────────────────
    priority_counts = {"urgent": 0, "due_soon": 0, "normal": 0}
    category_counts: Dict[str, int] = {}
    for it in items:
        priority_counts[it.priority] = priority_counts.get(it.priority, 0) + 1
        category_counts[it.category] = category_counts.get(it.category, 0) + 1

    return PendingActionsResponse(
        total=len(items),
        priority_counts=priority_counts,
        category_counts=category_counts,
        items=items,
    )


@router.get("/pending-actions", response_model=PendingActionsResponse)
def get_pending_actions(
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Editor-gated wrapper around ``compute_pending_actions``."""
    return compute_pending_actions(db)
