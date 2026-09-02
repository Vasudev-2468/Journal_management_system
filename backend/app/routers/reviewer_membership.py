"""
Reviewer Membership Invitation Router — one-click Accept / Reject.

Powers the two buttons in the panel-invitation email. Both routes are
public GETs (a link click from an email) and return a plain HTML page
so the reviewer sees a coherent confirmation without leaving their
inbox.

  * GET /reviewer-membership-invite/{token}/accept
      Verifies the JWT, stamps ``invitation_accepted_at``, and hands
      back an HTML page inviting the reviewer to sign in with the
      credentials from the email.

  * GET /reviewer-membership-invite/{token}/decline
      Verifies the JWT, stamps both ``invitation_declined_at`` and
      ``invitation_revoked_at``, and hands back a thank-you page.

Distinct from ``/reviewer-invite`` (which handles the per-review link
tokens): the tokens here carry ``type=reviewer_invite_accept`` or
``type=reviewer_invite_decline`` — a per-review link token cannot
accept panel membership, and vice versa.

Any invalid, expired, revoked, or superseded token responds with an
HTML error page and a 4xx status so the browser tab shows a coherent
error rather than raw JSON.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Form
from fastapi.responses import HTMLResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.reviewer import Reviewer
from app.services.reviewer_service import (
    _REVIEWER_INVITE_ACCEPT_TYPE,
    _REVIEWER_INVITE_DECLINE_TYPE,
    accept_reviewer_invitation,
    decline_reviewer_invitation,
)


router = APIRouter()


# ── HTML shells ─────────────────────────────────────────

_STYLE = (
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
    "max-width:520px;margin:60px auto;padding:32px;"
    "background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"
    "box-shadow:0 4px 12px rgba(0,0,0,0.04);color:#111827;"
)
_BODY_STYLE = "background:#f9fafb;margin:0;padding:16px;min-height:100vh;"


def _page(title: str, tone: str, heading: str, body_html: str, *, status: int = 200) -> HTMLResponse:
    """Render a small standalone HTML confirmation page. ``tone`` is a
    single-word colour cue (``success``, ``warning``, ``error``) driving
    the header accent."""
    accent = {
        "success": "#16a34a",
        "warning": "#d97706",
        "error":   "#dc2626",
    }.get(tone, "#1e40af")
    html = (
        f"<!doctype html><html><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{title}</title></head>"
        f"<body style=\"{_BODY_STYLE}\">"
        f"<div style=\"{_STYLE}\">"
        f"<div style='height:4px;background:{accent};border-radius:2px;margin-bottom:20px;'></div>"
        f"<h1 style='margin:0 0 12px 0;font-size:22px;'>{heading}</h1>"
        f"<div style='font-size:15px;line-height:1.55;color:#374151;'>{body_html}</div>"
        f"</div></body></html>"
    )
    return HTMLResponse(content=html, status_code=status)


def _error_page(message: str, *, status: int = 400) -> HTMLResponse:
    return _page(
        "Invitation link", "error", "This invitation link is no longer valid",
        f"<p>{message}</p>",
        status=status,
    )


# ── Token verification ──────────────────────────────────

def _verify_membership_token(token: str, expected_type: str) -> Optional[UUID]:
    """Return the reviewer_id if the token is a well-formed JWT of the
    expected ``type``, else ``None``. Distinguishes signature/type
    problems from expiry so the caller can render different messages."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    subject = payload.get("sub")
    if not subject:
        return None
    try:
        return UUID(str(subject))
    except (ValueError, AttributeError):
        return None


