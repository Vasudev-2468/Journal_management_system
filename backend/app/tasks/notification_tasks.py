"""
Notification background tasks.

Originally Celery tasks; now plain functions wrapped by `InlineTask` so they
run on a background thread without needing a broker or worker.  Router code
still calls `task.delay(...)`, unchanged.
"""

import logging
import uuid

from app.database import SessionLocal
from app.tasks.inline_task import InlineTask

logger = logging.getLogger(__name__)


# ── notify_editor_review_complete ────────────────────────

def _notify_editor_review_complete(review_id: str) -> None:
    from app.models.review import Review, ReviewStatus
    from app.services import notification_service

    db = SessionLocal()
    try:
        review = (
            db.query(Review)
            .filter(Review.id == uuid.UUID(review_id))
            .first()
        )
        if review is None:
            logger.error("Review %s not found — aborting.", review_id)
            return

        submission = review.submission
        reviewer = review.reviewer

        all_complete = (
            db.query(Review)
            .filter(
                Review.submission_id == review.submission_id,
                Review.status != ReviewStatus.completed,
            )
            .count()
            == 0
        )

        notification_service.notify_editor_review_complete(
            db,
            review_id=review_id,
            paper_title=submission.paper_title if submission else "N/A",
            reviewer_name=reviewer.name if reviewer else "Unknown",
            all_complete=all_complete,
        )

        logger.info(
            "Editor notified — review %s complete (all_complete=%s)",
            review_id,
            all_complete,
        )

    except Exception:
        db.rollback()
        logger.exception("notify_editor_review_complete failed for %s", review_id)
    finally:
        db.close()


notify_editor_review_complete = InlineTask(_notify_editor_review_complete)


# ── send_decision_to_author ──────────────────────────────

def _send_decision_to_author(
    submission_id: str, decision: str, editor_comments: str
) -> None:
    from app.models.submission import Submission
    from app.services import notification_service

    db = SessionLocal()
    try:
        submission = (
            db.query(Submission)
            .filter(Submission.id == uuid.UUID(submission_id))
            .first()
        )
        if submission is None:
            logger.error("Submission %s not found — aborting.", submission_id)
            return

        notification_service.send_decision_to_author_notification(
            db,
            author_email=submission.author_email,
            author_name=submission.author_name,
            paper_title=submission.paper_title,
            decision=decision,
            editor_comments=editor_comments,
            submission_id=str(submission.id),
        )

        logger.info(
            "Decision '%s' sent to author for submission %s",
            decision,
            submission_id,
        )

    except Exception:
        db.rollback()
        logger.exception("send_decision_to_author failed for %s", submission_id)
    finally:
        db.close()


send_decision_to_author = InlineTask(_send_decision_to_author)
