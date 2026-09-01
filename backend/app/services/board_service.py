"""Editorial board member invitation lifecycle.

Mirrors ``reviewer_service`` but for the ``editorial_board_members``
table. Editor supplies a name + email + role + category on the admin
page → we create a placeholder row that is marked inactive, mint a
signed ``board_invite`` JWT (7-day TTL — filling a full editorial
profile takes real time) and email the invitee a link that lands on
the public ``/board/complete-profile/:token`` page. When the invitee
submits the profile we flip ``is_active`` on and stamp
``invitation_completed_at``.

Only one token can ever be valid for a member at a time — the JWT
carries an ``iat`` claim that must match ``invitation_token_iat`` on
the row, so a resend or revoke immediately invalidates every prior
link.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.editorial_board_member import EditorialBoardMember


_BOARD_INVITE_TYPE = "board_invite"
_BOARD_INVITE_TTL = timedelta(days=7)


class BoardInviteError(Exception):
    """Raised when a token is malformed, expired, or superseded."""


# ── Token minting ───────────────────────────────────────


def mint_board_invitation_token(member_id: int, iat: datetime) -> str:
    """Sign a JWT identifying the pending member. ``iat`` is the
    datetime we also stamp onto ``invitation_token_iat`` — the redeem
    path checks the two match so an older token stops working the
    moment a resend or revoke bumps the row's iat."""
    payload = {
        "sub": str(member_id),
        "type": _BOARD_INVITE_TYPE,
        "iat": iat,
        "exp": iat + _BOARD_INVITE_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_board_invitation_token(token: str) -> tuple[int, datetime]:
    """Return ``(member_id, iat)`` if the JWT is valid — signature good,
    not expired, correct type. Raises ``BoardInviteError`` otherwise so
    the router can turn every failure mode into the same 400 to avoid
    oracle-style leaks about which pending row exists."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise BoardInviteError(f"Invalid invitation token: {exc}") from exc
    if payload.get("type") != _BOARD_INVITE_TYPE:
        raise BoardInviteError("Invitation token is not valid for this action.")
    try:
        member_id = int(str(payload.get("sub")))
    except (TypeError, ValueError):
        raise BoardInviteError("Malformed invitation token.")
    iat_raw = payload.get("iat")
    try:
        iat = datetime.utcfromtimestamp(int(iat_raw))
    except (TypeError, ValueError):
        raise BoardInviteError("Malformed invitation token.")
    return member_id, iat


def _activation_url(token: str) -> str:
    root = (settings.FRONTEND_URL or "").rstrip("/")
    return f"{root}/board/complete-profile/{token}"


# ── Email ───────────────────────────────────────────────


def send_board_invitation_email(member: EditorialBoardMember, token: str) -> bool:
    """Deliver the "complete your editorial profile" link. Routes
    through the unified email pipeline so it hits Gmail SMTP first
    (with Brevo/SendGrid as fallbacks) and every send lands in the
    notifications table."""
    from app.services.email_service import _btn, _send_and_log, _wrap

    url = _activation_url(token)
    days = int(_BOARD_INVITE_TTL.total_seconds() // 86400)
    body = _wrap(
        f"""
        <p>Dear {member.name},</p>

        <p>You have been invited to join the <strong>JGAIR editorial board</strong>
           as <strong>{member.role}</strong>. To accept, please complete your
           editorial profile using the link below — this link is valid for the
           next <strong>{days} days</strong> and can only be used once.</p>

        <div style="text-align:center;">
          {_btn("Complete your editorial profile", url)}
        </div>

        <p style="font-size:13px;color:#6b7280;">
          If the button does not work, copy and paste this link into your browser:<br>
          <a href="{url}" style="color:#1e40af;word-break:break-all;">{url}</a>
        </p>

        <p>The profile page asks you to upload a photo, a short CV,
           optional certifications, and to confirm your academic identifiers
           (ORCID, Scopus, Google Scholar). Everything you enter is reviewed
           by the editorial office before your profile appears on the public
           board page.</p>

        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-left:4px solid #1e40af;
                    padding:12px 16px;border-radius:6px;margin:20px 0;">
          <p style="margin:0;font-size:13px;color:#1e3a8a;">
            If you were not expecting this invitation you can safely ignore
            this email — no profile will be published until you complete it.
          </p>
        </div>

        <p>Best regards,<br><strong>Editorial Office</strong></p>
        """
    )
    return _send_and_log(
        member.email or member.invited_email or "",
        "Invitation to join the JGAIR Editorial Board",
        body,
        "board_invitation",
    )


# ── Invite / redeem ─────────────────────────────────────


def invite_board_member(
    db: Session,
    *,
    name: str,
    email: str,
    category: str,
    role: str,
) -> tuple[EditorialBoardMember, str, bool]:
    """Create a pending board-member row + mint a token + email it.

    Returns ``(member, token, email_sent)``. The token is returned so the
    router can hand a shareable link back to the editor in case delivery
    fails and they want to send it manually. A duplicate ``invited_email``
    that has NOT yet completed the profile is treated as "resend": we
    bump the iat and re-mail rather than creating a second row.
    """
    existing = (
        db.query(EditorialBoardMember)
        .filter(EditorialBoardMember.invited_email == email)
        .filter(EditorialBoardMember.invitation_completed_at.is_(None))
        .first()
    )
    if existing is not None:
        return resend_board_invitation(db, existing.id)

    now = datetime.utcnow()
    member = EditorialBoardMember(
        name=name,
        role=role,
        category=category,
        email=email,
        invited_email=email,
        invitation_sent_at=now,
        invitation_token_iat=now,
        is_active=False,  # not shown on public page until profile completed
        sort_order=100,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    token = mint_board_invitation_token(member.id, now)
    email_sent = send_board_invitation_email(member, token)
    return member, token, email_sent


def resend_board_invitation(
    db: Session, member_id: int
) -> tuple[EditorialBoardMember, str, bool]:
    member = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if member is None:
        raise BoardInviteError("Board member not found.")
    if member.invitation_completed_at is not None:
        raise BoardInviteError("This board member has already completed their profile.")

    now = datetime.utcnow()
    member.invitation_sent_at = now
    member.invitation_token_iat = now
    member.invitation_revoked_at = None
    db.commit()
    db.refresh(member)

    token = mint_board_invitation_token(member.id, now)
    email_sent = send_board_invitation_email(member, token)
    return member, token, email_sent


def revoke_board_invitation(db: Session, member_id: int) -> EditorialBoardMember:
    member = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if member is None:
        raise BoardInviteError("Board member not found.")
    member.invitation_revoked_at = datetime.utcnow()
    # Bump iat so any outstanding token stops matching.
    member.invitation_token_iat = datetime.utcnow()
    db.commit()
    db.refresh(member)
    return member


def resolve_pending_member(
    db: Session, token: str
) -> EditorialBoardMember:
    """Verify the JWT, load the row, and enforce every "still valid"
    condition. Every failure raises ``BoardInviteError`` with a message
    fit for surfacing to the invitee — the router turns that into a 400."""
    member_id, iat = verify_board_invitation_token(token)
    member = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if member is None:
        raise BoardInviteError("This invitation link is no longer valid.")
    if member.invitation_revoked_at is not None:
        raise BoardInviteError("This invitation has been revoked.")
    if member.invitation_completed_at is not None:
        raise BoardInviteError("This invitation has already been used.")
    row_iat = member.invitation_token_iat
    # Compare at second precision — JWT ``iat`` is a unix int, the DB
    # column is a datetime; rounding trip can shift by <1 s.
    if row_iat is None or abs((row_iat - iat).total_seconds()) > 1:
        raise BoardInviteError("This invitation link has been superseded.")
    return member


def complete_profile(
    db: Session, member: EditorialBoardMember, patch: dict
) -> EditorialBoardMember:
    """Apply the invitee-submitted profile data. Only the fields present
    in ``patch`` are written; ``is_active`` is flipped on and the
    completion timestamp is stamped so the row shows up on the public
    board page."""
    # Fields the invitee is allowed to fill. Everything else on the row
    # (invitation_*, sort_order, category, editorial position, etc.) is
    # owned by the editor and must not be overwritten by the public form.
    _ALLOWED = (
        "name",
        "role",
        "affiliation",
        "department",
        "country",
        "phone",
        "orcid",
        "scholar_url",
        "scopus_id",
        "institutional_profile_url",
        "qualifications",
        "bio",
        "expertise",
        "keywords",
        "years_editorial_experience",
        "max_active_manuscripts",
        "photo_file_url",
        "resume_file_url",
        "certification_files",
    )
    for key, value in patch.items():
        if key in _ALLOWED and value not in (None, "", []):
            setattr(member, key, value)
    member.invitation_completed_at = datetime.utcnow()
    member.is_active = True
    db.commit()
    db.refresh(member)
    return member
