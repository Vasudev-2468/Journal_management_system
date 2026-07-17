"""
Agent 1: Acknowledgement Bot

Triggers immediately on submission receipt.
Sends acknowledgement emails to:
  - Party 1: Author (submission receipt)
  - Party 2: Consult Party / Section Editor (format check request)
  - Party 3: Editor-in-Chief (CC notification)

Communicates with Agent 2 via orchestrator after completing.
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.submission import Submission, SubmissionStatus
from app.services.email_service import _send_and_log, _wrap, _btn
from app.services.whatsapp_service import _send_and_log as wa_send_and_log

logger = logging.getLogger(__name__)


class AcknowledgementAgent:
    """System Agent 1: Auto-Acknowledgement Bot."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, submission: Submission) -> dict:
        """
        Send acknowledgements to all 3 parties.
        Returns dict with status and paper_id_code for downstream agents.
        """
        paper_id = submission.paper_id_code
        results = {
            "agent": "AcknowledgementAgent",
            "paper_id_code": paper_id,
            "submission_id": str(submission.id),
            "parties_notified": [],
            "errors": [],
        }

        # Party 1: Author (Email)
        try:
            self._notify_author(submission, paper_id)
            results["parties_notified"].append("author")
        except Exception as exc:
            logger.exception("Agent 1: Failed to notify author")
            results["errors"].append(f"author: {exc}")

        # Party 1b: Author (WhatsApp — if number on file)
        try:
            self._notify_author_whatsapp(submission, paper_id)
            results["parties_notified"].append("author_whatsapp")
        except Exception as exc:
            logger.exception("Agent 1: Failed to send WhatsApp to author")
            results["errors"].append(f"author_whatsapp: {exc}")

        # Party 2: Consult Party (Section Editor)
        consult_email = submission.consult_party_email
        if consult_email:
            try:
                self._notify_consult_party(submission, paper_id, consult_email)
                results["parties_notified"].append("consult_party")
            except Exception as exc:
                logger.exception("Agent 1: Failed to notify consult party")
                results["errors"].append(f"consult_party: {exc}")

        # Party 3: Editor-in-Chief (CC)
        try:
            self._notify_editor(submission, paper_id)
            results["parties_notified"].append("editor")
        except Exception as exc:
            logger.exception("Agent 1: Failed to notify editor")
            results["errors"].append(f"editor: {exc}")

        # Update status for Agent 2
        submission.status = SubmissionStatus.awaiting_format_check
        self.db.commit()

        results["next_agent"] = "FormatValidationAgent"
        logger.info("Agent 1 completed for %s — notified: %s", paper_id, results["parties_notified"])
        return results

    def _notify_author(self, submission: Submission, paper_id: str):
        subject = f"Submission Received — {paper_id}"
        body = _wrap(f"""
        <p>Dear {submission.author_name},</p>
        <p>Thank you for submitting your manuscript
           <strong>{submission.paper_title}</strong> to our journal.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Paper ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <code style="background:#eef2ff;padding:2px 6px;border-radius:3px;">
                {paper_id}
              </code>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {submission.paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Submitted</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {submission.submitted_at.strftime('%B %d, %Y %H:%M UTC') if submission.submitted_at else 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Next Step</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              Format check in progress</td>
          </tr>
        </table>

        <p>Your paper will undergo:</p>
        <ol style="padding-left:20px;">
          <li>Automated format validation and plagiarism screening</li>
          <li>Consult party review and reviewer assignment</li>
          <li>Double-blind peer review (2–3 reviewers)</li>
          <li>Editorial decision and notification</li>
        </ol>

        <p>Track your submission:
          {_btn("Track Status", f"{settings.FRONTEND_URL}/submission/{submission.id}")}
        </p>

        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """)
        _send_and_log(submission.author_email, subject, body, "agent1_author_acknowledgement")

    def _notify_consult_party(self, submission: Submission, paper_id: str, consult_email: str):
        subject = f"New Paper Assigned for Format Check — {paper_id}"
        body = _wrap(f"""
        <p>A new manuscript has been submitted and requires your format review.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Paper ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{paper_id}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Author</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{submission.author_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{submission.paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Category</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{submission.classified_field or 'Pending'}</td>
          </tr>
        </table>

        <p>The automated format check will run shortly. You will receive the
           report and be asked to suggest reviewers.</p>

        {_btn("View in Dashboard", f"{settings.FRONTEND_URL}/consult-party/{submission.id}")}

        <p>Deadline: <strong>48 hours</strong></p>
        """)
        _send_and_log(consult_email, subject, body, "agent1_consult_party_notification")

    def _notify_editor(self, submission: Submission, paper_id: str):
        subject = f"New Submission Alert — {paper_id}"
        body = _wrap(f"""
        <p>A new manuscript has been received.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Paper ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{paper_id}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{submission.paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Author</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{submission.author_name}</td>
          </tr>
        </table>
        <p>The paper is now in the format check queue. You will be notified
           when reviewer assignment is needed.</p>
        {_btn("Open Dashboard", f"{settings.FRONTEND_URL}/editor")}
        """)
        _send_and_log(settings.SENDGRID_FROM_EMAIL, subject, body, "agent1_editor_cc_notification")

    def _notify_author_whatsapp(self, submission: Submission, paper_id: str):
        """Send WhatsApp acknowledgement to author if they have a number on file."""
        # Look up the author's whatsapp number from the User table
        from app.models.user import User
        author_user = self.db.query(User).filter(
            User.email == submission.author_email
        ).first()

        if not author_user or not author_user.whatsapp_number:
            logger.info("Agent 1: No WhatsApp number for author %s — skipping", submission.author_email)
            return

        body = (
            f"📄 *Submission Received*\n\n"
            f"Dear {submission.author_name},\n\n"
            f"Your manuscript *\"{submission.paper_title}\"* has been "
            f"successfully submitted.\n\n"
            f"📋 Paper ID: *{paper_id}*\n"
            f"📅 Submitted: {submission.submitted_at.strftime('%B %d, %Y') if submission.submitted_at else 'N/A'}\n\n"
            f"Next steps:\n"
            f"1️⃣ Format validation\n"
            f"2️⃣ Peer review assignment\n"
            f"3️⃣ Editorial decision\n\n"
            f"Track your submission at:\n"
            f"{settings.FRONTEND_URL}/submission/{submission.id}\n\n"
            f"— JGAIR Editorial Team"
        )
        wa_send_and_log(author_user.whatsapp_number, body, "agent1_author_whatsapp_acknowledgement")
