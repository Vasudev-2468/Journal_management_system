"""
Email service — HTML email construction and delivery via SendGrid.

Every function builds an inline-CSS HTML email, sends it through the
SendGrid API, logs the attempt to the notifications table, and returns
True/False for success.
"""

import logging
from datetime import datetime
from typing import List, Optional

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


def _build_mime(
    to_email: str,
    subject: str,
    html: str,
    attachments: Optional[List[dict]] = None,
):
    """Compose an outbound MIME message.

    ``attachments`` — a list of ``{filename, content, content_type}``.
    When non-empty the message is wrapped in a ``multipart/mixed``
    envelope containing a ``multipart/alternative`` body plus one
    ``application/<subtype>`` part per file, so the reviewer's client
    renders the HTML body and shows the attachment inline.
    """
    from email.mime.base import MIMEBase
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email import encoders

    from_addr = _from_address()

    if attachments:
        outer = MIMEMultipart("mixed")
        outer["Subject"] = subject
        outer["From"] = from_addr
        outer["To"] = to_email
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html, "html", "utf-8"))
        outer.attach(alt)
        for att in attachments:
            content = att.get("content")
            filename = att.get("filename", "attachment")
            content_type = att.get("content_type", "application/octet-stream")
            if not content:
                continue
            maintype, _, subtype = content_type.partition("/")
            part = MIMEBase(maintype or "application", subtype or "octet-stream")
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{filename}"',
            )
            outer.attach(part)
        return outer, from_addr

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg, from_addr


def _send_via_gmail(
    to_email: str,
    subject: str,
    html: str,
    attachments: Optional[List[dict]] = None,
) -> tuple[bool, str]:
    """Send an HTML email via Gmail's SMTP relay using stdlib smtplib.

    Uses a Google App Password (not the account password). Because the
    ``From:`` address IS the sending Gmail account, DMARC/SPF/DKIM all
    align at Google, so messages don't hit the p=reject cliff that
    third-party relays run into when forging @gmail.com senders.
    ``attachments`` — optional list of file parts (see ``_build_mime``).
    """
    import smtplib

    msg, from_addr = _build_mime(to_email, subject, html, attachments)

    try:
        with smtplib.SMTP(settings.GMAIL_SMTP_HOST, settings.GMAIL_SMTP_PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.GMAIL_SMTP_USER, settings.GMAIL_SMTP_PASSWORD)
            smtp.sendmail(from_addr, [to_email], msg.as_string())
        return True, "sent via Gmail"
    except Exception as exc:  # noqa: BLE001
        return False, f"Gmail SMTP: {exc}"


