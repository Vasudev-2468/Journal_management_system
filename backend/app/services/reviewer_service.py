import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from jose import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.reviewer import Reviewer
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission, SubmissionStatus
from app.services.state_machine import transition_or_direct
from app.utils.helpers import hash_password
from app.utils.link_tokens import create_review_link_token


# Panel-membership invitation JWTs.
#
# Three distinct ``type`` claims flow through the reviewer-membership
# flow — a legacy ``reviewer_invite`` token (still accepted by
# reviewer_auth.set_password for pre-existing invitations) plus the
# two one-click ``accept`` and ``decline`` types powered by the email
# buttons. All three share the 21-day TTL so a link stays valid for
# the whole acceptance window; the auto-revoke agent shuts down any
# invitation that runs out the clock.
_REVIEWER_INVITE_TYPE = "reviewer_invite"
_REVIEWER_INVITE_ACCEPT_TYPE = "reviewer_invite_accept"
_REVIEWER_INVITE_DECLINE_TYPE = "reviewer_invite_decline"
_REVIEWER_INVITE_TTL = timedelta(days=21)


# ── Random credential helper ─────────────────────────────

def _generate_random_password(length: int = 14) -> str:
    """Return a random reviewer password that mixes upper/lower/digit
    ranges. ``secrets`` is used throughout so the value is safe to
    send in an email as an initial credential the reviewer will
    replace on first login."""
    alphabet = string.ascii_letters + string.digits
    # Keep looping until we have at least one of each class — trivial
    # rejection sampling that gives us predictable strength for a
    # 14-character string.
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
        ):
            return pw


# ── Registration ─────────────────────────────────────────

