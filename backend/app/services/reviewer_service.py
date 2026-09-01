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


def send_reviewer_activation_email(
    reviewer: Reviewer,
    plaintext_password: str,
    accept_token: str,
    decline_token: str,
) -> bool:
    """Deliver the invitation email carrying the reviewer's initial
    credentials and the Accept / Reject buttons.

    The reviewer's login username is their email; the password is the
    freshly-generated one from ``_generate_random_password`` — the
    Accept button confirms membership and unlocks login, the Reject
    button records a decline. Both links are one-click GETs so the
    reviewer never leaves their inbox to answer.

    Uses ``_send_and_log`` so delivery hits Gmail SMTP first (see the
    provider chain in ``email_service._send_and_log``) and every send
    lands in the notifications table for the editor's audit view.
    Returns True on success, False on any provider failure.
    """
    from app.services.email_service import _send_and_log, _wrap

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    # Backend endpoints — GET so an email-client's link tracker
    # doesn't accidentally consume the click through a HEAD request.
    root = (settings.PUBLIC_API_URL or "").rstrip("/") or frontend
    accept_url = f"{root}/reviewer-membership-invite/{accept_token}/accept"
    decline_url = f"{root}/reviewer-membership-invite/{decline_token}/decline"

    expertise_line = ""
    if reviewer.expertise_tags:
        expertise_line = (
            f"<p style='margin:6px 0 18px 0;'>Areas we would like your input on: "
            f"<strong>{', '.join(reviewer.expertise_tags)}</strong>.</p>"
        )

    days = int(_REVIEWER_INVITE_TTL.total_seconds() // 86400)
    login_url = f"{frontend}/reviewer-login" if frontend else "/reviewer-login"

    body = _wrap(
        f"""
        <p>Dear {reviewer.name},</p>

        <p>You have been invited to join the JGAIR reviewer panel. Please
           <strong>Accept</strong> or <strong>Reject</strong> this invitation
           within <strong>{days} days</strong> — if we hear nothing before
           then, the invitation will be revoked automatically.</p>

        {expertise_line}

        <div style="text-align:center;margin:24px 0;">
          {_colored_btn("Accept invitation", accept_url, "#16a34a")}
          &nbsp;&nbsp;
          {_colored_btn("Reject invitation", decline_url, "#dc2626")}
        </div>

        <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;
                    padding:14px 18px;margin:20px 0;">
          <p style="margin:0 0 6px 0;font-size:13px;color:#374151;">
            Once you accept, sign in with these credentials — please change
            the password after first login:
          </p>
          <p style="margin:2px 0;font-size:14px;font-family:monospace;color:#111827;">
            <strong>Username:</strong> {reviewer.email}<br>
            <strong>Password:</strong> {plaintext_password}
          </p>
          <p style="margin:8px 0 0 0;font-size:12px;">
            <a href="{login_url}" style="color:#1e40af;">Sign in to the reviewer portal</a>
          </p>
        </div>

        <p style="font-size:12px;color:#6b7280;">
          If the buttons above do not work, copy and paste these links into
          your browser:<br>
          Accept: <a href="{accept_url}" style="color:#1e40af;word-break:break-all;">{accept_url}</a><br>
          Reject: <a href="{decline_url}" style="color:#1e40af;word-break:break-all;">{decline_url}</a>
        </p>

        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-left:4px solid #1e40af;
                    padding:12px 16px;border-radius:6px;margin:20px 0;">
          <p style="margin:0;font-size:13px;color:#1e3a8a;">
            If you were not expecting this invitation you can safely ignore
            this email — inaction is treated as a decline after {days} days.
          </p>
        </div>

        <p>Best regards,<br><strong>Editorial Team</strong></p>
        """
    )
    return _send_and_log(
        reviewer.email,
        "You've been invited to review for JGAIR — please accept or reject",
        body,
        "reviewer_invitation",
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


def _send_membership_invitation(reviewer: Reviewer, plaintext: str) -> bool:
    accept_token = mint_reviewer_accept_token(reviewer.id)
    decline_token = mint_reviewer_decline_token(reviewer.id)
    return send_reviewer_activation_email(
        reviewer, plaintext, accept_token, decline_token,
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


def decline_reviewer_invitation(db: Session, reviewer: Reviewer) -> None:
    """Reviewer clicked Reject — stamp both ``invitation_declined_at``
    and ``invitation_revoked_at`` so the row is fully retired but the
    audit trail records the reviewer's choice (rather than the
    editor's or the agent's). Idempotent."""
    now = datetime.utcnow()
    if reviewer.invitation_declined_at is None:
        reviewer.invitation_declined_at = now
    if reviewer.invitation_revoked_at is None:
        reviewer.invitation_revoked_at = now
    db.commit()


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

    submission.status = SubmissionStatus.under_review
    db.commit()

    for review in created_reviews:
        db.refresh(review)

    return created_reviews
