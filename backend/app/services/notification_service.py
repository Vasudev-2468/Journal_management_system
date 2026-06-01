"""
Notification service — helpers for logging and sending notifications via
email (SendGrid) and WhatsApp (Twilio).

Each function persists a Notification row and delegates delivery to the
email_service / whatsapp_service modules.
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.notification import Notification, NotificationChannel, NotificationStatus
from app.services.email_service import send_email
from app.services.whatsapp_service import send_whatsapp

logger = logging.getLogger(__name__)


# ── Internal helpers ─────────────────────────────────────

def _log_notification(
    db: Session,
    *,
    channel: NotificationChannel,
    recipient_email: Optional[str] = None,
    recipient_whatsapp: Optional[str] = None,
    trigger_event: str,
    message_body: str,
    status: NotificationStatus = NotificationStatus.pending,
    error_message: Optional[str] = None,
) -> Notification:
    n = Notification(
        recipient_email=recipient_email,
        recipient_whatsapp=recipient_whatsapp,
        channel=channel,
        trigger_event=trigger_event,
        message_body=message_body,
        status=status,
        sent_at=datetime.utcnow() if status == NotificationStatus.sent else None,
        error_message=error_message,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


# ── Editor notifications ────────────────────────────────

def notify_editor_new_submission(db: Session, submission_id: str) -> None:
    body = f"New submission {submission_id} has been classified and is ready for reviewer assignment."
    _send_editor(db, trigger_event="new_submission", body=body)


def notify_editor_escalation(
    db: Session, submission_id: str, reason: str = "low_confidence"
) -> None:
    body = (
        f"Submission {submission_id} requires manual review. "
        f"Reason: {reason}."
    )
    _send_editor(db, trigger_event="classification_escalation", body=body)


def notify_editor_review_complete(
    db: Session,
    review_id: str,
    paper_title: str,
    reviewer_name: str,
    all_complete: bool = False,
) -> None:
    body = f"Reviewer {reviewer_name} has completed their review for '{paper_title}'."
    if all_complete:
        body += " All reviews for this submission are now complete."
    _send_editor(db, trigger_event="review_complete", body=body)


def notify_editor_pending_reviews(db: Session, pending_count: int) -> None:
    body = f"Daily reminder: {pending_count} review(s) are still pending and due within 3 days."
    _send_editor(db, trigger_event="deadline_reminder_summary", body=body)


def _send_editor(db: Session, trigger_event: str, body: str) -> None:
    # WhatsApp to editor
    if settings.EDITOR_WHATSAPP_NUMBER:
        try:
            send_whatsapp(settings.EDITOR_WHATSAPP_NUMBER, body)
            _log_notification(
                db,
                channel=NotificationChannel.whatsapp,
                recipient_whatsapp=settings.EDITOR_WHATSAPP_NUMBER,
                trigger_event=trigger_event,
                message_body=body,
                status=NotificationStatus.sent,
            )
        except Exception as exc:
            logger.exception("WhatsApp to editor failed")
            _log_notification(
                db,
                channel=NotificationChannel.whatsapp,
                recipient_whatsapp=settings.EDITOR_WHATSAPP_NUMBER,
                trigger_event=trigger_event,
                message_body=body,
                status=NotificationStatus.failed,
                error_message=str(exc),
            )


# ── Reviewer notifications ──────────────────────────────

def send_reviewer_invitation(
    db: Session,
    *,
    reviewer_email: str,
    reviewer_whatsapp: Optional[str],
    reviewer_name: str,
    paper_title: str,
    review_link: str,
) -> None:
    subject = f"Review Invitation: {paper_title}"
    html = (
        f"<p>Dear {reviewer_name},</p>"
        f"<p>You have been invited to review <strong>{paper_title}</strong>.</p>"
        f"<p>Please use the following secure link to submit your review:</p>"
        f"<p><a href=\"{review_link}\">{review_link}</a></p>"
        f"<p>This link will expire in 14 days.</p>"
        f"<p>Best regards,<br>Editorial Team</p>"
    )

    # Email
    try:
        send_email(reviewer_email, subject, html)
        _log_notification(
            db,
            channel=NotificationChannel.email,
            recipient_email=reviewer_email,
            trigger_event="reviewer_invitation",
            message_body=html,
            status=NotificationStatus.sent,
        )
    except Exception as exc:
        logger.exception("Email invitation to %s failed", reviewer_email)
        _log_notification(
            db,
            channel=NotificationChannel.email,
            recipient_email=reviewer_email,
            trigger_event="reviewer_invitation",
            message_body=html,
            status=NotificationStatus.failed,
            error_message=str(exc),
        )

    # WhatsApp (optional)
    if reviewer_whatsapp:
        wa_body = (
            f"Hi {reviewer_name}, you've been invited to review '{paper_title}'. "
            f"Review link: {review_link}"
        )
        try:
            send_whatsapp(reviewer_whatsapp, wa_body)
            _log_notification(
                db,
                channel=NotificationChannel.whatsapp,
                recipient_whatsapp=reviewer_whatsapp,
                trigger_event="reviewer_invitation",
                message_body=wa_body,
                status=NotificationStatus.sent,
            )
        except Exception as exc:
            logger.exception("WhatsApp invitation to %s failed", reviewer_whatsapp)
            _log_notification(
                db,
                channel=NotificationChannel.whatsapp,
                recipient_whatsapp=reviewer_whatsapp,
                trigger_event="reviewer_invitation",
                message_body=wa_body,
                status=NotificationStatus.failed,
                error_message=str(exc),
            )


def send_reviewer_deadline_reminder(
    db: Session,
    *,
    reviewer_whatsapp: str,
    reviewer_name: str,
    paper_title: str,
    review_link: str,
) -> None:
    body = (
        f"Reminder: Hi {reviewer_name}, your review for '{paper_title}' "
        f"is due in 3 days. Link: {review_link}"
    )
    try:
        send_whatsapp(reviewer_whatsapp, body)
        _log_notification(
            db,
            channel=NotificationChannel.whatsapp,
            recipient_whatsapp=reviewer_whatsapp,
            trigger_event="deadline_reminder",
            message_body=body,
            status=NotificationStatus.sent,
        )
    except Exception as exc:
        logger.exception("Deadline reminder to %s failed", reviewer_whatsapp)
        _log_notification(
            db,
            channel=NotificationChannel.whatsapp,
            recipient_whatsapp=reviewer_whatsapp,
            trigger_event="deadline_reminder",
            message_body=body,
            status=NotificationStatus.failed,
            error_message=str(exc),
        )


# ── Author notifications ────────────────────────────────

def send_decision_to_author_notification(
    db: Session,
    *,
    author_email: str,
    author_name: str,
    paper_title: str,
    decision: str,
    editor_comments: str,
) -> None:
    subject = f"Decision on your submission: {paper_title}"
    html = (
        f"<p>Dear {author_name},</p>"
        f"<p>A decision has been made on your submission "
        f"<strong>{paper_title}</strong>:</p>"
        f"<p><strong>Decision: {decision.replace('_', ' ').title()}</strong></p>"
        f"<p>Editor's comments:<br>{editor_comments or 'No additional comments.'}</p>"
        f"<p>Best regards,<br>Editorial Team</p>"
    )
    try:
        send_email(author_email, subject, html)
        _log_notification(
            db,
            channel=NotificationChannel.email,
            recipient_email=author_email,
            trigger_event="decision_notification",
            message_body=html,
            status=NotificationStatus.sent,
        )
    except Exception as exc:
        logger.exception("Decision email to %s failed", author_email)
        _log_notification(
            db,
            channel=NotificationChannel.email,
            recipient_email=author_email,
            trigger_event="decision_notification",
            message_body=html,
            status=NotificationStatus.failed,
            error_message=str(exc),
        )
