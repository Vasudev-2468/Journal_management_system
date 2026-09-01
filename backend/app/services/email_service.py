"""
Email service — HTML email construction and delivery via SendGrid.

Every function builds an inline-CSS HTML email, sends it through the
SendGrid API, logs the attempt to the notifications table, and returns
True/False for success.
"""

import logging
from datetime import datetime
from typing import Optional

from sendgrid import SendGridAPIClient, SendGridException
from sendgrid.helpers.mail import Mail

from app.config import settings
from app.database import SessionLocal
from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationStatus,
)

logger = logging.getLogger(__name__)


# ── Base layout ──────────────────────────────────────────

_WRAPPER_TOP = """\
<div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
            max-width:600px;margin:0 auto;padding:24px;
            background:#ffffff;color:#1a1a1a;line-height:1.6;">
  <div style="border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:24px;">
    <span style="font-size:20px;font-weight:700;color:#1e40af;">
      JGAIR — Journal of Generative and Applied Intelligence Research
    </span>
  </div>
"""

_WRAPPER_BOTTOM = """\
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;
              font-size:12px;color:#6b7280;">
    This is an automated message from the JGAIR Editorial System.
    Please do not reply directly to this email.
  </div>
</div>
"""


def _wrap(body: str) -> str:
    return f"{_WRAPPER_TOP}{body}{_WRAPPER_BOTTOM}"


def _btn(label: str, url: str, color: str = "#1e40af") -> str:
    return (
        f'<a href="{url}" style="display:inline-block;padding:12px 28px;'
        f"background:{color};color:#ffffff;text-decoration:none;"
        f'font-weight:600;border-radius:6px;margin:16px 0;">'
        f"{label}</a>"
    )


# ── Low-level send + log ────────────────────────────────

def _from_address() -> str:
    """The address every outgoing email is stamped with.

    Preference order: GMAIL_SMTP_USER (must match the sending Gmail
    account for DMARC alignment) → SENDGRID_FROM_EMAIL → BREVO_SMTP_USER.
    Falls back to a placeholder so message construction never breaks.
    """
    return (
        settings.GMAIL_SMTP_USER
        or settings.SENDGRID_FROM_EMAIL
        or settings.BREVO_SMTP_USER
        or "no-reply@example.invalid"
    )


def _send_via_gmail(to_email: str, subject: str, html: str) -> tuple[bool, str]:
    """Send an HTML email via Gmail's SMTP relay using stdlib smtplib.

    Uses a Google App Password (not the account password). Because the
    ``From:`` address IS the sending Gmail account, DMARC/SPF/DKIM all
    align at Google, so messages don't hit the p=reject cliff that
    third-party relays run into when forging @gmail.com senders.
    """
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    from_addr = _from_address()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.GMAIL_SMTP_HOST, settings.GMAIL_SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.GMAIL_SMTP_USER, settings.GMAIL_SMTP_PASSWORD)
            smtp.sendmail(from_addr, [to_email], msg.as_string())
        return True, "sent via Gmail"
    except Exception as exc:  # noqa: BLE001
        return False, f"Gmail SMTP: {exc}"


def _send_via_brevo(to_email: str, subject: str, html: str) -> tuple[bool, str]:
    """Send an HTML email via Brevo's SMTP relay using stdlib smtplib.

    Returns ``(success, detail)``. On failure ``detail`` carries the
    exception message so ``_send_and_log`` can persist it into
    ``notifications.error_message``.
    """
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    from_addr = _from_address()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.BREVO_SMTP_HOST, settings.BREVO_SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.BREVO_SMTP_USER, settings.BREVO_SMTP_KEY)
            smtp.sendmail(from_addr, [to_email], msg.as_string())
        return True, "sent via Brevo"
    except Exception as exc:  # noqa: BLE001
        return False, f"Brevo SMTP: {exc}"


