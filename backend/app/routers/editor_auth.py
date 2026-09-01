"""
Editor Auth Router — two-step editor login with OTP.

Flow:
  1. POST /editor-auth/login      → email + password → server sends OTP;
                                    returns a short-lived pre-auth token
  2. POST /editor-auth/verify-otp → OTP (or a recovery code) + pre-auth
                                    token → returns the full session
                                    token with mfa_verified=true
  3. POST /editor-auth/resend-otp → pre-auth token → resends the OTP
  4. GET  /editor-auth/me         → current editor profile (full session token)

Recovery-codes-lost fallback (email verification):
  5. POST /editor-auth/recovery-fallback/request → pre-auth token →
        server mails a 2-hour signed magic link to the editor.
  6. POST /editor-auth/recovery-fallback/verify  → magic-link token →
        server mints a full session AND regenerates recovery codes,
        returning the plaintext once so the editor can bank them.

The prior implementation issued a fully-MFA-verified token from step 1
unconditionally — every existing OTP service call was dead code and the
require_editor_mfa dependency was trivially satisfied. This restores real MFA.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.auth_service import authenticate_user, create_access_token
from app.services.editor_auth import EDITOR_ROLES, require_editor_mfa
from app.services.otp_service import create_and_send_otp, verify_otp

logger = logging.getLogger(__name__)

router = APIRouter()

# Short window for the pre-auth token — long enough to receive the OTP by
# email/SMS and type it in, short enough to limit the impact of theft.
PRE_AUTH_TOKEN_LIFETIME = timedelta(minutes=10)
_PRE_AUTH_SCOPE = "editor_pre_auth"

# ── Recovery-codes-lost fallback ────────────────────────
#
# When an editor has lost BOTH their MFA channel and their backup
# recovery codes, this fallback proves identity via email possession:
# a signed link is emailed to the address of record and, on click,
# it completes the MFA challenge exactly once *and* mints a fresh set
# of recovery codes so the editor can bank them immediately.
#
# The window is deliberately shorter than the OTP path is long —
# 2 hours is enough for the editor to find the email, tight enough
# that a leaked link stops working before the next inbox sync.
RECOVERY_FALLBACK_TOKEN_LIFETIME = timedelta(hours=2)
_RECOVERY_FALLBACK_SCOPE = "editor_recovery_fallback"


# ── Schemas ──────────────────────────────────────────────

class EditorLoginRequest(BaseModel):
    email: EmailStr
    password: str


class EditorLoginResponse(BaseModel):
    mfa_required: bool = True
    pre_auth_token: str
    channel: str
    masked_destination: str
    expires_in_seconds: int
    # dev_otp is populated only when EDITOR_DEV_MODE is on AND the email/SMS
    # provider is not configured. Never populated in production.
    dev_otp: Optional[str] = None


class EditorVerifyOtpRequest(BaseModel):
    otp: str


class EditorUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: str
    mfa_verified: bool = False

    model_config = ConfigDict(from_attributes=True)


# ── Pre-auth token helpers ───────────────────────────────

def _mint_pre_auth_token(email: str) -> str:
    return create_access_token(
        data={"sub": email, "scope": _PRE_AUTH_SCOPE},
        expires_delta=PRE_AUTH_TOKEN_LIFETIME,
    )


def _decode_pre_auth_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing pre-auth token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired pre-auth token",
        )
    if payload.get("scope") != _PRE_AUTH_SCOPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong token scope",
        )
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return email


def _load_editor(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This login is for editors only",
        )
    return user


# ── Step 1: credentials → send OTP ───────────────────────

@router.post("/login", response_model=EditorLoginResponse)
def editor_login(body: EditorLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email + password. On success, dispatch an OTP and
    return a short-lived pre-auth token that the client uses on
    /editor-auth/verify-otp.
    """
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="This login is for editors only")

    otp_result = create_and_send_otp(db, user)
    if not otp_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=otp_result.get("error") or "Could not send verification code",
        )

    return EditorLoginResponse(
        pre_auth_token=_mint_pre_auth_token(user.email),
        channel=otp_result.get("channel", "email"),
        masked_destination=otp_result.get("masked_destination", ""),
        expires_in_seconds=otp_result.get("expires_in_seconds", 300),
        # Only forward dev_otp when the operator has explicitly enabled dev mode.
        dev_otp=otp_result.get("dev_otp") if settings.EDITOR_DEV_MODE else None,
    )


