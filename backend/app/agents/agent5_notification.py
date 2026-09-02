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
        paper_id_display = (
            agent4_result.get("paper_id_display")
            or agent4_result.get("paper_id_code")
            or "unassigned"
        )
        paper_title = agent4_result.get("paper_title") or "(untitled manuscript)"
        article_type = agent4_result.get("article_type") or "Research Article"
        pdf_url = agent4_result.get("manuscript_pdf_url")
        pdf_is_redacted = agent4_result.get("manuscript_pdf_is_redacted", False)

        # Fetch the manuscript PDF once and reuse across reviewers so
        # we don't hit storage N times. Best-effort — a missing file
        # just means the invitation goes out without the attachment
        # (with the note omitted), matching the pre-attachment
        # behaviour so a storage outage never blocks invitations.
        pdf_attachments: list[dict] = []
        if pdf_url:
            try:
                from app.services.storage_service import download_bytes
                pdf_bytes = download_bytes(pdf_url)
                filename = (
                    f"{paper_id_display}_manuscript"
                    f"{'_anonymized' if pdf_is_redacted else ''}.pdf"
                ).replace("/", "-").replace("\\", "-")
                pdf_attachments = [{
                    "filename": filename,
                    "content": pdf_bytes,
                    "content_type": "application/pdf",
                }]
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Agent 5: could not fetch manuscript PDF (%s) — sending "
                    "invitation without attachment: %s", pdf_url, exc,
                )

        for review_data in reviews:
            # Send email invitation
            try:
                self._send_reviewer_email(
                    review_data, paper_id_display, paper_title, article_type,
                    pdf_attachments=pdf_attachments,
                )
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
                    self._send_reviewer_whatsapp(review_data, paper_id_display)
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

    def _send_reviewer_email(
        self,
        review_data: dict,
        paper_id_display: str,
        paper_title: str,
        article_type: str = "Research Article",
        pdf_attachments: Optional[list] = None,
    ):
        """Send the per-paper review invitation using the canonical
        JGAIR reviewer-invitation template.

        **Password policy — rotate on every invitation.** The reviewer
        gets a fresh temporary password embedded in every invitation
        email (matches the JGAIR template spec, and the editor's
        explicit expectation that every invitation carries credentials
        the reviewer can act on immediately).

        Rotation invalidates any previous password. A reviewer who
        holds another in-flight paper simply uses the most recent
        credentials — the *latest* invitation always wins. Editors can
        resend from the Review Room to re-issue the same paper's
        credentials if the reviewer misplaced the email.

        Accept / Decline buttons are the same credential-agnostic
        membership-invite URLs — Accept activates the account and
        lands on the reviewer dashboard where the assigned manuscript
        is waiting; Decline opens the reason-capture page.
        """
        from app.models.reviewer import Reviewer
        from app.services.reviewer_service import (
            _send_membership_invitation,
            _stamp_new_invitation,
        )

        reviewer = (
            self.db.query(Reviewer)
            .filter(Reviewer.id == review_data["reviewer_id"])
            .first()
        )
        if reviewer is None:
            raise RuntimeError(f"Reviewer {review_data['reviewer_id']} vanished between agents")

        # Human-friendly deadline. Agent 4 stamps expires_at as an ISO
        # string; format it to something a reviewer can act on.
        deadline_iso = review_data.get("expires_at")
        deadline_pretty = "within 21 days"
        if deadline_iso:
            try:
                from datetime import datetime as _dt
                deadline_pretty = _dt.fromisoformat(deadline_iso).strftime("%d %B %Y")
            except Exception:  # noqa: BLE001
                pass

        # Rotate a fresh temporary password so the invitation carries
        # working credentials, whether the reviewer is a first-timer
        # or already on the panel. _stamp_new_invitation also resets
        # accept/decline/revoke stamps so the row is a clean invite.
        plaintext = _stamp_new_invitation(reviewer)
        self.db.commit()

        _send_membership_invitation(
            reviewer,
            plaintext,
            db=self.db,
            manuscript_id=paper_id_display,
            manuscript_title=paper_title,
            article_type=article_type,
            review_deadline=deadline_pretty,
            include_temporary_password=True,
            attachments=pdf_attachments,
        )

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
        # Prefer the friendly paper_id_code; fall back to the truncated
        # UUID display Agent 4 attaches, so the subject line never reads
        # "Review Invitations Sent — None".
        paper_id = (
            agent4_result.get("paper_id_code")
            or agent4_result.get("paper_id_display")
            or "N/A"
        )
        paper_title = agent4_result.get("paper_title") or "(untitled manuscript)"
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
        <p>Review invitations have been sent for paper <strong>{paper_id}</strong>
           — <em>{paper_title}</em>.</p>
        <p><strong>Reviewers invited ({count}):</strong></p>
        <ul>{reviewers_html}</ul>
        {_btn("Open Dashboard", f"{settings.FRONTEND_URL}/editor")}
        """)
        editor_cc = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
        if editor_cc:
            _send_and_log(editor_cc, subject, body, "agent5_invitations_sent_email")
