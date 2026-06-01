"""
Paper-lifecycle Celery tasks.

All tasks that relate to submissions, reviewer embeddings, invitations,
and deadline reminders live here.
"""

import logging
import uuid
from datetime import datetime, timedelta

from app.tasks.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings

logger = logging.getLogger(__name__)


def _get_db():
    """Create a short-lived session for use inside a Celery worker."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Task 1: process_new_submission ───────────────────────

@celery_app.task(
    name="process_new_submission",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_new_submission(self, submission_id: str):
    """
    Full intake pipeline triggered right after a paper is uploaded.

    1. Extract abstract / title from the PDF
    2. Classify paper via AI
    3. Persist classification on the Submission row
    4. Notify editor (or escalate if low-confidence)
    5. Redact author information → save redacted PDF to S3
    6. Compute + store paper embedding
    """
    from app.models.submission import Submission, SubmissionStatus
    from app.services.pdf_processor import (
        extract_abstract_and_intro,
        redact_author_information,
    )
    from app.services.ai_agent import classify_paper, compute_text_embedding
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

        # Step 1 — extract abstract & title from uploaded PDF
        extracted = extract_abstract_and_intro(submission.pdf_url)
        abstract = extracted.get("abstract") or submission.abstract
        title = extracted.get("title") or submission.paper_title

        # Update abstract if we got a better one from the PDF
        if extracted.get("abstract"):
            submission.abstract = abstract

        # Step 2 — classify
        classification = classify_paper(abstract, title)
        classified_field = classification["classified_field"]
        confidence = classification["confidence"]

        # Step 3 — persist classification
        submission.classified_field = classified_field
        submission.classification_confidence = confidence
        submission.status = SubmissionStatus.pending_assignment
        db.commit()

        # Step 4 — notify editor
        if classified_field == "NEEDS_MANUAL_REVIEW":
            notification_service.notify_editor_escalation(
                db, submission_id, reason="low_confidence"
            )
        else:
            notification_service.notify_editor_new_submission(db, submission_id)

        # Step 5 — redact author info
        redacted_key = redact_author_information(submission.pdf_url, submission_id)
        submission.redacted_pdf_url = redacted_key
        db.commit()

        # Step 6 — compute & store paper embedding
        embedding_text = f"{classified_field} {abstract}"
        embedding = compute_text_embedding(embedding_text)
        # Store on keywords JSON column (or a dedicated column if added later)
        # For now we log it; the embedding is used at query time via ai_agent.match_reviewers
        logger.info(
            "Submission %s processed — field=%s confidence=%.2f",
            submission_id,
            classified_field,
            confidence,
        )

        # Step 7 — Trigger Agent Pipeline (Stages 1+2: Acknowledge + Format Check)
        run_agent_intake_pipeline.delay(submission_id)

    except Exception as exc:
        db.rollback()
        logger.exception("process_new_submission failed for %s", submission_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 2: compute_reviewer_embedding ───────────────────

@celery_app.task(
    name="compute_reviewer_embedding",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def compute_reviewer_embedding(self, reviewer_id: str):
    """
    Build a semantic embedding from a reviewer's expertise tags and
    institution, then persist it on the reviewer row.
    """
    from app.models.reviewer import Reviewer
    from app.services.ai_agent import compute_text_embedding

    db = SessionLocal()
    try:
        reviewer = (
            db.query(Reviewer)
            .filter(Reviewer.id == uuid.UUID(reviewer_id))
            .first()
        )
        if reviewer is None:
            logger.error("Reviewer %s not found — aborting.", reviewer_id)
            return

        tags_text = " ".join(reviewer.expertise_tags or [])
        if reviewer.institution:
            tags_text = f"{tags_text} {reviewer.institution}"

        embedding = compute_text_embedding(tags_text)
        reviewer.embedding_vector = embedding
        db.commit()

        logger.info(
            "Embedding computed for reviewer %s (%d dims)",
            reviewer_id,
            len(embedding),
        )

    except Exception as exc:
        db.rollback()
        logger.exception("compute_reviewer_embedding failed for %s", reviewer_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 3: send_reviewer_invitations ────────────────────

@celery_app.task(
    name="send_reviewer_invitations",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_reviewer_invitations(self, review_ids: list[str]):
    """
    For each Review record, send an invitation email + WhatsApp to the
    assigned reviewer with their unique review link.
    """
    from app.models.review import Review
    from app.services import notification_service

    db = SessionLocal()
    try:
        for rid in review_ids:
            review = (
                db.query(Review)
                .filter(Review.id == uuid.UUID(rid))
                .first()
            )
            if review is None:
                logger.warning("Review %s not found — skipping.", rid)
                continue

            reviewer = review.reviewer
            submission = review.submission
            if reviewer is None or submission is None:
                logger.warning("Review %s missing reviewer/submission — skipping.", rid)
                continue

            review_link = (
                f"{settings.FRONTEND_URL}/review/{review.link_token}"
            )

            notification_service.send_reviewer_invitation(
                db,
                reviewer_email=reviewer.email,
                reviewer_whatsapp=reviewer.whatsapp_number,
                reviewer_name=reviewer.name,
                paper_title=submission.paper_title,
                review_link=review_link,
            )

        logger.info("Invitations sent for %d review(s).", len(review_ids))

    except Exception as exc:
        db.rollback()
        logger.exception("send_reviewer_invitations failed")
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 4: send_deadline_reminders (scheduled daily) ────

@celery_app.task(
    name="send_deadline_reminders",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_deadline_reminders(self):
    """
    Runs daily at 09:00 UTC (configured in celery_app.py beat_schedule).

    Finds all pending reviews expiring within 3 days and sends a WhatsApp
    reminder to each reviewer.  Also notifies the editor with the total
    pending count.
    """
    from app.models.review import Review, ReviewStatus
    from app.services import notification_service

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        three_days = now + timedelta(days=3)

        pending_reviews = (
            db.query(Review)
            .filter(
                Review.status == ReviewStatus.pending,
                Review.link_expires_at <= three_days,
                Review.link_expires_at > now,
            )
            .all()
        )

        reminded = 0
        for review in pending_reviews:
            reviewer = review.reviewer
            submission = review.submission
            if reviewer is None or submission is None:
                continue
            if not reviewer.whatsapp_number:
                continue

            review_link = (
                f"{settings.FRONTEND_URL}/review/{review.link_token}"
            )

            notification_service.send_reviewer_deadline_reminder(
                db,
                reviewer_whatsapp=reviewer.whatsapp_number,
                reviewer_name=reviewer.name,
                paper_title=submission.paper_title,
                review_link=review_link,
            )
            reminded += 1

        # Notify editor with summary
        total_pending = (
            db.query(Review)
            .filter(Review.status == ReviewStatus.pending)
            .count()
        )
        notification_service.notify_editor_pending_reviews(db, total_pending)

        logger.info(
            "Deadline reminders: %d sent, %d total pending reviews.",
            reminded,
            total_pending,
        )

    except Exception as exc:
        db.rollback()
        logger.exception("send_deadline_reminders failed")
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 5: run_agent_intake_pipeline ────────────────────

@celery_app.task(
    name="run_agent_intake_pipeline",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def run_agent_intake_pipeline(self, submission_id: str, consult_party_email: str = None):
    """
    Agent pipeline Stages 1+2: Acknowledgement + Format Validation.
    Called after process_new_submission completes classification.
    """
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        result = orchestrator.run_intake_pipeline(
            uuid.UUID(submission_id),
            consult_party_email=consult_party_email,
        )
        logger.info("Agent intake pipeline completed for %s", submission_id)
        return result
    except Exception as exc:
        db.rollback()
        logger.exception("run_agent_intake_pipeline failed for %s", submission_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 6: run_agent_reviewer_suggestion ────────────────

@celery_app.task(
    name="run_agent_reviewer_suggestion",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def run_agent_reviewer_suggestion(self, submission_id: str, provided_reviewers: list = None):
    """
    Agent pipeline Stage 3: Reviewer suggestion.
    Called when consult party submits their review.
    """
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        result = orchestrator.run_reviewer_suggestion(
            uuid.UUID(submission_id),
            provided_reviewers=provided_reviewers,
        )
        logger.info("Agent reviewer suggestion completed for %s", submission_id)
        return result
    except Exception as exc:
        db.rollback()
        logger.exception("run_agent_reviewer_suggestion failed for %s", submission_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Task 7: run_agent_reviewer_assignment ────────────────

@celery_app.task(
    name="run_agent_reviewer_assignment",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def run_agent_reviewer_assignment(self, submission_id: str, reviewer_ids: list):
    """
    Agent pipeline Stages 4+5: Link generation + Notifications.
    Called when editor finalizes reviewer selection.
    """
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        result = orchestrator.run_reviewer_assignment(
            uuid.UUID(submission_id),
            [uuid.UUID(rid) for rid in reviewer_ids],
        )
        logger.info("Agent reviewer assignment completed for %s", submission_id)
        return result
    except Exception as exc:
        db.rollback()
        logger.exception("run_agent_reviewer_assignment failed for %s", submission_id)
        raise self.retry(exc=exc)
    finally:
        db.close()
