"""
Paper-lifecycle background tasks.

Originally Celery tasks; now plain functions wrapped by `InlineTask` so they
run on a background thread without needing a broker or worker.  Router code
still calls `task.delay(...)`, unchanged.
"""

import logging
import uuid
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.config import settings
from app.tasks.inline_task import InlineTask

logger = logging.getLogger(__name__)


# ── Task 1: process_new_submission ───────────────────────

def _process_new_submission(submission_id: str) -> None:
    """
    Full intake pipeline triggered right after a paper is uploaded.

    1. Extract abstract / title from the PDF
    2. Classify paper via AI
    3. Persist classification on the Submission row
    4. Notify editor (or escalate if low-confidence)
    5. Redact author information → save redacted PDF to S3
    6. Compute + store paper embedding
    7. Trigger the agent intake pipeline
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

        extracted = extract_abstract_and_intro(submission.pdf_url)
        abstract = extracted.get("abstract") or submission.abstract
        title = extracted.get("title") or submission.paper_title

        if extracted.get("abstract"):
            submission.abstract = abstract

        classification = classify_paper(abstract, title)
        classified_field = classification["classified_field"]
        confidence = classification["confidence"]

        submission.classified_field = classified_field
        submission.classification_confidence = confidence
        submission.status = SubmissionStatus.pending_assignment
        db.commit()

        if classified_field == "NEEDS_MANUAL_REVIEW":
            notification_service.notify_editor_escalation(
                db, submission_id, reason="low_confidence"
            )
        else:
            notification_service.notify_editor_new_submission(db, submission_id)

        redacted_key = redact_author_information(submission.pdf_url, submission_id)
        submission.redacted_pdf_url = redacted_key
        db.commit()

        embedding_text = f"{classified_field} {abstract}"
        embedding = compute_text_embedding(embedding_text)
        logger.info(
            "Submission %s processed — field=%s confidence=%.2f embedding_dims=%s",
            submission_id,
            classified_field,
            confidence,
            len(embedding) if embedding else "n/a",
        )

        run_agent_intake_pipeline.delay(submission_id)

    except Exception:
        db.rollback()
        logger.exception("process_new_submission failed for %s", submission_id)
    finally:
        db.close()


process_new_submission = InlineTask(_process_new_submission)


# ── Task 2: compute_reviewer_embedding ───────────────────

def _compute_reviewer_embedding(reviewer_id: str) -> None:
    """
    Build a semantic embedding from a reviewer's expertise tags and
    institution, then persist it on the reviewer row.  When no embedding
    provider is configured `compute_text_embedding` returns None and this
    task becomes a no-op (match_reviewers falls back to Jaccard overlap).
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
        if embedding is None:
            logger.info(
                "No embedding provider — skipping embedding for reviewer %s",
                reviewer_id,
            )
            return

        reviewer.embedding_vector = embedding
        db.commit()

        logger.info(
            "Embedding computed for reviewer %s (%d dims)",
            reviewer_id,
            len(embedding),
        )

    except Exception:
        db.rollback()
        logger.exception("compute_reviewer_embedding failed for %s", reviewer_id)
    finally:
        db.close()


compute_reviewer_embedding = InlineTask(_compute_reviewer_embedding)


# ── Task 3: send_reviewer_invitations ────────────────────

def _send_reviewer_invitations(review_ids: list[str]) -> None:
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

            review_link = f"{settings.FRONTEND_URL}/review/{review.link_token}"

            notification_service.send_reviewer_invitation(
                db,
                reviewer_email=reviewer.email,
                reviewer_whatsapp=reviewer.whatsapp_number,
                reviewer_name=reviewer.name,
                paper_title=submission.paper_title,
                review_link=review_link,
            )

        logger.info("Invitations sent for %d review(s).", len(review_ids))

    except Exception:
        db.rollback()
        logger.exception("send_reviewer_invitations failed")
    finally:
        db.close()


send_reviewer_invitations = InlineTask(_send_reviewer_invitations)


# ── Task 4: send_deadline_reminders ──────────────────────

def _send_deadline_reminders() -> None:
    """
    Notify reviewers whose pending reviews expire within 3 days.

    Originally scheduled by Celery beat.  On the free tier this runs when
    triggered externally (e.g. cron-job.org POST to an admin endpoint)
    or manually via a management command.
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

            review_link = f"{settings.FRONTEND_URL}/review/{review.link_token}"

            notification_service.send_reviewer_deadline_reminder(
                db,
                reviewer_whatsapp=reviewer.whatsapp_number,
                reviewer_name=reviewer.name,
                paper_title=submission.paper_title,
                review_link=review_link,
            )
            reminded += 1

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

    except Exception:
        db.rollback()
        logger.exception("send_deadline_reminders failed")
    finally:
        db.close()


send_deadline_reminders = InlineTask(_send_deadline_reminders)


# ── Task 5: run_agent_intake_pipeline ────────────────────

def _run_agent_intake_pipeline(
    submission_id: str, consult_party_email: str | None = None
) -> None:
    """
    Agent pipeline Stages 1+2: Acknowledgement + Format Validation.
    Called after process_new_submission completes classification.
    """
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        orchestrator.run_intake_pipeline(
            uuid.UUID(submission_id),
            consult_party_email=consult_party_email,
        )
        logger.info("Agent intake pipeline completed for %s", submission_id)
    except Exception:
        db.rollback()
        logger.exception("run_agent_intake_pipeline failed for %s", submission_id)
    finally:
        db.close()


run_agent_intake_pipeline = InlineTask(_run_agent_intake_pipeline)


# ── Task 6: run_agent_reviewer_suggestion ────────────────

def _run_agent_reviewer_suggestion(
    submission_id: str, provided_reviewers: list | None = None
) -> None:
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        orchestrator.run_reviewer_suggestion(
            uuid.UUID(submission_id),
            provided_reviewers=provided_reviewers,
        )
        logger.info("Agent reviewer suggestion completed for %s", submission_id)
    except Exception:
        db.rollback()
        logger.exception("run_agent_reviewer_suggestion failed for %s", submission_id)
    finally:
        db.close()


run_agent_reviewer_suggestion = InlineTask(_run_agent_reviewer_suggestion)


# ── Task 7: run_agent_reviewer_assignment ────────────────

def _run_agent_reviewer_assignment(
    submission_id: str, reviewer_ids: list
) -> None:
    from app.agents.orchestrator import AgentOrchestrator

    db = SessionLocal()
    try:
        orchestrator = AgentOrchestrator(db)
        orchestrator.run_reviewer_assignment(
            uuid.UUID(submission_id),
            [uuid.UUID(rid) for rid in reviewer_ids],
        )
        logger.info("Agent reviewer assignment completed for %s", submission_id)
    except Exception:
        db.rollback()
        logger.exception("run_agent_reviewer_assignment failed for %s", submission_id)
    finally:
        db.close()


run_agent_reviewer_assignment = InlineTask(_run_agent_reviewer_assignment)
