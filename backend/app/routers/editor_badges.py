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

    return EditorBadgeCounts(
        contact_inbox_unread=contact_inbox_unread,
        overdue_reviews=overdue_reviews,
        notifications_unread=notifications_unread,
        production_queue=production_queue,
        pending_actions=pending_actions,
    )