def _send_and_log(
    to_email: str,
    subject: str,
    html: str,
    trigger_event: str,
) -> bool:
    """Route the send through Gmail SMTP (preferred) → Brevo SMTP →
    SendGrid HTTP API. Persists a Notification row either way.
    """
    db = SessionLocal()
    try:
        # ── Primary: Gmail SMTP ────────────────────────
        if settings.GMAIL_SMTP_PASSWORD and settings.GMAIL_SMTP_USER:
            success, detail = _send_via_gmail(to_email, subject, html)
            db.add(
                Notification(
                    recipient_email=to_email,
                    channel=NotificationChannel.email,
                    trigger_event=trigger_event,
                    message_body=html,
                    status=NotificationStatus.sent if success else NotificationStatus.failed,
                    sent_at=datetime.utcnow() if success else None,
                    error_message=None if success else detail,
                )
            )
            db.commit()
            if success:
                logger.info("Email to %s — %s (Gmail)", to_email, trigger_event)
            else:
                logger.error("Email to %s — %s failed: %s", to_email, trigger_event, detail)
            return success

        # ── Secondary: Brevo SMTP ──────────────────────
        if settings.BREVO_SMTP_KEY and settings.BREVO_SMTP_USER:
            success, detail = _send_via_brevo(to_email, subject, html)
            db.add(
                Notification(
                    recipient_email=to_email,
                    channel=NotificationChannel.email,
                    trigger_event=trigger_event,
                    message_body=html,
                    status=NotificationStatus.sent if success else NotificationStatus.failed,
                    sent_at=datetime.utcnow() if success else None,
                    error_message=None if success else detail,
                )
            )
            db.commit()
            if success:
                logger.info("Email to %s — %s (Brevo)", to_email, trigger_event)
            else:
                logger.error("Email to %s — %s failed: %s", to_email, trigger_event, detail)
            return success

        # ── Fallback: SendGrid HTTP API ────────────────
        if not settings.SENDGRID_API_KEY:
            logger.warning(
                "No email provider configured (Brevo + SendGrid both empty) — skipping to %s",
                to_email,
            )
            return False

        message = Mail(
            from_email=_from_address(),
            to_emails=to_email,
            subject=subject,
            html_content=html,
        )
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        success = 200 <= response.status_code < 300

        db.add(
            Notification(
                recipient_email=to_email,
                channel=NotificationChannel.email,
                trigger_event=trigger_event,
                message_body=html,
                status=NotificationStatus.sent if success else NotificationStatus.failed,
                sent_at=datetime.utcnow() if success else None,
                error_message=None if success else f"HTTP {response.status_code}",
            )
        )
        db.commit()

        logger.info("Email to %s — %s (SendGrid HTTP %s)", to_email, trigger_event, response.status_code)
        return success

    except SendGridException:
        logger.error("SendGrid authentication failed — check SENDGRID_API_KEY")
        db.add(
            Notification(
                recipient_email=to_email,
                channel=NotificationChannel.email,
                trigger_event=trigger_event,
                message_body=html,
                status=NotificationStatus.failed,
                error_message="SendGrid UnauthorizedError — invalid API key",
            )
        )
        db.commit()
        return False

    except Exception as exc:
        logger.exception("Email to %s failed", to_email)
        db.add(
            Notification(
                recipient_email=to_email,
                channel=NotificationChannel.email,
                trigger_event=trigger_event,
                message_body=html,
                status=NotificationStatus.failed,
                error_message=str(exc)[:500],
            )
        )
        db.commit()
        return False

    finally:
        db.close()


# ── Backward-compat wrapper used by notification_service ─

def send_email(to_email: str, subject: str, html_content: str) -> None:
    """Simple fire-and-forget send. Raises on failure."""
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping email to %s", to_email)
        return

    message = Mail(
        from_email=settings.SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )
    sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
    sg.send(message)


# ═══════════════════════════════════════════════════════════
#  Public email functions
# ═══════════════════════════════════════════════════════════


def send_author_acknowledgment(
    author_email: str,
    author_name: str,
    paper_title: str,
    submission_id: str,
) -> bool:
    subject = f"Submission Received — {paper_title} [{submission_id}]"
    body = _wrap(
        f"""
        <p>Dear {author_name},</p>
        <p>Thank you for submitting your manuscript
           <strong>{paper_title}</strong> to our journal.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Submission ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <code style="background:#eef2ff;padding:2px 6px;border-radius:3px;">
                {submission_id}
              </code>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Expected Timeline</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              6 – 12 weeks from submission date
            </td>
          </tr>
        </table>

        <p>Your paper will undergo the following process:</p>
        <ol style="padding-left:20px;">
          <li>Automated field classification and plagiarism screening</li>
          <li>Editor review and reviewer assignment</li>
          <li>Double-blind peer review (2–3 reviewers)</li>
          <li>Editorial decision and notification</li>
        </ol>

        <p>You can track the status of your submission at any time using your
           Submission ID.</p>

        <p style="margin-top:24px;font-size:13px;color:#6b7280;">
          By submitting to this journal you agree to our
          <a href="{settings.FRONTEND_URL}/policies"
             style="color:#1e40af;">journal policies</a>,
          including our ethics and open-access guidelines.
        </p>

        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """
    )
    return _send_and_log(author_email, subject, body, "author_acknowledgment")


