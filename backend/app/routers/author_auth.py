"""
Author Auth Router — two-step (email) or three-step (email + WhatsApp) MFA.

Flow:
  1. POST /author-auth/login       → email + password → server sends an
                                     email OTP, returns a short-lived
                                     pre-auth token (10 min).
  2. POST /author-auth/verify-otp  → OTP + pre-auth token →
                                     - if the user has NO WhatsApp on file,
                                       mints the full session token.
                                     - if the user has a WhatsApp number,
                                       fires the WhatsApp OTP and returns
                                       `stage="whatsapp_needed"` with the
                                       same pre-auth token.
  3. POST /author-auth/verify-otp  → WhatsApp OTP + pre-auth token →
                                     mints the full session token.
  4. POST /author-auth/resend-otp  → resend the current-stage OTP.
  5. GET  /author-auth/me          → current profile (full session required).
  6. PATCH /author-auth/profile    → update details (full session required).
  7. POST /author-auth/profile/picture → upload avatar (full session required).

The prior implementation minted an `author_mfa="fully_verified"` token
directly on password login and left every OTP endpoint unreachable — MFA
was disabled in practice. This restores the promise of two-factor auth.

Any request that carries the pre-auth token to a full-session endpoint is
rejected with 403 + `X-Author-MFA-Required: true` so the frontend can
redirect back to the login page.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import AuthorProfileUpdate
from app.services.auth_service import authenticate_user, create_access_token
from app.services.otp_service import create_and_send_otp, verify_otp
from app.services import totp_service

logger = logging.getLogger(__name__)

router = APIRouter()

MFA_SESSION_HOURS = 24               # Full session token lifetime.
PRE_AUTH_TOKEN_LIFETIME = timedelta(minutes=10)
_PRE_AUTH_SCOPE = "author_pre_auth"  # Bounded scope for step-1/2 tokens.
_SESSION_SCOPE = "session"           # Full session token scope.


# ── Schemas ──────────────────────────────────────────────

class AuthorLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthorLoginResponse(BaseModel):
    mfa_required: bool = True
    pre_auth_token: str
    stage: str = "email"           # Which OTP the user must enter next.
    channel: str = "email"
    masked_destination: str
    expires_in_seconds: int
    has_whatsapp: bool
    # Only populated when EDITOR_DEV_MODE (rename pending) is on AND the
    # channel provider is not configured. Never in production.
    dev_otp: Optional[str] = None


class VerifyOTPRequest(BaseModel):
    otp: str


class VerifyOtpResponse(BaseModel):
    """Union-shaped step response. `stage` tells the frontend what to render
    next:
      - "totp_enrolment_needed" — first-time TOTP setup (payload has qr_svg,
        secret, otpauth_uri).
      - "totp_needed" — user is enrolled; ask for the current 6-digit code.
      - "whatsapp_needed" — WhatsApp OTP dispatched, ask for it.
      - "complete" — access_token issued.
    """
    stage: str
    email_verified: bool = False
    whatsapp_verified: bool = False
    totp_verified: bool = False
    # Populated on completion.
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    # Populated for whatsapp_needed.
    channel: Optional[str] = None
    masked_destination: Optional[str] = None
    expires_in_seconds: Optional[int] = None
    dev_otp: Optional[str] = None
    # Populated for totp_enrolment_needed.
    totp_secret: Optional[str] = None           # base32 — the user's device stores this
    totp_otpauth_uri: Optional[str] = None      # full otpauth:// URI
    totp_qr_data_uri: Optional[str] = None      # inline SVG as data URI


class TotpCodeRequest(BaseModel):
    code: str


class AuthorUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: str
    whatsapp_number: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    orcid: Optional[str] = None
    research_areas: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None
    mfa_email_verified: bool = False
    mfa_whatsapp_verified: bool = False

    model_config = ConfigDict(from_attributes=True)


# ── Token helpers ────────────────────────────────────────

def _mint_pre_auth_token(email: str, totp_ok: bool = False) -> str:
    # totp_ok is set once the user verifies TOTP within this login run.
    # Because JWTs are stateless and TOTP codes rotate every 30 s, we track
    # "cleared TOTP this session" on the pre-auth JWT itself rather than
    # persisting it. The token TTL (10 min) upper-bounds the risk.
    data = {"sub": email, "scope": _PRE_AUTH_SCOPE, "role": "author"}
    if totp_ok:
        data["totp_ok"] = True
    return create_access_token(data=data, expires_delta=PRE_AUTH_TOKEN_LIFETIME)


def _mint_session_token(user: User) -> str:
    return create_access_token(
        data={
            "sub": user.email,
            "scope": _SESSION_SCOPE,
            "role": user.role.value if user.role else "author",
            "author_mfa": "fully_verified",
        },
        expires_delta=timedelta(hours=MFA_SESSION_HOURS),
    )


def _decode(authorization: Optional[str]) -> dict:
    """Extract the Bearer token from the Authorization header and decode."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def _load_author(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    return user