def _token_iat(token: str) -> Optional[datetime]:
    """Second-pass decode purely to read ``iat`` — used to enforce the
    "only the most recent invitation redeems" rule. Failures are
    silent because the token has already been validated above."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None
    iat = payload.get("iat")
    if isinstance(iat, (int, float)):
        try:
            return datetime.utcfromtimestamp(int(iat))
        except (OverflowError, OSError, ValueError):
            return None
    return None


def _lookup_and_check(
    db: Session, token: str, expected_type: str,
) -> tuple[Optional[Reviewer], Optional[HTMLResponse]]:
    """Resolve the token to a Reviewer or produce an error page. The
    checks run in this order: signature/type → row exists → not
    revoked → not superseded → not expired. Whichever fires first wins,
    so the reviewer sees the single most useful message."""
    reviewer_id = _verify_membership_token(token, expected_type)
    if reviewer_id is None:
        return None, _error_page(
            "The link appears malformed or is not the one we sent — check "
            "you copied the whole URL from the email.",
        )
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        return None, _error_page(
            "We could not find a matching invitation. The reviewer record "
            "may have been removed. Please contact the editorial office.",
            status=404,
        )
    now = datetime.utcnow()
    if reviewer.invitation_revoked_at is not None:
        return None, _error_page(
            "This invitation has been revoked. If you'd still like to join "
            "the reviewer panel, please contact the editorial office and a "
            "fresh invitation can be sent.",
            status=410,
        )
    # Superseded — the reviewer got a resend later; only the most recent
    # invitation redeems. 1 s of slack absorbs JWT integer-second
    # truncation vs. the microsecond timestamp on the DB row.
    iat = _token_iat(token)
    if (
        reviewer.invitation_sent_at is not None
        and iat is not None
        and iat < reviewer.invitation_sent_at - timedelta(seconds=1)
    ):
        return None, _error_page(
            "A newer invitation has been sent to your inbox — please open "
            "the most recent email and click Accept or Reject there.",
            status=410,
        )
    if (
        reviewer.invitation_expires_at is not None
        and reviewer.invitation_expires_at < now
    ):
        return None, _error_page(
            "This invitation has expired. Please contact the editorial "
            "office if you would still like to join the reviewer panel.",
            status=410,
        )
    return reviewer, None


# ── GET /reviewer-membership-invite/{token}/accept ──────

@router.get("/{token}/accept", response_class=HTMLResponse)
def accept_membership(token: str, db: Session = Depends(get_db)):
    reviewer, err = _lookup_and_check(db, token, _REVIEWER_INVITE_ACCEPT_TYPE)
    if err is not None:
        return err
    already = reviewer.invitation_declined_at is not None
    if already:
        return _error_page(
            "You have already declined this invitation. If you changed "
            "your mind, please contact the editorial office and a fresh "
            "invitation can be sent.",
            status=409,
        )

    was_accepted = reviewer.invitation_accepted_at is not None
    accept_reviewer_invitation(db, reviewer)

    frontend = (settings.FRONTEND_URL or "").rstrip("/")
    login_url = f"{frontend}/reviewer-login" if frontend else "/reviewer-login"
    heading = (
        "You've already accepted — welcome back"
        if was_accepted else "Thank you — invitation accepted"
    )
    return _page(
        "Invitation accepted", "success", heading,
        (
            "<p>Your reviewer account is active. Sign in using the "
            "credentials sent in the invitation email:</p>"
            f"<p style='margin-top:20px;'>"
            f"<a href='{login_url}' "
            f"style='display:inline-block;background:#1e40af;color:#fff;"
            f"text-decoration:none;padding:11px 20px;border-radius:8px;"
            f"font-weight:600;'>Sign in to the reviewer portal</a></p>"
            "<p style='font-size:13px;color:#6b7280;margin-top:24px;'>"
            "For your security, please change the emailed password once "
            "you're signed in."
            "</p>"
        ),
    )


# ── Decline: reason-capture form (GET) + submit (POST) ──
#
# GET renders a short "why are you declining?" form so the reviewer's
# input flows into the notifications audit and helps the editor pick
# a replacement. POST processes the form, decision-stamps the row,
# and pings the editorial inbox. See ``decline_reviewer_invitation``
# for the persistence + notification side.


_DECLINE_REASONS = [
    ("outside_expertise", "Outside my area of expertise"),
    ("conflict_of_interest", "Conflict of interest"),
    ("deadline",            "Unable to meet the deadline"),
    ("not_available",       "Not available / personal or professional commitments"),
    ("other",               "Other"),
]


def _render_decline_form(token: str, reviewer: Reviewer) -> HTMLResponse:
    """Render the decline-reason form. The form POSTs back to the same
    URL so the reviewer's click chain stays inside the email → single
    URL flow — no client-side app required."""
    radio_rows = "".join(
        f"<label style='display:flex;align-items:center;gap:10px;"
        f"padding:8px 4px;font-size:14px;'>"
        f"<input type='radio' name='reason_code' value='{code}' required> "
        f"<span>{label}</span></label>"
        for code, label in _DECLINE_REASONS
    )
    form_html = (
        f"<p>We're sorry you can't take this on. If you have a moment, "
        f"please let us know why — this helps the editorial team plan "
        f"the round and pick a replacement reviewer.</p>"
        f"<form method='post' style='margin-top:12px;'>"
        f"<div>{radio_rows}</div>"
        f"<div style='margin-top:14px;'>"
        f"<label style='font-size:13px;color:#4b5563;display:block;margin-bottom:4px;'>"
        f"Additional comments (optional):</label>"
        f"<textarea name='reason_notes' rows='3' "
        f"style='width:100%;padding:10px;border:1px solid #d1d5db;"
        f"border-radius:8px;font-family:inherit;font-size:14px;'></textarea>"
        f"</div>"
        f"<div style='margin-top:18px;display:flex;gap:10px;'>"
        f"<button type='submit' "
        f"style='background:#dc2626;color:#fff;border:none;"
        f"padding:11px 20px;border-radius:8px;font-weight:600;"
        f"cursor:pointer;font-size:14px;'>Confirm Decline</button>"
        f"<a href='about:blank' onclick='window.close();return false;' "
        f"style='background:#f3f4f6;color:#374151;text-decoration:none;"
        f"padding:11px 20px;border-radius:8px;font-weight:600;"
        f"font-size:14px;'>Cancel</a>"
        f"</div>"
        f"</form>"
    )
    return _page(
        "Decline Review Invitation",
        "warning",
        f"Decline Review Invitation",
        form_html,
    )


@router.get("/{token}/decline", response_class=HTMLResponse)
def decline_membership_form(token: str, db: Session = Depends(get_db)):
    """Render the decline-reason capture form. Does NOT mark the
    invitation declined — the reviewer must confirm via POST."""
    reviewer, err = _lookup_and_check(db, token, _REVIEWER_INVITE_DECLINE_TYPE)
    if err is not None:
        return err
    if reviewer.invitation_accepted_at is not None:
        return _error_page(
            "You have already accepted this invitation. If you'd like to "
            "step down as a reviewer, please contact the editorial office.",
            status=409,
        )
    if reviewer.invitation_declined_at is not None:
        return _page(
            "Already declined", "warning", "You have already declined this invitation",
            "<p>Nothing more to do — the editorial team has been notified.</p>",
        )
    return _render_decline_form(token, reviewer)


@router.post("/{token}/decline", response_class=HTMLResponse)
def decline_membership_submit(
    token: str,
    reason_code: str = Form(...),
    reason_notes: str = Form(""),
    db: Session = Depends(get_db),
):
    """Finalise the decline once the reviewer picks a reason."""
    reviewer, err = _lookup_and_check(db, token, _REVIEWER_INVITE_DECLINE_TYPE)
    if err is not None:
        return err
    if reviewer.invitation_accepted_at is not None:
        return _error_page(
            "You have already accepted this invitation. If you'd like to "
            "step down as a reviewer, please contact the editorial office.",
            status=409,
        )
    # Only accept a code we listed in the form — anything else falls
    # into "other" so a tampered POST can't drop garbage into the audit.
    valid_codes = {code for code, _ in _DECLINE_REASONS}
    if reason_code not in valid_codes:
        reason_code = "other"

    decline_reviewer_invitation(
        db,
        reviewer,
        reason_code=reason_code,
        reason_notes=(reason_notes or "").strip() or None,
    )
    return _page(
        "Invitation declined", "warning", "Thank you for letting us know",
        (
            "<p>We've noted your decision — the invitation has been retired "
            "and you will not receive review requests from us.</p>"
            "<p style='font-size:13px;color:#6b7280;margin-top:20px;'>"
            "The editorial team has been notified and will identify a "
            "replacement reviewer. If this was a mistake, please contact "
            "the editorial office and a fresh invitation can be sent."
            "</p>"
        ),
    )
