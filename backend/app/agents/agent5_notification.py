"""
Agent 5: Notification Bot

Sends Email + WhatsApp alerts for all workflow events:
  - Review invitations to reviewers
  - Reviewer assignment confirmations to editorial team
  - Review submission alerts to editorial team
  - All-reviews-complete notification

Receives data from Agent 4 (review links) and sends multi-channel notifications.
"""

import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.services.email_service import _send_and_log, _wrap, _btn
from app.services.whatsapp_service import _send_and_log as wa_send_and_log

logger = logging.getLogger(__name__)


class NotificationBotAgent:
    """System Agent 5: Multi-channel Notification Bot."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, agent4_result: dict) -> dict:
        """
        Send notifications for all created review links.
        """
        results = {
            "agent": "NotificationBotAgent",
            "paper_id_code": agent4_result.get("paper_id_code"),
            "submission_id": agent4_result.get("submission_id"),
            "invitations_sent": [],
            "errors": [],
        }

        reviews = agent4_result.get("reviews_created", [])

        for review_data in reviews:
            # Send email invitation
            try:
                self._send_reviewer_email(review_data, agent4_result["paper_id_code"])
                results["invitations_sent"].append({
                    "reviewer": review_data["reviewer_name"],
                    "channel": "email",
                    "status": "sent",
                })
            except Exception as exc:
                logger.exception("Agent 5: Email to %s failed", review_data["reviewer_email"])
                results["errors"].append(f"email to {review_data['reviewer_name']}: {exc}")

            # Send WhatsApp invitation
            if review_data.get("reviewer_whatsapp"):
                try:
                    self._send_reviewer_whatsapp(review_data, agent4_result["paper_id_code"])
                    results["invitations_sent"].append({
                        "reviewer": review_data["reviewer_name"],
                        "channel": "whatsapp",
                        "status": "sent",
                    })
                except Exception as exc:
                    logger.exception("Agent 5: WhatsApp to %s failed", review_data["reviewer_name"])
                    results["errors"].append(f"whatsapp to {review_data['reviewer_name']}: {exc}")

        # Notify editorial team
        try:
            self._notify_editorial_team(agent4_result)
            results["editorial_notified"] = True
        except Exception as exc:
            logger.exception("Agent 5: Editorial team notification failed")
            results["errors"].append(f"editorial_team: {exc}")

        results["total_sent"] = len(results["invitations_sent"])
        logger.info(
            "Agent 5 completed for %s — %d invitations sent",
            agent4_result.get("paper_id_code"), len(results["invitations_sent"])
        )
        return results

    def send_review_complete_alert(
        self,
        paper_id_code: str,
        submission_id: str,
        reviewer_name: str,
        recommendation: str,
        all_complete: bool = False,
    ) -> dict:
        """Called when a reviewer submits their review."""
        results = {"agent": "NotificationBotAgent", "event": "review_submitted"}

        # WhatsApp to editorial team
        emoji = {"accept": "✅", "minor_revision": "🔶", "major_revision": "🟠", "reject": "❌"}.get(recommendation, "📝")
        wa_body = (
            f"{emoji} REVIEW SUBMITTED\n\n"
            f"Paper: {paper_id_code}\n"
            f"Reviewer: {reviewer_name}\n"
            f"Recommendation: {recommendation.replace('_', ' ').title()}\n\n"
            f"View: {settings.FRONTEND_URL}/editor"
        )

        if all_complete:
            wa_body += f"\n\n📊 ALL REVIEWS COMPLETE for {paper_id_code}. Ready for editor decision."

        if settings.EDITOR_WHATSAPP_NUMBER:
            try:
                wa_send_and_log(settings.EDITOR_WHATSAPP_NUMBER, wa_body, "agent5_review_complete_wa")
                results["whatsapp_sent"] = True
            except Exception as exc:
                results["whatsapp_error"] = str(exc)

        # Email to editor
        subject = f"Review Submitted — {paper_id_code}"
        if all_complete:
            subject = f"All Reviews Complete — {paper_id_code}"

        body = _wrap(f"""
        <div style="background:#f0fdf4;border-left:4px solid #059669;padding:16px;margin-bottom:20px;border-radius:6px;">
          <strong>{emoji} Review Submitted</strong>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Paper ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{paper_id_code}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Reviewer</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{reviewer_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Recommendation</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{recommendation.replace('_', ' ').title()}</td>
          </tr>
        </table>

        {"<div style='background:#dbeafe;padding:12px;border-radius:6px;margin:16px 0;'><strong>📊 All reviews are now complete. Ready for editorial decision.</strong></div>" if all_complete else ""}

        {_btn("View Reviews", f"{settings.FRONTEND_URL}/editor")}
        """)
        try:
            # D5 — route to the configured editorial inbox, not the sender.
            editor_cc = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
            if editor_cc:
                _send_and_log(editor_cc, subject, body, "agent5_review_complete_email")
            results["email_sent"] = True
        except Exception as exc:
            results["email_error"] = str(exc)

        return results

    def _send_reviewer_email(self, review_data: dict, paper_id_code: str):
        """Send review invitation email to a reviewer."""
        subject = f"Invitation to Review — {paper_id_code}"
        deadline_text = review_data.get("expires_at", "21 days from now")

        body = _wrap(f"""
        <p>Dear {review_data['reviewer_name']},</p>
        <p>You have been invited to review a manuscript for our journal.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Paper ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{paper_id_code}</td>
          </tr>
        </table>

        <p>Your secure review link (valid for 21 days):</p>
        {_btn("Start Review", review_data['review_url'])}

        <p><strong>Deadline:</strong> {deadline_text}</p>

        <h3>What to do:</h3>
        <ol>
          <li>Click the link above (no login required)</li>
          <li>Download and read the manuscript</li>
          <li>Fill out the review form (scores + comments)</li>
          <li>Submit before the deadline</li>
        </ol>

        <p>Questions? Contact the editorial team.</p>
        <p>Thank you for your contribution to peer review.</p>
        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """)
        _send_and_log(review_data["reviewer_email"], subject, body, "agent5_reviewer_invitation_email")

    def _send_reviewer_whatsapp(self, review_data: dict, paper_id_code: str):
        """Send review invitation via WhatsApp."""
        body = (
            f"📄 Review Invitation\n\n"
            f"Paper: {paper_id_code}\n"
            f"Review link: {review_data['review_url']}\n"
            f"Deadline: 21 days\n\n"
            f"Reply ACCEPT or DECLINE to this message."
        )
        wa_send_and_log(review_data["reviewer_whatsapp"], body, "agent5_reviewer_invitation_wa")

    def _notify_editorial_team(self, agent4_result: dict):
        """Notify editorial team that invitations were sent."""
        paper_id = agent4_result.get("paper_id_code", "N/A")
        count = agent4_result.get("total_created", 0)
        reviewer_names = [r["reviewer_name"] for r in agent4_result.get("reviews_created", [])]

        # WhatsApp
        wa_body = (
            f"📨 Review invitations sent\n\n"
            f"Paper: {paper_id}\n"
            f"Reviewers ({count}): {', '.join(reviewer_names)}\n\n"
            f"Dashboard: {settings.FRONTEND_URL}/editor"
        )
        if settings.EDITOR_WHATSAPP_NUMBER:
            wa_send_and_log(settings.EDITOR_WHATSAPP_NUMBER, wa_body, "agent5_invitations_sent_wa")

        # Email
        reviewers_html = "".join(f"<li>{n}</li>" for n in reviewer_names)
        subject = f"Review Invitations Sent — {paper_id}"
        body = _wrap(f"""
        <p>Review invitations have been sent for paper <strong>{paper_id}</strong>.</p>
        <p><strong>Reviewers invited ({count}):</strong></p>
        <ul>{reviewers_html}</ul>
        {_btn("Open Dashboard", f"{settings.FRONTEND_URL}/editor")}
        """)
        editor_cc = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
        if editor_cc:
            _send_and_log(editor_cc, subject, body, "agent5_invitations_sent_email")
