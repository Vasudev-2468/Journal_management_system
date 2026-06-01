"""
WhatsApp notification service via Twilio.

Every function builds a plain-text message, sends it through the Twilio
WhatsApp API, logs the attempt to the notifications table, and returns
True/False for success.
"""

import logging
from datetime import datetime
from typing import Optional

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from app.config import settings
from app.database import SessionLocal
from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationStatus,
)

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────

def _ensure_whatsapp_prefix(number: str) -> str:
    """Ensure the number starts with ``whatsapp:``."""
    if not number.startswith("whatsapp:"):
        return f"whatsapp:{number}"
    return number


def _send_and_log(
    to_number: str,
    body: str,
    trigger_event: str,
) -> bool:
    """Send via Twilio and persist a Notification row. Returns success."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not set — skipping WhatsApp to %s", to_number)
        return False

    to_number = _ensure_whatsapp_prefix(to_number)

    db = SessionLocal()
    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=body,
            from_=settings.TWILIO_WHATSAPP_FROM,
            to=to_number,
        )

        db.add(
            Notification(
                recipient_whatsapp=to_number,
                channel=NotificationChannel.whatsapp,
                trigger_event=trigger_event,
                message_body=body,
                status=NotificationStatus.sent,
                sent_at=datetime.utcnow(),
            )
        )
        db.commit()

        logger.info("WhatsApp to %s — SID %s (%s)", to_number, message.sid, trigger_event)
        return True

    except TwilioRestException as exc:
        logger.error("Twilio error sending to %s: %s", to_number, exc)
        db.add(
            Notification(
                recipient_whatsapp=to_number,
                channel=NotificationChannel.whatsapp,
                trigger_event=trigger_event,
                message_body=body,
                status=NotificationStatus.failed,
                error_message=str(exc)[:500],
            )
        )
        db.commit()
        return False

    except Exception as exc:
        logger.exception("WhatsApp to %s failed", to_number)
        db.add(
            Notification(
                recipient_whatsapp=to_number,
                channel=NotificationChannel.whatsapp,
                trigger_event=trigger_event,
                message_body=body,
                status=NotificationStatus.failed,
                error_message=str(exc)[:500],
            )
        )
        db.commit()
        return False

    finally:
        db.close()


# ── Backward-compat wrapper used by notification_service ─

def send_whatsapp(to_number: str, body: str) -> None:
    """Simple fire-and-forget send. Raises on failure."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not set — skipping WhatsApp to %s", to_number)
        return

    to_number = _ensure_whatsapp_prefix(to_number)
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        body=body,
        from_=settings.TWILIO_WHATSAPP_FROM,
        to=to_number,
    )


# ═══════════════════════════════════════════════════════════
#  Editor notifications (sent to EDITOR_WHATSAPP_NUMBER)
# ═══════════════════════════════════════════════════════════


def notify_editor_new_submission(
    paper_title: str,
    submission_id: str,
    classified_field: str,
    confidence_pct: int,
    dashboard_url: str,
) -> bool:
    body = (
        f"📄 New paper received\n\n"
        f"Title: {paper_title}\n"
        f"ID: {submission_id}\n"
        f"AI Field: {classified_field} ({confidence_pct}% confidence)\n\n"
        f"Review in dashboard: {dashboard_url}"
    )
    return _send_and_log(
        settings.EDITOR_WHATSAPP_NUMBER, body, "wa_editor_new_submission"
    )


def notify_editor_reviewer_suggestions_ready(
    paper_title: str,
    submission_id: str,
    top_reviewer_name: str,
    similarity_pct: int,
    dashboard_url: str,
) -> bool:
    body = (
        f"👥 Reviewer suggestions ready\n\n"
        f"Paper: {paper_title}\n"
        f"Top match: {top_reviewer_name} ({similarity_pct}%)\n\n"
        f"Approve assignments: {dashboard_url}"
    )
    return _send_and_log(
        settings.EDITOR_WHATSAPP_NUMBER, body, "wa_editor_suggestions_ready"
    )


def notify_editor_escalation(
    paper_title: str,
    submission_id: str,
    reason: str,
    dashboard_url: str,
) -> bool:
    body = (
        f"🚨 ESCALATION NEEDED\n\n"
        f"Paper: {paper_title}\n"
        f"Reason: {reason}\n\n"
        f"Manual action required: {dashboard_url}"
    )
    return _send_and_log(
        settings.EDITOR_WHATSAPP_NUMBER, body, "wa_editor_escalation"
    )


def notify_editor_review_complete(
    paper_title: str,
    submission_id: str,
    completed_count: int,
    total_count: int,
    dashboard_url: str,
) -> bool:
    status_line = f"Reviews: {completed_count}/{total_count} received"
    if completed_count == total_count:
        status_line += f"\nAll reviews complete — ready for decision: {dashboard_url}"

    body = (
        f"✅ Review update\n\n"
        f"Paper: {paper_title}\n"
        f"{status_line}"
    )
    return _send_and_log(
        settings.EDITOR_WHATSAPP_NUMBER, body, "wa_editor_review_complete"
    )


# ═══════════════════════════════════════════════════════════
#  Reviewer notifications (sent to reviewer's WhatsApp)
# ═══════════════════════════════════════════════════════════


def send_reviewer_whatsapp(
    reviewer_whatsapp: str,
    reviewer_name: str,
    paper_title: str,
    review_link: str,
    deadline_str: str,
) -> bool:
    body = (
        f"📝 Review invitation\n\n"
        f"Dear {reviewer_name},\n"
        f"Paper: {paper_title}\n"
        f"Deadline: {deadline_str}\n\n"
        f"Start review: {review_link}"
    )
    return _send_and_log(reviewer_whatsapp, body, "wa_reviewer_invitation")


def send_reviewer_reminder_whatsapp(
    reviewer_whatsapp: str,
    reviewer_name: str,
    paper_title: str,
    days_remaining: int,
    review_link: str,
) -> bool:
    body = (
        f"⏰ Reminder: {days_remaining} day{'s' if days_remaining != 1 else ''} left\n\n"
        f"Paper: {paper_title}\n"
        f"Please complete your review: {review_link}"
    )
    return _send_and_log(reviewer_whatsapp, body, "wa_reviewer_reminder")