def _send_via_brevo(
    to_email: str,
    subject: str,
    html: str,
    attachments: Optional[List[dict]] = None,
) -> tuple[bool, str]:
    """Send an HTML email via Brevo's SMTP relay using stdlib smtplib.

    Returns ``(success, detail)``. On failure ``detail`` carries the
    exception message so ``_send_and_log`` can persist it into
    ``notifications.error_message``.
    """
    import smtplib

    msg, from_addr = _build_mime(to_email, subject, html, attachments)

    try:
        with smtplib.SMTP(settings.BREVO_SMTP_HOST, settings.BREVO_SMTP_PORT, timeout=30) as smtp:
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
    attachments: Optional[List[dict]] = None,
) -> bool:
    """Route the send through Gmail SMTP (preferred) → Brevo SMTP →
    SendGrid HTTP API. Persists a Notification row either way.

    ``attachments`` — optional list of ``{filename, content, content_type}``
    dicts. Threaded through Gmail + Brevo SMTP paths. The SendGrid HTTP
    fallback ignores attachments today (its API takes a different shape);
    a send that must carry the PDF should reach Gmail first anyway.
    """
    db = SessionLocal()
    try:
        # ── Primary: Gmail SMTP ────────────────────────
        if settings.GMAIL_SMTP_PASSWORD and settings.GMAIL_SMTP_USER:
            success, detail = _send_via_gmail(to_email, subject, html, attachments)
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
            success, detail = _send_via_brevo(to_email, subject, html, attachments)
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
    manuscript_id: Optional[str] = None,
    review_deadline: Optional[str] = None,
    editor_name: Optional[str] = None,
    editor_position: Optional[str] = None,
    journal_name: Optional[str] = None,
) -> bool:
    """"Review Due Soon" reminder (JG spec).

    The template follows the editorial-team spec verbatim, with the six
    placeholders — DAYS_REMAINING, MANUSCRIPT_ID, MANUSCRIPT_TITLE,
    REVIEW_DEADLINE, REVIEWER_NAME, plus EDITOR_NAME / EDITOR_POSITION
    / JOURNAL_NAME — filled from the caller. Missing values fall back
    to sensible defaults so a partial call still renders cleanly.
    """
    urgency_color = "#dc2626" if days_remaining <= 1 else "#d97706" if days_remaining <= 3 else "#1e40af"

    # Fallbacks so the message still renders when the caller doesn't
    # thread every field — the scheduler call site now provides them all.
    manuscript_id_display = manuscript_id or "—"
    review_deadline_display = review_deadline or "the stated deadline"
    editor_name_display = editor_name or "Editorial Office"
    editor_position_display = editor_position or "Managing Editor"
    journal_name_display = journal_name or "the Editorial Team"

    subject = (
        f"Action Required: Review Due in {days_remaining} "
        f"Day{'s' if days_remaining != 1 else ''} – {manuscript_id_display}"
    )

    body = _wrap(
        f"""
        <p>Dear Dr. {reviewer_name},</p>

        <p>This is a reminder that your review for the following manuscript is due soon.</p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0"
               style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:6px 0;color:#374151;width:170px;">
              <strong>Manuscript ID:</strong>
            </td>
            <td style="padding:6px 0;color:#111827;">{manuscript_id_display}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#374151;"><strong>Title:</strong></td>
            <td style="padding:6px 0;color:#111827;">{paper_title}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#374151;"><strong>Review Deadline:</strong></td>
            <td style="padding:6px 0;color:{urgency_color};font-weight:700;">
              {review_deadline_display}
            </td>
          </tr>
        </table>

        <p>Our records indicate that your review has not yet been submitted.</p>

        <p>Please complete and submit your review before the deadline.</p>

        {_btn("📝 Complete Review", review_link, urgency_color)}

        <p style="font-size:13px;color:#6b7280;">
          If you require additional time, please request an extension through the reviewer portal.
        </p>

        <p>Thank you for your cooperation.</p>

        <p style="margin-top:24px;">
          Sincerely,<br>
          <strong>{editor_name_display}</strong><br>
          {editor_position_display}<br>
          {journal_name_display}
        </p>
        """
    )
    return _send_and_log(reviewer_email, subject, body, "reviewer_reminder")