def register_reviewer(
    db: Session,
    *,
    name: str,
    email: str,
    whatsapp_number: Optional[str],
    institution: Optional[str],
    expertise_tags: List[str],
) -> Reviewer:
    existing = db.query(Reviewer).filter(Reviewer.email == email).first()
    if existing:
        raise ValueError("A reviewer with this email already exists.")

    reviewer = Reviewer(
        name=name,
        email=email,
        whatsapp_number=whatsapp_number,
        institution=institution,
        expertise_tags=expertise_tags,
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def send_welcome_email(reviewer: Reviewer) -> None:
    """Self-serve registration confirmation. No activation link — the
    reviewer signed up on their own, they don't need one. Routes through
    the unified email pipeline (Gmail SMTP → Brevo → SendGrid)."""
    # Local import — email_service imports models transitively; a top-level
    # import would create a cycle at module load.
    from app.services.email_service import _send_and_log, _wrap

    body = _wrap(
        f"""
        <p>Dear {reviewer.name},</p>
        <p>Thank you for joining the JGAIR reviewer panel. Review invitations
           matching your expertise will arrive via email as papers come in:</p>
        <p><strong>{", ".join(reviewer.expertise_tags or []) or "General"}</strong></p>
        <p>Best regards,<br>Editorial Team</p>
        """
    )
    _send_and_log(
        reviewer.email,
        "Welcome to the JGAIR Reviewer Panel",
        body,
        "reviewer_welcome",
    )


# ── Editor-driven invitation flow ───────────────────────

def _mint_invite_token(reviewer_id: uuid.UUID, token_type: str) -> str:
    """Sign a reviewer-membership invitation JWT.

    ``iat`` lets the redeeming endpoint (set-password / accept /
    decline) reject any token minted before the reviewer's most
    recent ``invitation_sent_at`` — a revoke or resend invalidates
    every previously-issued link. ``exp`` mirrors
    ``invitation_expires_at`` on the reviewer row so an expired link
    is caught by both the JWT layer and the DB row check.
    """
    now = datetime.utcnow()
    payload = {
        "sub": str(reviewer_id),
        "type": token_type,
        "iat": now,
        "exp": now + _REVIEWER_INVITE_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def mint_reviewer_invitation_token(reviewer_id: uuid.UUID) -> str:
    """Legacy set-password activation token (kept for the old email
    template + any partially-processed invitations from before the
    Accept/Reject flow)."""
    return _mint_invite_token(reviewer_id, _REVIEWER_INVITE_TYPE)


def mint_reviewer_accept_token(reviewer_id: uuid.UUID) -> str:
    return _mint_invite_token(reviewer_id, _REVIEWER_INVITE_ACCEPT_TYPE)


def mint_reviewer_decline_token(reviewer_id: uuid.UUID) -> str:
    return _mint_invite_token(reviewer_id, _REVIEWER_INVITE_DECLINE_TYPE)


def _colored_btn(label: str, url: str, background: str) -> str:
    """Inline CTA button matched to the two-button Accept/Reject layout
    used by the invitation email. Colours are inlined because most
    mail clients strip external stylesheets."""
    return (
        f'<a href="{url}" style="display:inline-block;'
        f'background:{background};color:#ffffff;text-decoration:none;'
        f"font-weight:600;padding:12px 22px;border-radius:8px;"
        f'font-family:sans-serif;font-size:14px;">{label}</a>'
    )


def _fetch_masthead(db: Session) -> dict:
    """Read the active journal row and return the values the invitation
    template renders — falling back to safe defaults if the row is
    missing or a field is empty. Kept small so template rendering is
    the same shape whether or not a journal row exists yet.
    """
    from app.models.journal import Journal

    row = None
    try:
        row = db.query(Journal).filter(Journal.is_active.is_(True)).first()
    except Exception:  # noqa: BLE001
        row = None

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    return {
        "name": (row.title if row and row.title else
                 "JGAIR — Journal of Generative and Applied Intelligence Research"),
        "email": (
            (row.email_editorial if row else None)
            or settings.EDITORIAL_INBOX_EMAIL
            or settings.SENDGRID_FROM_EMAIL
            or "editorial@jgair.org"
        ),
        "website": frontend or "https://jgair.org",
        "editor_name": "Editorial Team",
        "editor_position": "Editorial Office",
    }


def send_reviewer_activation_email(
    reviewer: Reviewer,
    plaintext_password: Optional[str],
    accept_token: str,
    decline_token: str,
    *,
    db: Optional[Session] = None,
    manuscript_id: str = "—",
    manuscript_title: str = "(untitled manuscript)",
    article_type: str = "Research Article",
    review_deadline: Optional[str] = None,
    include_temporary_password: bool = True,
    attachments: Optional[list] = None,
) -> bool:
    """Deliver the reviewer invitation email.

    The template follows the JGAIR spec: sectioned layout with
    manuscript info, reviewer account block, Accept / Decline buttons,
    confidentiality reminder, deadline and journal masthead sign-off.

    Two credential paths (per the security recommendation): if
    ``include_temporary_password=True`` the freshly-generated password
    is embedded in the email (matches the plain-form template); if
    False, only the Username is shown and the reviewer is nudged to
    the "Set your password" activation link (the Accept button acts
    as that link — hitting Accept lands them on the portal to define
    their own password rather than surfacing a plaintext one in the
    inbox).

    Accept and Decline URLs are one-click GETs so nothing else in the
    inbox pipeline (link previewers, tracking indirection) fails
    silently on a POST. The Decline URL renders a reason-capture form
    at the destination page — see ``routers/reviewer_membership.py``.

    Returns True on successful send, False on provider failure.
    """
    from app.services.email_service import _send_and_log, _wrap

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    root = (settings.PUBLIC_API_URL or "").rstrip("/") or frontend
    accept_url = f"{root}/reviewer-membership-invite/{accept_token}/accept"
    decline_url = f"{root}/reviewer-membership-invite/{decline_token}/decline"
    portal_url = f"{frontend}/reviewer-login" if frontend else "/reviewer-login"

    masthead = _fetch_masthead(db) if db is not None else {
        "name": "JGAIR — Journal of Generative and Applied Intelligence Research",
        "email": settings.EDITORIAL_INBOX_EMAIL or "editorial@jgair.org",
        "website": frontend or "https://jgair.org",
        "editor_name": "Editorial Team",
        "editor_position": "Editorial Office",
    }

    if review_deadline is None:
        review_deadline = (datetime.utcnow() + _REVIEWER_INVITE_TTL).strftime("%d %B %Y")

    subject = f"Review Invitation: {manuscript_id} – {masthead['name']}"

    # Reviewer Account block — password shown only when explicitly
    # asked. Otherwise the Accept flow becomes the password-setting
    # link, matching the recommended security posture.
    if include_temporary_password and plaintext_password:
        credential_rows = (
            f"<p style='margin:2px 0;font-size:14px;font-family:monospace;color:#111827;'>"
            f"<strong>Username:</strong> {reviewer.email}<br>"
            f"<strong>Temporary Password:</strong> {plaintext_password}"
            f"</p>"
            f"<p style='margin:8px 0 0 0;font-size:12px;color:#6b7280;'>"
            f"You will be asked to change your temporary password after your first login."
            f"</p>"
        )
    else:
        credential_rows = (
            f"<p style='margin:2px 0;font-size:14px;font-family:monospace;color:#111827;'>"
            f"<strong>Username:</strong> {reviewer.email}"
            f"</p>"
            f"<p style='margin:8px 0 0 0;font-size:12px;color:#6b7280;'>"
            f"After you click <strong>Accept Review</strong>, you will be prompted to set your password."
            f"</p>"
        )

    # Attachment note — surfaces only when the caller included one or
    # more files. Kept in the body (not just the mailer's attachment
    # panel) so the reviewer can spot the manuscript even when their
    # client hides attachments behind a paperclip icon.
    if attachments:
        pdf_names = [a.get("filename", "manuscript.pdf") for a in attachments]
        attachment_note = (
            f"<div style='background:#eff6ff;border:1px solid #bfdbfe;"
            f"border-left:4px solid #1e40af;border-radius:6px;"
            f"padding:12px 16px;margin:6px 0 18px 0;'>"
            f"<p style='margin:0;font-size:13px;color:#1e3a8a;'>"
            f"📎 <strong>Manuscript attached:</strong> "
            f"{', '.join(pdf_names)}. The file is redacted where "
            f"available to preserve reviewer anonymity."
            f"</p></div>"
        )
    else:
        attachment_note = ""

    body = _wrap(
        f"""
        <p>Dear Dr. {reviewer.name},</p>

        <p>You have been invited to review the following manuscript submitted
           to <strong>{masthead['name']}</strong>.</p>

        <h3 style="margin:22px 0 6px 0;color:#111827;">📄 Manuscript Information</h3>
        <table style="width:100%;border-collapse:collapse;margin:6px 0 18px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;width:38%;">Manuscript ID</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{manuscript_id}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Manuscript Title</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{manuscript_title}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Article Type</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{article_type}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Journal</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{masthead['name']}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                       border:1px solid #e5e7eb;">Review Due Date</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">{review_deadline}</td>
          </tr>
        </table>

        <p>We would be grateful for your expert evaluation of this manuscript
           and your recommendation to the editor.</p>

        {attachment_note}

        <h3 style="margin:22px 0 6px 0;color:#111827;">🔐 Reviewer Account</h3>
        <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;
                    padding:14px 18px;margin:6px 0 18px 0;">
          <p style="margin:0 0 6px 0;font-size:13px;color:#374151;">
            A reviewer account has been created for you.
          </p>
          {credential_rows}
          <p style="margin:10px 0 0 0;font-size:12px;">
            Reviewer Portal:
            <a href="{portal_url}" style="color:#1e40af;word-break:break-all;">{portal_url}</a>
          </p>
        </div>

        <h3 style="margin:22px 0 6px 0;color:#111827;">📌 Please Respond to This Invitation</h3>
        <p>Before accessing the manuscript for review, please indicate whether
           you are able to undertake this review.</p>

        <div style="text-align:center;margin:22px 0;">
          {_colored_btn("✅ ACCEPT REVIEW", accept_url, "#16a34a")}
          &nbsp;&nbsp;
          {_colored_btn("❌ DECLINE REVIEW", decline_url, "#dc2626")}
        </div>

        <p style="font-size:13px;color:#4b5563;">
          If you <strong>accept</strong> the invitation, you will be taken to
          your reviewer dashboard, where you can access the manuscript and
          complete the review.
        </p>
        <p style="font-size:13px;color:#4b5563;">
          If you <strong>decline</strong>, you may optionally provide a
          reason: outside your area of expertise, conflict of interest,
          unable to complete within the deadline, personal or professional
          commitments, or other.
        </p>

        <h3 style="margin:22px 0 6px 0;color:#111827;">🔒 Confidentiality</h3>
        <p style="font-size:13px;color:#4b5563;">
          The manuscript and all materials associated with the peer-review
          process are confidential. Please do not share, distribute, or
          reproduce the manuscript or review materials.
        </p>
        <p style="font-size:13px;color:#4b5563;">
          If you identify a conflict of interest, please decline the
          invitation and inform the editorial office where appropriate.
        </p>

        <h3 style="margin:22px 0 6px 0;color:#111827;">⏰ Review Deadline</h3>
        <p style="font-size:13px;color:#4b5563;">
          If you accept this invitation, please submit your completed review by:
          <strong>{review_deadline}</strong>.
        </p>
        <p style="font-size:13px;color:#4b5563;">
          If you require an extension, you may request one through the
          reviewer portal.
        </p>

        <p style="font-size:11px;color:#6b7280;margin-top:22px;">
          If the buttons above do not work, copy and paste these links into
          your browser:<br>
          Accept: <a href="{accept_url}" style="color:#1e40af;word-break:break-all;">{accept_url}</a><br>
          Decline: <a href="{decline_url}" style="color:#1e40af;word-break:break-all;">{decline_url}</a>
        </p>

        <p style="margin-top:22px;">
          Thank you for contributing your expertise to the peer-review process.
        </p>

        <p style="margin-top:22px;">Sincerely,<br>
          <strong>{masthead['editor_name']}</strong><br>
          <span style="font-size:13px;color:#6b7280;">{masthead['editor_position']}</span><br>
          <span style="font-size:13px;color:#6b7280;">{masthead['name']}</span><br>
          <a href="mailto:{masthead['email']}" style="font-size:13px;color:#1e40af;">{masthead['email']}</a><br>
          <a href="{masthead['website']}" style="font-size:13px;color:#1e40af;">{masthead['website']}</a>
        </p>
        """
    )
    return _send_and_log(
        reviewer.email,
        subject,
        body,
        "reviewer_invitation",
        attachments=attachments,
    )


def _stamp_new_invitation(reviewer: Reviewer) -> str:
    """Apply the "fresh invitation" state to a reviewer row and return
    the plaintext password to be emailed. Regenerates the password so
    a forwarded old email can't sneak back in, resets every
    lifecycle stamp except ``invitation_sent_at``, and clears any
    prior decline/revoke/accept so a resend is a true reset."""
    plaintext = _generate_random_password()
    reviewer.password_hash = hash_password(plaintext)
    now = datetime.utcnow()
    reviewer.invitation_sent_at = now
    reviewer.invitation_expires_at = now + _REVIEWER_INVITE_TTL
    reviewer.invitation_accepted_at = None
    reviewer.invitation_declined_at = None
    reviewer.invitation_revoked_at = None
    # A previously-verified reviewer being re-invited is unusual, but
    # if it happens we treat the fresh Accept click as the new proof
    # of email possession.
    reviewer.email_verified_at = None
    return plaintext


def _publish_reviewer_event(reviewer_id: uuid.UUID, event: str, meta: dict | None = None) -> None:
    """Publish a lightweight event to the reviewer's WS topic. Best-effort."""
    try:
        from app.services import pubsub
        pubsub.publish_threadsafe(
            f"reviewer:{reviewer_id}",
            {"event": event, "meta": meta or {}},
        )
    except Exception:  # noqa: BLE001
        pass


def _send_membership_invitation(
    reviewer: Reviewer,
    plaintext: Optional[str],
    *,
    db: Optional[Session] = None,
    manuscript_id: str = "—",
    manuscript_title: str = "(untitled manuscript)",
    article_type: str = "Research Article",
    review_deadline: Optional[str] = None,
    include_temporary_password: bool = True,
    attachments: Optional[list] = None,
) -> bool:
    accept_token = mint_reviewer_accept_token(reviewer.id)
    decline_token = mint_reviewer_decline_token(reviewer.id)
    return send_reviewer_activation_email(
        reviewer,
        plaintext,
        accept_token,
        decline_token,
        db=db,
        manuscript_id=manuscript_id,
        manuscript_title=manuscript_title,
        article_type=article_type,
        review_deadline=review_deadline,
        include_temporary_password=include_temporary_password,
        attachments=attachments,
    )


def invite_reviewer(
    db: Session,
    *,
    name: str,
    email: str,
    whatsapp_number: Optional[str],
    institution: Optional[str],
    expertise_tags: List[str],
) -> tuple[Reviewer, bool]:
    """Editor-driven onboarding: create the reviewer row, generate a
    random password, and email the Accept/Reject invitation with the
    credentials inline.

    Returns ``(reviewer, email_sent)``. The reviewer row is committed
    even if the email fails so the editor can retry delivery from the
    panel (Resend) without duplicating the record.
    """
    reviewer = register_reviewer(
        db,
        name=name,
        email=email,
        whatsapp_number=whatsapp_number,
        institution=institution,
        expertise_tags=expertise_tags,
    )
    plaintext = _stamp_new_invitation(reviewer)
    db.commit()
    db.refresh(reviewer)
    email_sent = _send_membership_invitation(reviewer, plaintext)
    return reviewer, email_sent


# ── Invitation lifecycle: resend / revoke / accept / decline ────

_ACTIVATION_URL_TEMPLATE = "{root}/reviewer-set-password?token={token}"


def _reviewer_activation_url(token: str) -> str:
    root = (settings.FRONTEND_URL or "").rstrip("/")
    return _ACTIVATION_URL_TEMPLATE.format(root=root, token=token)


def build_invitation_link(reviewer: Reviewer) -> str:
    """Return the editor-facing Accept URL for the reviewer. Displayed
    in the Reviewers panel "Show invite link" modal so the editor can
    share it out-of-band (chat, phone) exactly the way the reviewer
    would receive it in the email."""
    api_root = (
        (settings.PUBLIC_API_URL or "").rstrip("/")
        or (settings.FRONTEND_URL or "").rstrip("/")
    )
    accept_token = mint_reviewer_accept_token(reviewer.id)
    return f"{api_root}/reviewer-membership-invite/{accept_token}/accept"


def reset_reviewer_password_only(db: Session, reviewer: Reviewer) -> str:
    """Regenerate a plaintext password for the reviewer, store the new
    hash, and return the plaintext so the editor can share it out-of-band.

    Distinct from ``resend_reviewer_invitation``: this touches ONLY the
    password. Invitation-lifecycle stamps, ``email_verified_at``, and
    the ``accepted`` state are all preserved, so a reviewer who has
    already onboarded keeps their onboarded state — only their password
    changes. Use this when an editor is answering "I forgot my password"
    on the reviewer's behalf.
    """
    plaintext = _generate_random_password()
    reviewer.password_hash = hash_password(plaintext)
    db.commit()
    db.refresh(reviewer)
    return plaintext


def resend_reviewer_invitation(db: Session, reviewer: Reviewer) -> bool:
    """Regenerate the password, reset every lifecycle timestamp, and
    dispatch a fresh Accept/Reject email. Un-revokes a
    previously-revoked reviewer as a side-effect — resending is the
    way to un-revoke."""
    plaintext = _stamp_new_invitation(reviewer)
    db.commit()
    db.refresh(reviewer)
    return _send_membership_invitation(reviewer, plaintext)


def revoke_reviewer_invitation(db: Session, reviewer: Reviewer) -> None:
    """Stamp ``invitation_revoked_at`` — any outstanding activation,
    accept, or decline token is refused from this point on, and the
    reviewer cannot log in even with the emailed credentials.
    Idempotent."""
    reviewer.invitation_revoked_at = datetime.utcnow()
    db.commit()


def accept_reviewer_invitation(db: Session, reviewer: Reviewer) -> None:
    """Reviewer clicked Accept — stamp ``invitation_accepted_at`` and
    treat the click as proof of email possession so login is unlocked
    immediately. Idempotent."""
    if reviewer.invitation_accepted_at is None:
        reviewer.invitation_accepted_at = datetime.utcnow()
    if reviewer.email_verified_at is None:
        reviewer.email_verified_at = datetime.utcnow()
    db.commit()


def decline_reviewer_invitation(
    db: Session,
    reviewer: Reviewer,
    *,
    reason_code: Optional[str] = None,
    reason_notes: Optional[str] = None,
) -> None:
    """Reviewer clicked Reject — stamp both ``invitation_declined_at``
    and ``invitation_revoked_at`` so the row is fully retired but the
    audit trail records the reviewer's choice (rather than the
    editor's or the agent's). Idempotent.

    The optional ``reason_code`` / ``reason_notes`` capture the
    decline reason from the form the reviewer filled in — they are
    persisted onto the reviewer row when the columns exist and always
    written to the notifications audit trail so the editor sees the
    context. Also flips the paired Review rows (if any) to declined
    and pings the editorial inbox so a replacement reviewer can be
    chosen.
    """
    now = datetime.utcnow()
    if reviewer.invitation_declined_at is None:
        reviewer.invitation_declined_at = now
    if reviewer.invitation_revoked_at is None:
        reviewer.invitation_revoked_at = now
    # Optional columns on the reviewer row — set them only if the
    # migration that added them has been applied; skip silently
    # otherwise to keep older DBs functional.
    if hasattr(reviewer, "decline_reason_code") and reason_code:
        reviewer.decline_reason_code = reason_code
    if hasattr(reviewer, "decline_reason_notes") and reason_notes:
        reviewer.decline_reason_notes = reason_notes

    # Roll every open pending Review for this reviewer over to declined
    # so the state matches the panel decision — the editor's Review Room
    # will then show the assignment slot as free and the Reviewer
    # Suggester Agent can pick a replacement.
    try:
        open_reviews = (
            db.query(Review)
            .filter(
                Review.reviewer_id == reviewer.id,
                Review.status == ReviewStatus.pending,
            )
            .all()
        )
        for rv in open_reviews:
            if hasattr(rv, "state"):
                try:
                    rv.state = "declined"
                except Exception:  # noqa: BLE001
                    pass
            rv.status = ReviewStatus.declined if hasattr(ReviewStatus, "declined") else rv.status
    except Exception:  # noqa: BLE001
        pass

    db.commit()

    # Best-effort notification to the editorial inbox so a replacement
    # can be lined up. Failures never break the reviewer's flow.
    try:
        from app.services.email_service import _send_and_log, _wrap
        editor_inbox = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
        if editor_inbox:
            reason_line = ""
            if reason_code:
                reason_line = (
                    f"<p><strong>Reason:</strong> {reason_code}"
                    f"{' — ' + reason_notes if reason_notes else ''}</p>"
                )
            _send_and_log(
                editor_inbox,
                f"Reviewer declined — {reviewer.name}",
                _wrap(
                    f"<p><strong>{reviewer.name}</strong> "
                    f"({reviewer.email}) has declined the review invitation.</p>"
                    f"{reason_line}"
                    f"<p>The paired assignment(s) have been released — the "
                    f"Reviewer Suggester Agent can propose a replacement from "
                    f"the Review Room.</p>"
                ),
                "reviewer_declined_editor_notice",
            )
    except Exception:  # noqa: BLE001
        pass


def auto_revoke_expired_invitations(db: Session) -> int:
    """Revoke every pending invitation whose 21-day window has elapsed.

    Called by the scheduled ``run_scheduled_tasks`` agent. A reviewer
    counts as pending when they have never accepted or declined and
    the invitation hasn't already been revoked; the deadline is the
    row's own ``invitation_expires_at``. Returns the count of rows
    revoked in this run so the scheduler can log it.
    """
    now = datetime.utcnow()
    stale = (
        db.query(Reviewer)
        .filter(
            Reviewer.invitation_expires_at.isnot(None),
            Reviewer.invitation_expires_at < now,
            Reviewer.invitation_accepted_at.is_(None),
            Reviewer.invitation_declined_at.is_(None),
            Reviewer.invitation_revoked_at.is_(None),
        )
        .all()
    )
    for reviewer in stale:
        reviewer.invitation_revoked_at = now
    if stale:
        db.commit()
    return len(stale)


def delete_reviewer(db: Session, reviewer: Reviewer) -> None:
    """Hard-delete a reviewer row.

    Reviewers with any review history cannot be deleted — deleting the
    row would leave the ``reviews`` table pointing at a gap. The
    caller should surface a 409 in that case and offer deactivation
    (``PATCH is_active=false``) instead."""
    if reviewer.reviews:
        raise ValueError(
            "Reviewer has review history and cannot be deleted. "
            "Deactivate the reviewer instead."
        )
    db.delete(reviewer)
    db.commit()


# ── Listing / detail ─────────────────────────────────────

def list_reviewers(
    db: Session,
    *,
    expertise_tag: Optional[str] = None,
    is_active: Optional[bool] = None,
    status: Optional[str] = None,
) -> List[Reviewer]:
    """Return reviewers, optionally narrowed by the Reviewers-panel
    status pill:

      * ``active``    — the row's ``is_active`` flag is true (regardless
                        of activation state).
      * ``inactive``  — deactivated by editor.
      * ``pending``   — never activated (no password) and invite not
                        revoked; the "waiting on reviewer" bucket.
      * ``activated`` — reviewer has set a password and can log in.
      * ``revoked``   — editor revoked the pending invitation.

    The named ``status`` is applied on top of ``is_active`` /
    ``expertise_tag`` so the UI can combine them freely.
    """
    query = db.query(Reviewer)
    if expertise_tag:
        query = query.filter(Reviewer.expertise_tags.any(expertise_tag))
    if is_active is not None:
        query = query.filter(Reviewer.is_active == is_active)
    if status:
        s = status.lower()
        if s == "active":
            query = query.filter(Reviewer.is_active.is_(True))
        elif s == "inactive":
            query = query.filter(Reviewer.is_active.is_(False))
        elif s == "pending":
            # Invited, no response yet, deadline not run out.
            query = query.filter(
                Reviewer.is_active.is_(True),
                Reviewer.invitation_expires_at.isnot(None),
                Reviewer.invitation_accepted_at.is_(None),
                Reviewer.invitation_declined_at.is_(None),
                Reviewer.invitation_revoked_at.is_(None),
            )
        elif s in ("accepted", "activated"):
            query = query.filter(
                Reviewer.is_active.is_(True),
                Reviewer.invitation_accepted_at.isnot(None),
            )
        elif s == "declined":
            query = query.filter(
                Reviewer.is_active.is_(True),
                Reviewer.invitation_declined_at.isnot(None),
            )
        elif s == "revoked":
            # "Revoked" hides declines — the two are distinct events in
            # the audit trail even though both stamp
            # ``invitation_revoked_at`` under the hood.
            query = query.filter(
                Reviewer.is_active.is_(True),
                Reviewer.invitation_revoked_at.isnot(None),
                Reviewer.invitation_declined_at.is_(None),
            )
    return query.order_by(Reviewer.name).all()


def get_reviewer_detail(db: Session, reviewer_id: uuid.UUID):
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        return None

    history = []
    for r in reviewer.reviews:
        submission = r.submission
        history.append(
            {
                "review_id": r.id,
                "submission_id": r.submission_id,
                "paper_title": submission.paper_title if submission else "N/A",
                "status": r.status.value,
                "assigned_at": r.assigned_at,
                "completed_at": r.completed_at,
            }
        )

    return {
        "id": reviewer.id,
        "name": reviewer.name,
        "email": reviewer.email,
        "whatsapp_number": reviewer.whatsapp_number,
        "institution": reviewer.institution,
        "expertise_tags": reviewer.expertise_tags or [],
        "current_load": reviewer.current_load,
        "max_assignments": reviewer.max_assignments,
        "is_active": reviewer.is_active,
        "created_at": reviewer.created_at,
        "review_history": history,
        # Access lifecycle — surfaced so the editor detail modal can
        # answer "has this reviewer logged in yet? has their invite
        # expired?" without the editor guessing.
        "password_set": bool(getattr(reviewer, "password_hash", None)),
        "email_verified_at": getattr(reviewer, "email_verified_at", None),
        "last_login_at": getattr(reviewer, "last_login_at", None),
        "invitation_sent_at": getattr(reviewer, "invitation_sent_at", None),
        "invitation_accepted_at": getattr(reviewer, "invitation_accepted_at", None),
        "invitation_declined_at": getattr(reviewer, "invitation_declined_at", None),
        "invitation_revoked_at": getattr(reviewer, "invitation_revoked_at", None),
        "invitation_expires_at": getattr(reviewer, "invitation_expires_at", None),
    }


# ── Update ───────────────────────────────────────────────

def update_reviewer(
    db: Session,
    reviewer_id: uuid.UUID,
    *,
    expertise_tags: Optional[List[str]] = None,
    max_assignments: Optional[int] = None,
    is_active: Optional[bool] = None,
) -> Optional[Reviewer]:
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        return None
    if expertise_tags is not None:
        reviewer.expertise_tags = expertise_tags
    if max_assignments is not None:
        reviewer.max_assignments = max_assignments
    if is_active is not None:
        reviewer.is_active = is_active
    db.commit()
    db.refresh(reviewer)
    return reviewer


# ── Assignment ───────────────────────────────────────────

def assign_reviewers(
    db: Session,
    submission_id: uuid.UUID,
    reviewer_ids: List[uuid.UUID],
) -> List[Review]:
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise ValueError("Submission not found.")

    created_reviews: List[Review] = []
    for rid in reviewer_ids:
        reviewer = db.query(Reviewer).filter(Reviewer.id == rid).first()
        if reviewer is None:
            raise ValueError(f"Reviewer {rid} not found.")
        if reviewer.current_load >= reviewer.max_assignments:
            raise ValueError(
                f"Reviewer {reviewer.name} has reached max assignments "
                f"({reviewer.max_assignments})."
            )

        # Fix D1 — the router verifies these tokens as JWTs. See the twin
        # fix in agents/agent4_link_generator.py for the rationale.
        review_id = uuid.uuid4()
        review = Review(
            id=review_id,
            submission_id=submission_id,
            reviewer_id=rid,
            link_token=create_review_link_token(review_id),
            link_expires_at=datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS),
            status=ReviewStatus.pending,
        )
        db.add(review)

        reviewer.current_load += 1
        created_reviews.append(review)

    transition_or_direct(db, submission, SubmissionStatus.under_review)
    db.commit()

    for review in created_reviews:
        db.refresh(review)

    return created_reviews