def notify_editor_new_submission(
    editor_email: str,
    paper_title: str,
    submission_id: str,
    classified_field: str,
    confidence: float,
    dashboard_url: str,
) -> bool:
    confidence_pct = f"{confidence * 100:.0f}%"
    confidence_color = "#059669" if confidence >= 0.8 else "#d97706" if confidence >= 0.6 else "#dc2626"

    subject = f"New Submission: {paper_title} — Action Required"
    body = _wrap(
        f"""
        <p>A new manuscript has been submitted and automatically classified.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Paper Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Submission ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <code>{submission_id}</code></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">AI Classification</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {classified_field}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Confidence</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <span style="color:{confidence_color};font-weight:700;">
                {confidence_pct}
              </span>
            </td>
          </tr>
        </table>

        <p>Please review the classification and assign reviewers:</p>
        {_btn("Open Dashboard", dashboard_url)}
        {_btn("Override Classification", f"{dashboard_url}/override", "#6b7280")}

        <p style="margin-top:16px;">Best regards,<br><strong>Journal System</strong></p>
        """
    )
    return _send_and_log(editor_email, subject, body, "editor_new_submission")


def notify_editor_new_review(
    editor_email: str,
    manuscript_id: str,
    paper_title: str,
    reviewer_display_name: str,
    recommendation: str,
    round_number: int,
    portal_url: str,
) -> bool:
    """Editor-facing notification when a reviewer submits their report.

    Deliberately carries NO reviewer prose (no comments, no
    confidential notes). The editor is directed into the portal to
    read the full structured Reviewer Report — that keeps
    confidential material out of the mail system's audit trail (spec
    §6 "the email should not contain the entire confidential review").
    """
    rec_label = (recommendation or "unspecified").replace("_", " ").title()
    subject = f"New Reviewer Report — {manuscript_id}"
    body = _wrap(
        f"""
        <p>Dear Editor,</p>

        <p>A reviewer has submitted their report for the manuscript below.
           Please open the editorial portal to read the full structured
           report.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Manuscript</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <code>{manuscript_id}</code></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Reviewer</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {reviewer_display_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Recommendation</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <strong>{rec_label}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Review Round</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              Round {round_number}</td>
          </tr>
        </table>

        <div style="text-align:center;margin:24px 0;">
          {_btn("View Reviewer Report", portal_url)}
        </div>

        <p style="font-size:12px;color:#6b7280;">
          Reviewer comments are not sent by email. Please read the full
          report inside the editorial portal so confidential feedback
          stays behind authenticated access.
        </p>

        <p>Best regards,<br><strong>Journal System</strong></p>
        """
    )
    return _send_and_log(editor_email, subject, body, "editor_new_review")


def notify_editor_escalation(
    editor_email: str,
    paper_title: str,
    submission_id: str,
    reason: str,
    dashboard_url: str,
) -> bool:
    subject = f"ESCALATION: Manual Review Needed — {paper_title}"
    body = _wrap(
        f"""
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;
                    padding:16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;font-weight:700;color:#dc2626;font-size:15px;">
            ⚠ Manual Review Required
          </p>
          <p style="margin:8px 0 0;color:#991b1b;">
            The automated classification system was unable to confidently
            categorise this submission.
          </p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Paper Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{paper_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Submission ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <code>{submission_id}</code></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#fef2f2;font-weight:600;
                        border:1px solid #e5e7eb;color:#dc2626;">Reason</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#dc2626;">
              {reason}</td>
          </tr>
        </table>

        <p>Please manually classify this paper and assign appropriate reviewers:</p>
        {_btn("Review & Assign", dashboard_url, "#dc2626")}

        <p style="margin-top:16px;">Best regards,<br><strong>Journal System</strong></p>
        """
    )
    return _send_and_log(editor_email, subject, body, "editor_escalation")


def send_reviewer_invitation(
    reviewer_email: str,
    reviewer_name: str,
    paper_title: str,
    review_link: str,
    deadline_date: str,
) -> bool:
    subject = f"Review Invitation: {paper_title}"
    body = _wrap(
        f"""
        <p>Dear {reviewer_name},</p>
        <p>You have been selected to review the following manuscript based on
           your expertise:</p>

        <div style="background:#eef2ff;border:1px solid #c7d2fe;padding:16px;
                    border-radius:6px;margin:16px 0;">
          <p style="margin:0;font-weight:700;font-size:15px;color:#1e40af;">
            {paper_title}
          </p>
        </div>

        <p><strong>Review Criteria:</strong></p>
        <ul style="padding-left:20px;">
          <li><strong>Originality</strong> — novelty of contribution</li>
          <li><strong>Technical Quality</strong> — soundness of methodology</li>
          <li><strong>Relevance</strong> — fit to the journal scope</li>
          <li><strong>Clarity</strong> — quality of writing and presentation</li>
          <li><strong>References</strong> — adequacy of cited literature</li>
        </ul>

        <p>Each criterion is scored on a 1–10 scale.  Please also provide a
           narrative assessment for the authors and, optionally, confidential
           comments for the editor.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Deadline</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;
                        font-weight:600;color:#dc2626;">{deadline_date}</td>
          </tr>
        </table>

        <p>Click the button below to access the redacted manuscript and submit
           your review.  This link is unique to you — please do not share it.</p>
        {_btn("Start Review", review_link)}

        <p style="font-size:13px;color:#6b7280;">
          If you are unable to complete this review, please let us know as
          soon as possible so we can reassign it.
        </p>

        <p>Thank you for your contribution to the peer-review process.</p>
        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """
    )
    return _send_and_log(reviewer_email, subject, body, "reviewer_invitation")