def send_rejection_to_author(
    *,
    author_email: str,
    author_name: str,
    manuscript_id: str,
    manuscript_title: str,
    article_type: str = "Research Article",
    primary_reason: str = "the overall assessment by the reviewers and editorial team",
    rejection_reasons: Optional[List[str]] = None,
    reviewer_comments: Optional[List[dict]] = None,
    journal_name: Optional[str] = None,
    journal_email: Optional[str] = None,
    journal_website: Optional[str] = None,
    editor_name: str = "Editorial Team",
    editor_position: str = "Editorial Office",
) -> bool:
    """Send the canonical JGAIR rejection letter to the corresponding
    author.

    The layout follows the specification exactly — manuscript info
    block, decision block, AI-drafted rejection reasons (editor is
    authoritative but the reasons are seeded from the Review Analysis
    Agent's ``common_concerns``), reviewer author-visible comments,
    and a journal-masthead sign-off.

    Confidential reviewer-to-editor comments MUST NOT be passed in
    ``reviewer_comments`` — only the author-facing text belongs in
    this email. See ``reviews.public_comments`` on the Review model.
    """
    _journal_name = journal_name or "JGAIR — Journal of Generative and Applied Intelligence Research"
    _journal_email = journal_email or settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL or "editorial@jgair.org"
    _journal_website = journal_website or (settings.FRONTEND_URL or "https://jgair.org").rstrip("/")

    subject = f"Editorial Decision – Manuscript {manuscript_id} | {_journal_name}"

    # ── Rejection reasons list ───────────────────────────────
    # If the caller didn't seed any (e.g. legacy path with no
    # briefing available), fall back to a single line that still
    # produces a coherent email. Otherwise render up to the first
    # three so the email stays readable — the full audit lives in
    # the transition log.
    reasons = rejection_reasons or []
    reasons = [r for r in reasons if isinstance(r, str) and r.strip()]
    if not reasons:
        reasons_html = (
            "<li>The reviewers and editorial team judged that the "
            "contribution does not, in its present form, meet the "
            "journal's criteria for publication.</li>"
        )
    else:
        reasons_html = "".join(f"<li>{r}</li>" for r in reasons[:3])

    # ── Reviewer author-facing comments block ────────────────
    # Each entry: {"index": 1, "comments": "...", "recommendation": "..."}
    reviewer_blocks = []
    for entry in (reviewer_comments or [])[:3]:
        idx = entry.get("index") or len(reviewer_blocks) + 1
        comments = (entry.get("comments") or "").strip()
        if not comments:
            comments = (
                "<em>No author-facing comments were provided by this reviewer.</em>"
            )
        else:
            comments = comments.replace("\n", "<br>")
        reviewer_blocks.append(
            f"<div style='margin:16px 0 20px 0;padding:14px 16px;"
            f"background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;'>"
            f"<p style='margin:0 0 6px 0;font-weight:600;color:#111827;'>"
            f"Reviewer {idx}:</p>"
            f"<div style='font-size:14px;color:#374151;line-height:1.55;'>{comments}</div>"
            f"</div>"
        )
    reviewer_html = "".join(reviewer_blocks) or (
        "<p style='color:#6b7280;font-size:13px;'>"
        "No author-facing reviewer comments were captured for this manuscript."
        "</p>"
    )

    body = _wrap(
        f"""
        <p>Dear {author_name},</p>

        <p>Thank you for submitting your manuscript to <strong>{_journal_name}</strong>.</p>

        <p>We have completed the editorial evaluation and peer-review process
           for your manuscript:</p>

        <table style="width:100%;border-collapse:collapse;margin:6px 0 18px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;width:38%;">Manuscript ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{manuscript_id}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{manuscript_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Article Type</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{article_type}</td>
          </tr>
        </table>

        <p>Following careful consideration of the reviewers' reports and the
           editorial assessment, we regret to inform you that the manuscript
           has been rejected for publication in <strong>{_journal_name}</strong>.</p>

        <h3 style="margin:22px 0 6px 0;color:#111827;">Editorial Decision</h3>
        <div style="text-align:center;margin:14px 0 18px 0;">
          <span style="display:inline-block;padding:10px 32px;
                       background:#dc2626;color:#ffffff;
                       font-size:18px;font-weight:700;border-radius:6px;">
            ❌ REJECT
          </span>
        </div>

        <p>The decision was reached after considering the manuscript's
           <strong>{primary_reason}</strong>.</p>

        <p>The major issues identified during the evaluation include:</p>
        <ol style="padding-left:20px;line-height:1.6;">
          {reasons_html}
        </ol>

        <p>The reviewers' comments, where applicable, are provided below to help
           you understand the concerns raised during the evaluation.</p>

        <h3 style="margin:22px 0 6px 0;color:#111827;">Reviewer Comments</h3>
        {reviewer_html}

        <p style="font-size:13px;color:#4b5563;">
          Please note that confidential comments submitted by reviewers to
          the editor are not included in this communication.
        </p>

        <p>We understand that this decision may be disappointing. However, we
           hope that the reviewers' and editor's comments will be useful in
           improving the manuscript for possible submission to another
           appropriate venue.</p>

        <p>Thank you for considering <strong>{_journal_name}</strong> for your
           work. We appreciate the time and effort invested in preparing and
           submitting your manuscript.</p>

        <p style="margin-top:22px;">Sincerely,<br>
          <strong>{editor_name}</strong><br>
          <span style="font-size:13px;color:#6b7280;">{editor_position}</span><br>
          <span style="font-size:13px;color:#6b7280;">{_journal_name}</span><br>
          <a href="mailto:{_journal_email}" style="font-size:13px;color:#1e40af;">{_journal_email}</a><br>
          <a href="{_journal_website}" style="font-size:13px;color:#1e40af;">{_journal_website}</a>
        </p>
        """
    )
    return _send_and_log(author_email, subject, body, "manuscript_rejection")


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
