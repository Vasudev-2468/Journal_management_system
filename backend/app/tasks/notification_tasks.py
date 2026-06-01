"""
Notification-related Celery tasks.

These are triggered from the reviews router after a reviewer submits
a review or the editor makes a decision.
"""

import logging
import uuid

from app.tasks.celery_app import celery_app
from app.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(
    name="notify_editor_review_complete",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def notify_editor_review_complete(self, review_id: str):
    """
    Notify the editor that a reviewer has completed their review.
    If all reviews for the submission are done, flag that too.
    """
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

    except Exception as exc:
        db.rollback()
        logger.exception("notify_editor_review_complete failed for %s", review_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(
    name="send_decision_to_author",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_decision_to_author(
    self, submission_id: str, decision: str, editor_comments: str
):
    """
    Email the author with the editor's decision and comments.
    """
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
        )

        logger.info(
            "Decision '%s' sent to author for submission %s",
            decision,
            submission_id,
        )

    except Exception as exc:
        db.rollback()
        logger.exception("send_decision_to_author failed for %s", submission_id)
        raise self.retry(exc=exc)
    finally:
        db.close()