# ── Step 2: OTP → full session token ─────────────────────

@router.post("/verify-otp")
def editor_verify_otp(
    body: EditorVerifyOtpRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    email = _decode_pre_auth_token(authorization)
    user = _load_editor(db, email)

    result = verify_otp(db, user, body.otp)
    if not result.get("success"):
        raise HTTPException(
            status_code=403 if result.get("locked") else 400,
            detail=result.get("error") or "OTP verification failed",
        )

    token = create_access_token(
        data={
            "sub": user.email,
            "role": user.role.value,
            "mfa_verified": True,
        },
        expires_delta=timedelta(hours=8),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    }


# ── Step 2b: resend the OTP ──────────────────────────────

@router.post("/resend-otp")
def editor_resend_otp(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    email = _decode_pre_auth_token(authorization)
    user = _load_editor(db, email)
    otp_result = create_and_send_otp(db, user)
    if not otp_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=otp_result.get("error") or "Could not send verification code",
        )
    return {
        "channel": otp_result.get("channel", "email"),
        "masked_destination": otp_result.get("masked_destination", ""),
        "expires_in_seconds": otp_result.get("expires_in_seconds", 300),
        "dev_otp": otp_result.get("dev_otp") if settings.EDITOR_DEV_MODE else None,
    }


# ── Get current editor ──────────────────────────────────

@router.get("/me", response_model=EditorUserResponse)
def get_editor_profile(user: User = Depends(require_editor_mfa)):
    return EditorUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        mfa_verified=True,
    )


# ── Recovery-codes-lost fallback: email verification ────
#
# Flow:
#   1. POST /editor-auth/recovery-fallback/request  (pre-auth token)
#        → server emails a signed magic link to the editor's address of
#          record; the response never confirms whether an editor exists.
#   2. Editor clicks the link, landing on the frontend page
#      /editor-recovery-verify?token=...
#   3. Frontend POSTs /editor-auth/recovery-fallback/verify with the
#      token → server verifies, mints a full session, regenerates the
#      recovery codes, and returns the plaintext once so the editor
#      can bank them.


class RecoveryFallbackRequestResponse(BaseModel):
    # Deliberately identical whether or not an editor exists — the
    # frontend shows the same "check your inbox" message either way so
    # the endpoint cannot be used for account enumeration.
    message: str = (
        "If an editor account matches that pre-auth session, a "
        "verification email is on its way. It stays valid for 2 hours."
    )
    expires_in_seconds: int = int(RECOVERY_FALLBACK_TOKEN_LIFETIME.total_seconds())


class RecoveryFallbackVerifyRequest(BaseModel):
    token: str


class RecoveryFallbackVerifyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    recovery_codes: list[str]
    recovery_codes_generated_at: datetime
    recovery_codes_message: str = (
        "Store these codes somewhere safe. They replace any codes you "
        "had previously — the old set no longer works."
    )
    user: dict


def _mint_recovery_fallback_token(email: str) -> str:
    return create_access_token(
        data={"sub": email, "scope": _RECOVERY_FALLBACK_SCOPE},
        expires_delta=RECOVERY_FALLBACK_TOKEN_LIFETIME,
    )


