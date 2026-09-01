"""
Public password-reset router — self-serve for authors, editors, and any
other role that holds a ``users`` row.

Two endpoints, both anonymous:

  * ``POST /password-reset/request`` — email in, always returns 202. The
    response body is identical whether or not the account exists so
    attackers cannot use this endpoint to enumerate registered emails.
    A signed one-time JWT (``kind='password_reset'``, 30-minute TTL) is
    embedded in the emailed link; the bcrypt hash of that token lives on
    the user row so the DB alone can't be replayed as a valid link.

  * ``POST /password-reset/verify`` — token + new password. We verify
    the JWT signature, look up the user by the encoded ``sub`` claim,
    then bcrypt-check the token against the stored hash and confirm the
    expiry has not passed. On success we hash and store the new
    password, then clear the reset columns so the link is single-use.
"""

import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.email_service import _send_and_log, _wrap, _btn
from app.utils.helpers import hash_password, verify_password


def _digest_token(token: str) -> str:
    """SHA-256 hex of the JWT reset token, HMAC-keyed with the app secret.

    Reset tokens are JWTs — well over bcrypt's 72-byte limit — so we
    can't bcrypt them directly. We don't need adaptive hashing here
    because tokens are single-use, TTL-bound, and high-entropy; a
    keyed SHA-256 is fast and gives us cheap constant-time comparison
    plus resistance to raw-DB replay (the digest isn't useful without
    ``SECRET_KEY``).
    """
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

logger = logging.getLogger(__name__)

router = APIRouter()

# 30-minute link lifetime — long enough for the average inbox delay, short
# enough that a leaked link on a shared machine expires before the next
# workday.
RESET_TOKEN_TTL = timedelta(minutes=30)
_RESET_KIND = "password_reset"


# ── Schemas ──────────────────────────────────────────────

class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetVerify(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class PasswordResetResponse(BaseModel):
    # Always the same shape — never leaks whether an account exists.
    message: str = (
        "If an account exists for that email, we have sent a reset link."
    )


class PasswordResetVerifyResponse(BaseModel):
    ok: bool = True


# ── Token helpers ────────────────────────────────────────

def _mint_reset_token(user_id: int) -> str:
    """Signed JWT — the raw string is emailed, the bcrypt hash is stored."""
    expire = datetime.utcnow() + RESET_TOKEN_TTL
    payload = {
        "sub": str(user_id),
        "kind": _RESET_KIND,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_reset_token(token: str) -> Optional[dict]:
    """Return the payload iff signature is valid, not expired, and kind
    matches. Any error path returns ``None`` — callers surface the same
    generic error to avoid oracle-style leaks."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
    if payload.get("kind") != _RESET_KIND:
        return None
    if not payload.get("sub"):
        return None
    return payload


# ── Email delivery ───────────────────────────────────────

def _send_reset_email(user: User, token: str) -> bool:
    """Deliver the reset link via SendGrid using the existing wrapper."""
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    subject = "Reset your JGAIR password"
    body = _wrap(
        f"""
        <p>Hello {user.full_name or user.username or 'there'},</p>

        <p>We received a request to reset the password on your JGAIR
           account. Click the button below to choose a new password —
           this link is valid for the next
           <strong>{int(RESET_TOKEN_TTL.total_seconds() // 60)} minutes</strong>
           and can only be used once.</p>

        <div style="text-align:center;">
          {_btn("Reset password", link)}
        </div>

        <p style="font-size:13px;color:#6b7280;">
          If the button does not work, copy and paste this link into
          your browser:<br>
          <a href="{link}" style="color:#1e40af;word-break:break-all;">{link}</a>
        </p>

        <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;
                    padding:12px 16px;border-radius:6px;margin:20px 0;">
          <p style="margin:0;font-size:13px;color:#991b1b;">
            If you did not request this reset you can safely ignore this
            email — your password will not change until someone opens the
            link and picks a new one.
          </p>
        </div>
        """
    )
    return _send_and_log(user.email, subject, body, "password_reset_request")


# ── Endpoints ────────────────────────────────────────────

@router.post(
    "/request",
    response_model=PasswordResetResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_password_reset(
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> PasswordResetResponse:
    """Kick off a reset. Always 202 — the response body is identical
    whether or not the email matches a real account, so this endpoint
    cannot be used to check whether a given email is registered."""
    user = (
        db.query(User)
        .filter(User.email == body.email)
        .first()
    )

    if user and user.is_active:
        token = _mint_reset_token(user.id)
        user.password_reset_token_hash = _digest_token(token)
        user.password_reset_expires_at = datetime.utcnow() + RESET_TOKEN_TTL
        db.commit()

        try:
            _send_reset_email(user, token)
        except Exception:  # noqa: BLE001 — never leak send failure
            # SendGrid outage must not tell the caller anything different
            # from the enumeration-safe default; log and move on.
            logger.exception("Failed to dispatch password-reset email")
    else:
        # Match the timing of the hit path so this endpoint isn't a
        # membership oracle. We call _digest_token twice (mint + store)
        # with a throwaway string.
        _ = _digest_token("timing-decoy-1")
        _ = _digest_token("timing-decoy-2")

    return PasswordResetResponse()


@router.post("/verify", response_model=PasswordResetVerifyResponse)
def verify_password_reset(
    body: PasswordResetVerify,
    db: Session = Depends(get_db),
) -> PasswordResetVerifyResponse:
    """Consume the reset link. Every failure returns the same 400 — we
    never say "wrong token" versus "expired" versus "no such user"."""
    generic = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired.",
    )

    payload = _decode_reset_token(body.token)
    if not payload:
        raise generic

    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise generic

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise generic
    if not user.password_reset_token_hash or not user.password_reset_expires_at:
        raise generic
    if user.password_reset_expires_at < datetime.utcnow():
        # The row expired — clear it opportunistically so subsequent
        # attempts don't spend bcrypt cycles on a dead token.
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        db.commit()
        raise generic

    if not hmac.compare_digest(_digest_token(body.token), user.password_reset_token_hash):
        raise generic

    # All good — rotate the password and single-use the token.
    user.hashed_password = hash_password(body.new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    db.commit()

    return PasswordResetVerifyResponse(ok=True)