def send_reviewer_reminder(
    reviewer_email: str,
    reviewer_name: str,
    paper_title: str,
    review_link: str,
    days_remaining: int,
) -> bool:
    urgency_color = "#dc2626" if days_remaining <= 1 else "#d97706" if days_remaining <= 3 else "#1e40af"

    subject = f"Reminder: Review Due in {days_remaining} Days — {paper_title}"
    body = _wrap(
        f"""
        <p>Dear {reviewer_name},</p>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid {urgency_color};
                    padding:16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;font-weight:700;color:{urgency_color};font-size:15px;">
            Your review is due in {days_remaining} day{"s" if days_remaining != 1 else ""}
          </p>
        </div>

        <p>This is a friendly reminder that your review for
           <strong>{paper_title}</strong> is approaching its deadline.</p>

        <p>If you have already started, thank you!  If not, please set aside
           time to review the manuscript and submit your evaluation.</p>

        {_btn("Continue Review", review_link, urgency_color)}

        <p style="font-size:13px;color:#6b7280;">
          If you are unable to complete the review, please let us know
          immediately so we can reassign it.
        </p>

        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """
    )
    return _send_and_log(reviewer_email, subject, body, "reviewer_reminder")


def send_decision_to_author(
    author_email: str,
    author_name: str,
    paper_title: str,
    decision: str,
    editor_comments: str,
    revision_deadline: Optional[str] = None,
) -> bool:
    decision_display = decision.replace("_", " ").title()

    color_map = {
        "accepted": "#059669",
        "minor_revision": "#d97706",
        "major_revision": "#d97706",
        "revision_requested": "#d97706",
        "rejected": "#dc2626",
    }
    badge_color = color_map.get(decision, "#6b7280")

    # Next-steps block varies by decision
    if decision == "accepted":
        next_steps = (
            "<li>Our production team will contact you regarding final formatting</li>"
            "<li>You will receive a DOI and publication date shortly</li>"
        )
    elif decision in ("minor_revision", "major_revision", "revision_requested"):
        deadline_line = ""
        if revision_deadline:
            deadline_line = (
                f'<li>Please submit your revised manuscript by '
                f'<strong style="color:#dc2626;">{revision_deadline}</strong></li>'
            )
        next_steps = (
            f"<li>Please address the reviewer and editor comments below</li>"
            f"{deadline_line}"
            f"<li>Upload the revised manuscript along with a point-by-point response</li>"
        )
    else:
        next_steps = (
            "<li>You are welcome to submit a substantially revised version as a new submission</li>"
            "<li>Please carefully address the concerns raised before resubmitting</li>"
        )

    subject = f"Decision on Your Submission — {paper_title}"
    body = _wrap(
        f"""
        <p>Dear {author_name},</p>
        <p>The editorial review of your manuscript
           <strong>{paper_title}</strong> is now complete.</p>

        <div style="text-align:center;margin:24px 0;">
          <span style="display:inline-block;padding:10px 32px;
                       background:{badge_color};color:#ffffff;
                       font-size:18px;font-weight:700;border-radius:6px;">
            {decision_display}
          </span>
        </div>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;
                    padding:16px;border-radius:6px;margin:16px 0;">
          <p style="margin:0 0 8px;font-weight:700;">Editor's Comments:</p>
          <p style="margin:0;white-space:pre-line;">{editor_comments or "No additional comments provided."}</p>
        </div>

        <p><strong>Next Steps:</strong></p>
        <ol style="padding-left:20px;">
          {next_steps}
        </ol>

        <p>If you have any questions about this decision, please contact the
           editorial office.</p>

        <p>Thank you for choosing our journal.</p>
        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """
    )
    return _send_and_log(author_email, subject, body, "decision_to_author")