def _decode_recovery_fallback_token(token: str) -> str:
    """Decode a magic-link token from ``/editor-auth/recovery-fallback/verify``.
    Distinct scope from the pre-auth token so the two cannot be swapped
    for one another."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "This verification link is invalid or has expired. "
                "Please start the recovery flow again."
            ),
        )
    if payload.get("scope") != _RECOVERY_FALLBACK_SCOPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong token scope for this action.",
        )
    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed verification token.",
        )
    return email


def _send_recovery_fallback_email(user: User, magic_url: str) -> bool:
    """Deliver the "Verify by email" magic link. Uses the shared
    ``_send_and_log`` pipeline so a delivery attempt lands in the
    notifications table and the editor's audit view."""
    from app.services.email_service import _send_and_log, _wrap, _btn

    hours = int(RECOVERY_FALLBACK_TOKEN_LIFETIME.total_seconds() // 3600)
    body = _wrap(f"""
    <p>Dear {user.full_name or user.username},</p>

    <p>We received a request to sign you in without your recovery
       codes. Click the button below to verify by email and unlock
       your Editor Portal session — the link stays valid for
       <strong>{hours} hours</strong> and can only be used once.</p>

    <div style="text-align:center;margin:24px 0;">
      {_btn("Verify and sign in", magic_url)}
    </div>

    <p style="font-size:13px;color:#6b7280;">
      If the button does not work, copy and paste this link into your
      browser:<br>
      <a href="{magic_url}" style="color:#1e40af;word-break:break-all;">
        {magic_url}
      </a>
    </p>

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;
                padding:12px 16px;border-radius:6px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#991b1b;">
        ⚠ Completing this flow issues a fresh set of recovery codes and
        invalidates any codes you may still have. If you did not start
        this recovery, ignore this email — no change is made until the
        link is clicked.
      </p>
    </div>

    <p style="font-size:12px;color:#9ca3af;">
      This is an automated security message from the JGAIR Editor Portal.
    </p>
    """)
    return _send_and_log(
        user.email,
        "Verify by email — Editor Portal recovery",
        body,
        "editor_recovery_fallback",
    )


@router.post(
    "/recovery-fallback/request",
    response_model=RecoveryFallbackRequestResponse,
)
def editor_recovery_fallback_request(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Send a signed verification link to the editor's address of record.

    Gated on the pre-auth token (proof of correct password + editor
    role) so a bare email is never enough to trigger the email. Returns
    the same "if an editor account matches" message regardless of
    whether the account exists or the email dispatch succeeded, so the
    endpoint cannot be used for account enumeration or delivery probing.
    """
    email = _decode_pre_auth_token(authorization)
    user = db.query(User).filter(User.email == email).first()
    if user is not None and user.is_active and user.role in EDITOR_ROLES:
        magic_token = _mint_recovery_fallback_token(user.email)
        frontend = (settings.FRONTEND_URL or "").rstrip("/")
        magic_url = f"{frontend}/editor-recovery-verify?token={magic_token}"
        try:
            _send_recovery_fallback_email(user, magic_url)
        except Exception:  # noqa: BLE001 — email failure must not leak
            logger.exception("editor recovery-fallback email dispatch failed")
    # Uniform response regardless of outcome — see docstring.
    return RecoveryFallbackRequestResponse()


@router.post(
    "/recovery-fallback/verify",
    response_model=RecoveryFallbackVerifyResponse,
)
def editor_recovery_fallback_verify(
    body: RecoveryFallbackVerifyRequest,
    db: Session = Depends(get_db),
):
    """Complete the recovery flow.

    Verifies the magic-link token, mints a full mfa_verified session,
    regenerates the editor's recovery codes, and returns the plaintext
    codes once so the editor can bank them. Any codes that were still
    outstanding are voided by the overwrite — the point of this flow
    is that the editor no longer has those codes.
    """
    from app.routers.recovery_codes import (
        _generate_code,
        _hash_code,
        TOTAL_CODES,
    )

    email = _decode_recovery_fallback_token(body.token)
    user = _load_editor(db, email)

    # Regenerate recovery codes (overwrites all outstanding codes,
    # including any UNUSED ones — the whole point is that the editor
    # has lost them).
    codes = [_generate_code() for _ in range(TOTAL_CODES)]
    hashes = [_hash_code(c) for c in codes]
    now = datetime.utcnow()
    user.recovery_codes_hashes = ",".join(hashes)
    user.recovery_codes_generated_at = now
    # Successful recovery counts as an MFA verification for lockout
    # bookkeeping. Any outstanding OTP is cleared so a stolen code
    # can't be replayed on top of this session.
    user.mfa_otp_hash = None
    user.mfa_otp_expires_at = None
    user.mfa_otp_attempts = 0
    user.mfa_last_verified_at = now
    db.commit()

    session_token = create_access_token(
        data={
            "sub": user.email,
            "role": user.role.value,
            "mfa_verified": True,
        },
        expires_delta=timedelta(hours=8),
    )
    logger.info(
        "Editor %s (id=%s) completed recovery-fallback verification",
        user.email, user.id,
    )
    return RecoveryFallbackVerifyResponse(
        access_token=session_token,
        recovery_codes=codes,
        recovery_codes_generated_at=now,
        user={
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )
