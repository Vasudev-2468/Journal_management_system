"""
Editor Auth Router — two-step editor login with OTP.

Flow:
  1. POST /editor-auth/login      → email + password → server sends OTP;
                                    returns a short-lived pre-auth token
  2. POST /editor-auth/verify-otp → OTP + pre-auth token → returns the full
                                    session token with mfa_verified=true
  3. POST /editor-auth/resend-otp → pre-auth token → resends the OTP
  4. GET  /editor-auth/me         → current editor profile (full session token)

The prior implementation issued a fully-MFA-verified token from step 1
unconditionally — every existing OTP service call was dead code and the
require_editor_mfa dependency was trivially satisfied. This restores real MFA.
"""

import logging
from datetime import timedelta
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
