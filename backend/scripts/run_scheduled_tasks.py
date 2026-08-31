"""
Time-triggered maintenance for JGAIR.

This is a single, idempotent entry point for all housekeeping that used to live
under Celery beat. It is invoked in three ways:

  1. Directly on the box:  ``python backend/scripts/run_scheduled_tasks.py``
  2. From the admin router  ``POST /scheduled-tasks/run`` (see
     ``app/routers/scheduled_tasks.py``), which calls :func:`main` in-process.
  3. From ``.github/workflows/scheduled-tasks.yml`` hitting that endpoint on
     an hourly cron (or from any external cron service such as cron-job.org).

Every task guards its own database work in a ``try/except`` so one bad row
never stops the whole run. The function returns a dict summary and also
prints it as JSON to stdout so the workflow logs are self-describing.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict

# Allow ``python backend/scripts/run_scheduled_tasks.py`` from the repo root by
# putting ``backend/`` on the path before importing app.* modules.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402

logger = logging.getLogger(__name__)


# ── Task 1: reviewer 48h reminders ────────────────────────


def _task_send_deadline_reminders() -> int:
    """Email pending reviewers whose link expires within the next 48h.

    Uniqueness is encoded into the notification ``trigger_event`` so a
    reviewer is reminded at most once per review, even if this script runs
    hourly. The event key ``reviewer_reminder_48h:{review_id}`` is checked
    against the ``notifications`` table before we send.
    """
    from app.models.notification import (
        Notification,
        NotificationChannel,
        NotificationStatus,
    )
    from app.models.review import Review, ReviewStatus
    from app.services.email_service import send_reviewer_reminder

    sent = 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        cutoff = now + timedelta(hours=48)

        pending = (
            db.query(Review)
            .filter(
                Review.status == ReviewStatus.pending,
                Review.link_expires_at > now,
                Review.link_expires_at <= cutoff,
            )
            .all()
        )

        for review in pending:
            try:
                trigger = f"reviewer_reminder_48h:{review.id}"
                already = (
                    db.query(Notification)
                    .filter(Notification.trigger_event == trigger)
                    .first()
                )
                if already is not None:
                    continue

                reviewer = review.reviewer
                submission = review.submission
                if reviewer is None or submission is None or not reviewer.email:
                    continue

                review_link = f"{settings.FRONTEND_URL}/review/{review.link_token}"
                remaining = review.link_expires_at - now
                days_remaining = max(1, int(remaining.total_seconds() // 86400) + 1)

                ok = send_reviewer_reminder(
                    reviewer_email=reviewer.email,
                    reviewer_name=reviewer.name,
                    paper_title=submission.paper_title,
                    review_link=review_link,
                    days_remaining=days_remaining,
                )
                if ok:
                    sent += 1
                # Record the uniqueness key regardless of send success so we
                # don't hammer a broken address every hour. A later manual
                # retry can delete this row.
                db.add(
                    Notification(
                        recipient_email=reviewer.email,
                        channel=NotificationChannel.email,
                        trigger_event=trigger,
                        message_body=f"reviewer_reminder_48h for review {review.id}",
                        status=NotificationStatus.sent if ok else NotificationStatus.failed,
                        sent_at=datetime.utcnow() if ok else None,
                    )
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "reviewer 48h reminder failed for review %s", getattr(review, "id", "?")
                )
    except Exception:
        logger.exception("send_deadline_reminders task failed")
    finally:
        db.close()

    return sent


# ── Task 2: expire stale review links ─────────────────────


def _task_advance_expired_review_links() -> int:
    """Mark pending reviews whose secure link has passed as ``expired``.

    Also flips ``link_used=True`` so the link can no longer authenticate
    into the reviewer portal, and writes an ``audit_logs`` row per review.
    """
    from app.models.audit_log import AuditLog
    from app.models.review import Review, ReviewStatus

    expired = 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        stale = (
            db.query(Review)
            .filter(
                Review.status == ReviewStatus.pending,
                Review.link_expires_at < now,
            )
            .all()
        )
        for review in stale:
            try:
                review.status = ReviewStatus.expired
                review.link_used = True
                db.add(
                    AuditLog(
                        action="review.link_expired",
                        target_type="review",
                        target_id=str(review.id),
                        meta={
                            "submission_id": str(review.submission_id),
                            "link_expires_at": review.link_expires_at.isoformat()
                            if review.link_expires_at
                            else None,
                        },
                    )
                )
                db.commit()
                expired += 1
            except Exception:
                db.rollback()
                logger.exception(
                    "advance_expired_review_links failed for review %s",
                    getattr(review, "id", "?"),
                )
    except Exception:
        logger.exception("advance_expired_review_links task failed")
    finally:
        db.close()

    return expired


# ── Task 3: production stage nudge ────────────────────────


def _proof_nudge_body(author_name: str, paper_title: str, paper_id_code: str) -> str:
    """Fallback email body when the ``revision_request`` template is missing."""
    return (
        f"Dear {author_name},\n\n"
        f"Your paper \"{paper_title}\" ({paper_id_code}) is awaiting author "
        f"proof approval. This is a friendly nudge from the editorial office — "
        f"please review the proof at your earliest convenience and return your "
        f"corrections or approval so we can proceed to final publication.\n\n"
        f"The editorial office"
    )


def _task_production_stage_nudge() -> int:
    """Email authors whose paper has been stuck in ``author_proof_pending`` >5d.

    Uses the ``revision_request`` template body as a best-available proxy
    (the closest slug shipped in the platform-expansion seed) and falls
    back to a hardcoded letter when that template is not present.
    Uniqueness is encoded into ``trigger_event = proof_nudge:{record_id}``
    so a single production record is nudged at most once by this script.
    """
    from app.models.email_template import EmailTemplate
    from app.models.notification import Notification
    from app.models.production_stage import ProductionRecord
    from app.models.submission import Submission
    from app.services.email_service import _send_and_log  # internal but stable

    nudged = 0
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=5)
        stuck = (
            db.query(ProductionRecord)
            .filter(
                ProductionRecord.stage == "author_proof_pending",
                ProductionRecord.updated_at < cutoff,
            )
            .all()
        )

        template = (
            db.query(EmailTemplate)
            .filter(EmailTemplate.slug == "revision_request")
            .first()
        )

        for record in stuck:
            try:
                trigger = f"proof_nudge:{record.id}"
                already = (
                    db.query(Notification)
                    .filter(Notification.trigger_event == trigger)
                    .first()
                )
                if already is not None:
                    continue

                submission = (
                    db.query(Submission)
                    .filter(Submission.id == record.submission_id)
                    .first()
                )
                if submission is None or not submission.author_email:
                    continue

                author_name = submission.author_name or "Author"
                paper_title = submission.paper_title or ""
                paper_id_code = submission.paper_id_code or str(submission.id)

                if template is not None and template.is_active:
                    subject = (template.subject or "Author proof pending").replace(
                        "{{paper_id_code}}", paper_id_code
                    )
                    body_text = (
                        (template.body or "")
                        .replace("{{author_name}}", author_name)
                        .replace("{{paper_title}}", paper_title)
                        .replace("{{paper_id_code}}", paper_id_code)
                        .replace(
                            "{{editor_comments}}",
                            "Your paper is awaiting author proof approval — please respond.",
                        )
                    )
                else:
                    subject = f"Author proof pending — {paper_id_code}"
                    body_text = _proof_nudge_body(author_name, paper_title, paper_id_code)

                html = "<p>" + body_text.replace("\n\n", "</p><p>").replace("\n", "<br/>") + "</p>"

                ok = _send_and_log(
                    submission.author_email,
                    subject,
                    html,
                    trigger,
                )
                # _send_and_log already persisted a notifications row keyed by
                # ``trigger``. That row is the uniqueness marker, so we don't
                # need to add another one.
                if ok:
                    nudged += 1
            except Exception:
                db.rollback()
                logger.exception(
                    "production_stage_nudge failed for record %s",
                    getattr(record, "id", "?"),
                )
    except Exception:
        logger.exception("production_stage_nudge task failed")
    finally:
        db.close()

    return nudged


# ── Orchestrator ──────────────────────────────────────────


def main() -> Dict[str, Any]:
    """Run every scheduled task once and return a summary dict.

    The summary is also printed to stdout as a single JSON line so the
    GitHub Actions workflow and the admin endpoint can log it verbatim.
    Failures inside an individual task never abort the run — the counts
    for the tasks that did complete are still reported.
    """
    started = time.perf_counter()

    reminders_sent = 0
    links_expired = 0
    proof_nudges = 0

    try:
        reminders_sent = _task_send_deadline_reminders()
    except Exception:
        logger.exception("scheduled task 'send_deadline_reminders' crashed")
    try:
        links_expired = _task_advance_expired_review_links()
    except Exception:
        logger.exception("scheduled task 'advance_expired_review_links' crashed")
    try:
        proof_nudges = _task_production_stage_nudge()
    except Exception:
        logger.exception("scheduled task 'production_stage_nudge' crashed")

    duration_ms = int((time.perf_counter() - started) * 1000)
    summary = {
        "reminders_sent": reminders_sent,
        "links_expired": links_expired,
        "proof_nudges": proof_nudges,
        "duration_ms": duration_ms,
    }
    print(json.dumps(summary))
    return summary


if __name__ == "__main__":
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    main()
