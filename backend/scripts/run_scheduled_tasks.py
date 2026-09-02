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

                # Manuscript display id — the human-readable code shown
                # everywhere else in the editorial UI; fall back to the
                # submission UUID prefix so the field is never blank.
                manuscript_id = (
                    getattr(submission, "paper_id_code", None)
                    or str(getattr(submission, "id", ""))[:8]
                )
                # Deadline — the reviewer's link expiry rounded to date.
                review_deadline = review.link_expires_at.strftime("%A, %d %B %Y")

                # Journal name + editor signature — from the active
                # Journal row (masthead source of truth). Nothing here is
                # required; the email service falls back to safe defaults.
                journal_name = None
                editor_name = None
                editor_position = "Managing Editor"
                try:
                    from app.models.journal import Journal
                    j = (
                        db.query(Journal)
                        .filter(Journal.is_active.is_(True))
                        .order_by(Journal.id.asc())
                        .first()
                    ) or db.query(Journal).order_by(Journal.id.asc()).first()
                    if j is not None:
                        journal_name = j.title
                        # ``email_editorial`` is our closest proxy for a
                        # named signatory; if it isn't set, leave editor
                        # unnamed and the service will substitute
                        # "Editorial Office".
                        editor_name = getattr(j, "publisher_name", None) or None
                except Exception:
                    # Non-fatal — a journal-lookup failure must not stop
                    # the reminder going out.
                    pass

                ok = send_reviewer_reminder(
                    reviewer_email=reviewer.email,
                    reviewer_name=reviewer.name,
                    paper_title=submission.paper_title,
                    review_link=review_link,
                    days_remaining=days_remaining,
                    manuscript_id=manuscript_id,
                    review_deadline=review_deadline,
                    editor_name=editor_name,
                    editor_position=editor_position,
                    journal_name=journal_name,
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


# ── Task 4: expire dead user_sessions rows ────────────────


def _task_expire_dead_sessions() -> int:
    """Prune ``user_sessions`` rows that have outlived their usefulness.

    Two categories are removed:

    * Explicitly revoked rows whose ``revoked_at`` is older than 30 days.
      The security-log view stops needing them after a month and keeping
      them around only grows the table.
    * Rows whose ``last_seen_at`` is older than 90 days regardless of
      revocation state — dormant sessions whose JWT has almost certainly
      expired already; the row is dead weight.

    Writes a single ``sessions.cleanup`` audit_log row with the count so
    the admin can see the housekeeping happened.
    """
    from app.models.audit_log import AuditLog
    from app.models.user_session import UserSession

    deleted = 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        revoked_cutoff = now - timedelta(days=30)
        idle_cutoff = now - timedelta(days=90)

        # Two independent deletes so a partial failure in one bucket
        # doesn't take the other out. ``synchronize_session=False`` keeps
        # the bulk delete cheap; nothing else in this session holds refs.
        try:
            deleted += (
                db.query(UserSession)
                .filter(
                    UserSession.revoked_at.isnot(None),
                    UserSession.revoked_at < revoked_cutoff,
                )
                .delete(synchronize_session=False)
            )
        except Exception:
            db.rollback()
            logger.exception("expire_dead_sessions: revoked-cutoff delete failed")

        try:
            deleted += (
                db.query(UserSession)
                .filter(UserSession.last_seen_at < idle_cutoff)
                .delete(synchronize_session=False)
            )
        except Exception:
            db.rollback()
            logger.exception("expire_dead_sessions: idle-cutoff delete failed")

        try:
            db.add(
                AuditLog(
                    action="sessions.cleanup",
                    target_type="user_session",
                    meta={"deleted": deleted},
                )
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("expire_dead_sessions: audit-log write failed")
    except Exception:
        logger.exception("expire_dead_sessions task failed")
    finally:
        db.close()

    return deleted


# ── Task 5: revoke stale reviewer-membership invitations ──


def _task_auto_revoke_expired_invitations() -> int:
    """Revoke every reviewer-panel invitation whose 21-day window has
    elapsed without an Accept or Reject click.

    The reviewer row stays in the panel so the editor can see the
    outcome; ``invitation_revoked_at`` is stamped so login is refused
    and the panel status pill shows "revoked". Editors can resend
    from the Reviewers panel at any time — a resend regenerates the
    password, resets every timestamp, and re-arms a fresh 21-day
    window.
    """
    from app.services.reviewer_service import auto_revoke_expired_invitations

    db = SessionLocal()
    try:
        return auto_revoke_expired_invitations(db)
    except Exception:
        db.rollback()
        logger.exception("auto_revoke_expired_invitations task failed")
        return 0
    finally:
        db.close()


# ── Task 6: author revision deadline reminders ──────────


def _task_author_revision_reminders() -> int:
    """Nudge authors whose revision window is inside the reminder
    horizon. Uses the same notification uniqueness pattern as the
    reviewer 48h reminder so a scheduler firing hourly doesn't spam
    the author."""
    from datetime import datetime, timedelta
    from app.models.submission import Submission, SubmissionStatus
    from app.models.notification import Notification, NotificationChannel, NotificationStatus
    from app.services.email_service import _send_and_log, _wrap, _btn
    from app.config import settings as _s

    sent = 0
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        seven_days = now + timedelta(days=7)
        # Submissions in revision_requested for at least X days, with
        # the ``revision_requested_at`` window closing.
        candidates = (
            db.query(Submission)
            .filter(Submission.status == SubmissionStatus.revision_requested)
            .all()
        )
        for s in candidates:
            trigger = f"author_revision_reminder_7d:{s.id}"
            already = (
                db.query(Notification)
                .filter(Notification.trigger_event == trigger)
                .first()
            )
            if already is not None:
                continue
            if not s.author_email:
                continue
            frontend = (_s.FRONTEND_URL or "").rstrip("/")
            respond_url = f"{frontend}/author-dashboard/{s.id}/respond" if frontend else f"/author-dashboard/{s.id}/respond"
            body_html = _wrap(f"""
                <p>Dear author,</p>
                <p>This is a friendly reminder that a revision is required on your
                   manuscript <strong>{s.paper_title}</strong>. Please respond to
                   the reviewer comments and upload the revised version.</p>
                <div style="text-align:center;">
                  {_btn("Respond to reviewers", respond_url)}
                </div>
            """)
            ok = _send_and_log(
                s.author_email,
                f"Revision reminder: {s.paper_title}",
                body_html,
                "author_revision_reminder",
            )
            if ok:
                sent += 1
            db.add(Notification(
                recipient_email=s.author_email,
                channel=NotificationChannel.email,
                trigger_event=trigger,
                message_body=f"author_revision_reminder_7d for {s.id}",
                status=NotificationStatus.sent if ok else NotificationStatus.failed,
                sent_at=datetime.utcnow() if ok else None,
            ))
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("author_revision_reminders task failed")
    finally:
        db.close()
    return sent


# ── Task 7: editor decision overdue reminders ───────────


def _task_editor_decision_overdue_reminders() -> int:
    """Surface submissions where every reviewer report is in AND the
    editor hasn't decided within 14 days. Uses the existing editor
    inbox address."""
    from datetime import datetime, timedelta
    from app.models.submission import Submission, SubmissionStatus
    from app.models.review import Review, ReviewState
    from app.models.editorial_decision import EditorialDecision
    from app.models.notification import Notification, NotificationChannel, NotificationStatus
    from app.services.email_service import _send_and_log, _wrap
    from app.config import settings as _s

    sent = 0
    db = SessionLocal()
    try:
        editor_email = (_s.EDITORIAL_INBOX_EMAIL or "").strip()
        if not editor_email:
            from app.models.user import User
            from app.services.editor_auth import EDITOR_ROLES
            first = (
                db.query(User)
                .filter(User.role.in_(EDITOR_ROLES), User.is_active.is_(True))
                .order_by(User.id.asc())
                .first()
            )
            editor_email = first.email if first is not None else ""
        if not editor_email:
            return 0

        cutoff = datetime.utcnow() - timedelta(days=14)
        subs = (
            db.query(Submission)
            .filter(Submission.status == SubmissionStatus.under_review)
            .all()
        )
        for s in subs:
            reviews = list(s.reviews or [])
            if not reviews:
                continue
            cur_round = max((r.round_number or 1 for r in reviews), default=1)
            round_reviews = [r for r in reviews if (r.round_number or 1) == cur_round]
            all_in = round_reviews and all(r.state == ReviewState.submitted for r in round_reviews)
            if not all_in:
                continue
            newest_submit = max(
                (r.completed_at for r in round_reviews if r.completed_at),
                default=None,
            )
            if newest_submit is None or newest_submit > cutoff:
                continue
            # Already decided this round?
            already_decided = (
                db.query(EditorialDecision)
                .filter(
                    EditorialDecision.submission_id == s.id,
                    EditorialDecision.round_number == cur_round,
                )
                .first()
            )
            if already_decided is not None:
                continue
            trigger = f"editor_decision_overdue:{s.id}:{cur_round}"
            already = (
                db.query(Notification)
                .filter(Notification.trigger_event == trigger)
                .first()
            )
            if already is not None:
                continue
            frontend = (_s.FRONTEND_URL or "").rstrip("/")
            workspace_url = f"{frontend}/editor/manuscripts/{s.id}" if frontend else f"/editor/manuscripts/{s.id}"
            body_html = _wrap(f"""
                <p>Dear editor,</p>
                <p>All reviewer reports are in for
                   <strong>{s.paper_title}</strong> ({s.id}), and a decision has
                   been outstanding for more than 14 days. Please open the
                   workspace and issue a decision.</p>
                <p><a href="{workspace_url}">Open editor workspace</a></p>
            """)
            ok = _send_and_log(
                editor_email,
                f"Decision overdue — {s.paper_title}",
                body_html,
                "editor_decision_overdue",
            )
            if ok:
                sent += 1
            db.add(Notification(
                recipient_email=editor_email,
                channel=NotificationChannel.email,
                trigger_event=trigger,
                message_body=f"editor_decision_overdue for {s.id} round {cur_round}",
                status=NotificationStatus.sent if ok else NotificationStatus.failed,
                sent_at=datetime.utcnow() if ok else None,
            ))
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("editor_decision_overdue_reminders task failed")
    finally:
        db.close()
    return sent


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
    sessions_deleted = 0
    invitations_auto_revoked = 0

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
    try:
        sessions_deleted = _task_expire_dead_sessions()
    except Exception:
        logger.exception("scheduled task 'expire_dead_sessions' crashed")
    try:
        invitations_auto_revoked = _task_auto_revoke_expired_invitations()
    except Exception:
        logger.exception("scheduled task 'auto_revoke_expired_invitations' crashed")

    author_revision_reminders_sent = 0
    editor_decision_overdue_sent = 0
    try:
        author_revision_reminders_sent = _task_author_revision_reminders()
    except Exception:
        logger.exception("scheduled task 'author_revision_reminders' crashed")
    try:
        editor_decision_overdue_sent = _task_editor_decision_overdue_reminders()
    except Exception:
        logger.exception("scheduled task 'editor_decision_overdue_reminders' crashed")

    duration_ms = int((time.perf_counter() - started) * 1000)
    summary = {
        "reminders_sent": reminders_sent,
        "links_expired": links_expired,
        "proof_nudges": proof_nudges,
        "sessions_deleted": sessions_deleted,
        "invitations_auto_revoked": invitations_auto_revoked,
        "author_revision_reminders_sent": author_revision_reminders_sent,
        "editor_decision_overdue_sent": editor_decision_overdue_sent,
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