def _require_pre_auth_or_session(
    authorization: Optional[str], db: Session
) -> tuple[User, dict]:
    """Accept either the pre-auth or the full session token — used by OTP
    endpoints, which the user visits DURING login."""
    payload = _decode(authorization)
    scope = payload.get("scope")
    if scope not in (_PRE_AUTH_SCOPE, _SESSION_SCOPE):
        raise HTTPException(status_code=401, detail="Wrong token scope")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    return _load_author(db, email), payload


def _require_full_session(
    authorization: Optional[str], db: Session
) -> User:
    """Reject pre-auth tokens. Every profile / picture / me route uses this."""
    payload = _decode(authorization)
    scope = payload.get("scope")
    if scope != _SESSION_SCOPE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-step verification required.",
            headers={"X-Author-MFA-Required": "true"},
        )
    if payload.get("author_mfa") != "fully_verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-step verification required.",
            headers={"X-Author-MFA-Required": "true"},
        )
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    return _load_author(db, email)


def _reset_mfa_state(user: User) -> None:
    """Wipe stale per-channel verification stamps at the start of a fresh
    login so a user who verified email hours ago still has to re-verify.
    We intentionally DO NOT clear totp_enrolled_at — the enrolment survives
    across sessions."""
    user.mfa_email_verified_at = None
    user.mfa_whatsapp_verified_at = None


def _dev_otp_of(result: dict) -> Optional[str]:
    """Only expose dev OTPs when the operator explicitly opted in."""
    return result.get("dev_otp") if settings.EDITOR_DEV_MODE else None


# ── 1. Login → send email OTP, return pre-auth token ─────

@router.post("/login", response_model=AuthorLoginResponse)
def author_login(body: AuthorLoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Start from a clean slate — force a fresh email OTP verification even
    # if this user completed one yesterday.
    _reset_mfa_state(user)
    db.commit()

    result = create_and_send_otp(db, user, channel="email")
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error") or "Could not send verification code",
        )

    return AuthorLoginResponse(
        pre_auth_token=_mint_pre_auth_token(user.email),
        stage="email",
        channel=result.get("channel", "email"),
        masked_destination=result.get("masked_destination", ""),
        expires_in_seconds=result.get("expires_in_seconds", 300),
        has_whatsapp=bool(user.whatsapp_number),
        dev_otp=_dev_otp_of(result),
    )


# ── 2. Verify OTP → progress to WhatsApp or mint session ─

