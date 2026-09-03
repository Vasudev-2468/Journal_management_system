"""
Editor sidebar badge counts.

Small aggregate endpoint powering the red-dot badges next to each entry in
the editor dashboard sidebar. Kept in one round-trip so the dashboard can
poll it every 60s without a burst of parallel requests. Read-only; the
individual detail pages remain the source of truth for the underlying
records — this endpoint only counts.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contact_message import ContactMessage
from app.models.notification import Notification, NotificationStatus
from app.models.production_stage import ProductionRecord
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission, SubmissionStatus
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


# Submission statuses that count as "pending action" for the editor —
# mirrors the client-side filter in EditorDashboard.jsx (pending panel).
PENDING_ACTION_STATUSES = (
    SubmissionStatus.pending_classification,
    SubmissionStatus.awaiting_format_check,
    SubmissionStatus.awaiting_consult_review,
    SubmissionStatus.awaiting_reviewer_suggestions,
    SubmissionStatus.pending_assignment,
)


class EditorBadgeCounts(BaseModel):
    contact_inbox_unread: int
    overdue_reviews: int
    notifications_unread: int
    production_queue: int
    pending_actions: int
    revisions_submitted: int = 0
    pending_actions_urgent: int = 0


@router.get("/counts", response_model=EditorBadgeCounts)
def get_editor_badge_counts(
    db: Session = Depends(get_db),
    _user=Depends(require_editor_mfa),
) -> EditorBadgeCounts:
    """Return the five sidebar badge counts the editor dashboard polls."""
    now = datetime.utcnow()

    contact_inbox_unread = (
        db.query(ContactMessage)
        .filter(ContactMessage.is_read.is_(False))
        .count()
    )

    overdue_reviews = (
        db.query(Review)
        .filter(
            Review.status == ReviewStatus.pending,
            Review.link_expires_at < now,
        )
        .count()
    )

    # "Unread" is a proxy — anything not yet sent is either pending in the
    # queue or failed and awaiting operator attention.
    notifications_unread = (
        db.query(Notification)
        .filter(
            Notification.status.in_(
                (NotificationStatus.pending, NotificationStatus.failed)
            )
        )
        .count()
    )

    production_queue = (
        db.query(ProductionRecord)
        .filter(ProductionRecord.stage != "published")
        .count()
    )

    pending_actions = (
        db.query(Submission)
        .filter(Submission.status.in_(PENDING_ACTION_STATUSES))
        .count()
    )

    # Count revision-submitted events that have NOT been resolved by
    # a subsequent editorial decision. Same logic as /editor-portal/queue
    # so the badge and the queue always agree.
    from app.models.editorial_decision import EditorialDecision
    revision_event_rows = (
        db.query(Notification)
        .filter(Notification.trigger_event.like("revision_submitted:%"))
        .filter(~Notification.trigger_event.like("%:email"))
        .all()
    )
    revisions_submitted = 0
    seen: set = set()
    for ev in revision_event_rows:
        try:
            sub_id_str = ev.trigger_event.split(":", 1)[1]
            import uuid as _uuid
            sub_id = _uuid.UUID(sub_id_str)
        except (ValueError, IndexError):
            continue
        if sub_id in seen:
            continue
        seen.add(sub_id)
        newer_dec = (
            db.query(EditorialDecision)
            .filter(EditorialDecision.submission_id == sub_id)
            .filter(EditorialDecision.decided_at > (ev.sent_at or datetime.min))
            .first()
        )
        if newer_dec is None:
            revisions_submitted += 1

    # Urgent-count for the Pending Actions sidebar badge — we call the
    # same aggregator the page uses so the two views can never diverge.
    urgent_pending = 0
    try:
        from app.routers.editor_pending_actions import compute_pending_actions
        result = compute_pending_actions(db)
        urgent_pending = int(result.priority_counts.get("urgent", 0))
    except Exception:  # noqa: BLE001
        urgent_pending = 0

    return EditorBadgeCounts(
        contact_inbox_unread=contact_inbox_unread,
        overdue_reviews=overdue_reviews,
        notifications_unread=notifications_unread,
        production_queue=production_queue,
        pending_actions=pending_actions,
        revisions_submitted=revisions_submitted,
        pending_actions_urgent=urgent_pending,
    )