@router.post("/verify-otp", response_model=VerifyOtpResponse)
def author_verify_otp(
    body: VerifyOTPRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    user, payload = _require_pre_auth_or_session(authorization, db)
    totp_ok = bool(payload.get("totp_ok"))

    # Determine which OTP the user is submitting right now based on the
    # stages already cleared.
    if user.mfa_email_verified_at is None:
        channel = "email"
    elif not totp_ok:
        # TOTP hasn't cleared yet — reject and return the next-stage hint.
        raise HTTPException(
            status_code=409,
            detail="Authenticator code required. Call /author-auth/verify-totp.",
        )
    elif bool(user.whatsapp_number) and user.mfa_whatsapp_verified_at is None:
        channel = "whatsapp"
    else:
        return _finish_mfa(user, db, totp_ok=totp_ok)

    result = verify_otp(db, user, body.otp)
    if not result.get("success"):
        status_code = 423 if result.get("locked") else 400
        raise HTTPException(status_code=status_code, detail=result.get("error") or "OTP verification failed")

    now = datetime.utcnow()
    if channel == "email":
        user.mfa_email_verified_at = now
    else:
        user.mfa_whatsapp_verified_at = now
    db.commit()

    # Next stage — after email OTP, TOTP is required (enrolment or verify).
    if channel == "email":
        if not totp_service.is_enrolled(user):
            secret = totp_service.start_enrolment(db, user)
            uri = totp_service.provisioning_uri(secret, user.email)
            return VerifyOtpResponse(
                stage="totp_enrolment_needed",
                email_verified=True,
                totp_secret=secret,
                totp_otpauth_uri=uri,
                totp_qr_data_uri=totp_service.qr_code_data_uri(uri),
            )
        return VerifyOtpResponse(
            stage="totp_needed",
            email_verified=True,
        )

    # channel == "whatsapp" — check whether the user is fully done.
    return _finish_mfa(user, db, totp_ok=totp_ok)


@router.post("/verify-totp", response_model=VerifyOtpResponse)
def author_verify_totp(
    body: TotpCodeRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """Verify a TOTP code, either as first-time enrolment confirmation or
    as an already-enrolled user's login-time proof. Returns a NEW pre-auth
    token with `totp_ok=true` embedded, plus the next-stage hint."""
    user, payload = _require_pre_auth_or_session(authorization, db)

    # TOTP must be gated behind email verification (users can't skip it).
    if user.mfa_email_verified_at is None:
        raise HTTPException(
            status_code=409,
            detail="Email verification required before authenticator code.",
        )

    if totp_service.is_enrolled(user):
        ok = totp_service.verify(db, user, body.code)
    else:
        # First-time enrolment confirmation. `start_enrolment` must have run
        # (during the /verify-otp email step) — else there's no secret to
        # verify against and we bounce back to that stage.
        if not user.totp_secret:
            raise HTTPException(
                status_code=409,
                detail="TOTP enrolment has not been started. Complete email verification first.",
            )
        ok = totp_service.confirm_enrolment(db, user, body.code)

    if not ok:
        raise HTTPException(
            status_code=400,
            detail="Invalid authenticator code. Check your device clock and try again.",
        )

    # Mint a new pre-auth token that carries totp_ok=true so the caller can
    # progress to WhatsApp (if enrolled) or finish.
    new_token = _mint_pre_auth_token(user.email, totp_ok=True)

    if bool(user.whatsapp_number) and user.mfa_whatsapp_verified_at is None:
        wa = create_and_send_otp(db, user, channel="whatsapp")
        if not wa.get("success"):
            raise HTTPException(
                status_code=500,
                detail=wa.get("error") or "Could not send WhatsApp verification code",
            )
        return VerifyOtpResponse(
            stage="whatsapp_needed",
            email_verified=True,
            totp_verified=True,
            access_token=new_token,           # New pre-auth carrying totp_ok=true.
            token_type="pre_auth",
            channel=wa.get("channel", "whatsapp"),
            masked_destination=wa.get("masked_destination", ""),
            expires_in_seconds=wa.get("expires_in_seconds", 300),
            dev_otp=_dev_otp_of(wa),
        )

    return _finish_mfa(user, db, totp_ok=True)


def _finish_mfa(user: User, db: Session, *, totp_ok: bool) -> VerifyOtpResponse:
    """Mint the full session token. `totp_ok` must be True — the caller
    already gated on this."""
    if not totp_ok:
        # Defence-in-depth: never mint a session unless TOTP was verified
        # this login run.
        raise HTTPException(
            status_code=409,
            detail="Authenticator verification required.",
        )
    user.mfa_last_verified_at = datetime.utcnow()
    db.commit()
    return VerifyOtpResponse(
        stage="complete",
        email_verified=True,
        totp_verified=True,
        whatsapp_verified=user.mfa_whatsapp_verified_at is not None,
        access_token=_mint_session_token(user),
        token_type="bearer",
    )


# ── 3. Resend current OTP ────────────────────────────────

@router.post("/resend-otp")
def author_resend_otp(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    user, _payload = _require_pre_auth_or_session(authorization, db)

    if user.mfa_email_verified_at is None:
        channel = "email"
    elif bool(user.whatsapp_number) and user.mfa_whatsapp_verified_at is None:
        channel = "whatsapp"
    else:
        raise HTTPException(status_code=400, detail="Nothing to verify — MFA already complete.")

    result = create_and_send_otp(db, user, channel=channel)
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error") or "Could not send verification code",
        )
    return {
        "channel": result.get("channel", channel),
        "masked_destination": result.get("masked_destination", ""),
        "expires_in_seconds": result.get("expires_in_seconds", 300),
        "dev_otp": _dev_otp_of(result),
    }


# ── 4. Get current author (full session only) ────────────

@router.get("/me", response_model=AuthorUserResponse)
def get_author_profile(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    user = _require_full_session(authorization, db)
    return AuthorUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value if user.role else "author",
        whatsapp_number=user.whatsapp_number,
        institution=user.institution,
        department=user.department,
        orcid=user.orcid,
        research_areas=user.research_areas,
        country=user.country,
        bio=user.bio,
        profile_picture_url=user.profile_picture_url,
        mfa_email_verified=user.mfa_email_verified_at is not None,
        mfa_whatsapp_verified=user.mfa_whatsapp_verified_at is not None,
    )


# ── 5. Update author profile (full session only) ─────────

@router.patch("/profile")
def update_author_profile(
    body: AuthorProfileUpdate,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    user = _require_full_session(authorization, db)

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
        if user.first_name and user.last_name:
            user.full_name = f"{user.first_name} {user.last_name}"
    if body.institution is not None:
        user.institution = body.institution
    if body.department is not None:
        user.department = body.department
    if body.orcid is not None:
        user.orcid = body.orcid
    if body.research_areas is not None:
        user.research_areas = body.research_areas
    if body.whatsapp_number is not None:
        # Changing the WhatsApp number invalidates the previous verification —
        # the next login pass must re-verify it.
        user.whatsapp_number = body.whatsapp_number
        user.mfa_whatsapp_verified_at = None
    if body.country is not None:
        user.country = body.country
    if body.bio is not None:
        user.bio = body.bio

    db.commit()
    db.refresh(user)
    return {"message": "Profile updated successfully", "user": AuthorUserResponse(
        id=user.id, username=user.username, email=user.email,
        full_name=user.full_name, first_name=user.first_name, last_name=user.last_name,
        role=user.role.value if user.role else "author",
        whatsapp_number=user.whatsapp_number, institution=user.institution,
        department=user.department, orcid=user.orcid, research_areas=user.research_areas,
        country=user.country, bio=user.bio, profile_picture_url=user.profile_picture_url,
        mfa_email_verified=user.mfa_email_verified_at is not None,
        mfa_whatsapp_verified=user.mfa_whatsapp_verified_at is not None,
    )}


# ── 6. Upload profile picture (full session only) ────────

@router.post("/profile/picture")
async def upload_profile_picture(
    picture: UploadFile = File(...),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    from app.services.storage_service import upload_bytes

    ALLOWED = {"image/jpeg", "image/png", "image/webp"}
    if picture.content_type not in ALLOWED:
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, or WebP images are accepted.")

    content = await picture.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds 5 MB limit.")

    user = _require_full_session(authorization, db)
    ext = picture.filename.rsplit(".", 1)[-1].lower() if "." in (picture.filename or "") else "jpg"
    key = f"authors/{user.id}/profile.{ext}"
    url = upload_bytes(content, key, content_type=picture.content_type)

    user.profile_picture_url = url
    db.commit()
    return {"message": "Profile picture updated.", "url": url}
