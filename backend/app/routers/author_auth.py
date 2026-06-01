"""
Author Auth Router — Two-step authentication (Email OTP + WhatsApp OTP).

Flow:
  1. POST /author-auth/login        → Credentials → temp JWT (no MFA)
  2. POST /author-auth/send-otp     → Send OTP to email or whatsapp
  3. POST /author-auth/verify-otp   → Verify OTP for a specific channel
     - After email OTP verified → must do whatsapp OTP
     - After both verified → issues full author_mfa_verified JWT
  4. GET  /author-auth/me           → Current author profile
  5. PATCH /author-auth/profile     → Update author profile details
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.services.auth_service import authenticate_user, create_access_token
from app.services.otp_service import create_and_send_otp, verify_otp
from app.schemas.user import AuthorProfileUpdate
from app.config import settings
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

router = APIRouter()

MFA_SESSION_HOURS = 24  # How long the fully-verified token lasts


# ── Schemas ──────────────────────────────────────────────

class AuthorLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SendOTPRequest(BaseModel):
    channel: str  # "email" or "whatsapp"


class VerifyOTPRequest(BaseModel):
    otp: str
    channel: str  # "email" or "whatsapp"


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

    class Config:
        orm_mode = True


# ── Helpers ──────────────────────────────────────────────

def _get_author_from_token(
    token: str,
    db: Session,
    require_full_mfa: bool = False,
) -> User:
    """Decode JWT and return the author user. Optionally require full MFA."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if require_full_mfa:
        mfa_status = payload.get("author_mfa", "")
        if mfa_status != "fully_verified":
            raise HTTPException(
                status_code=403,
                detail="Two-step verification required. Please verify both email and WhatsApp.",
                headers={"X-Author-MFA-Required": "true"},
            )

    return user


def _extract_token(authorization: str) -> str:
    """Extract Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")
    return authorization[7:]


# ── 1. Login (credentials only → temp token) ────────────

@router.post("/login")
def author_login(body: AuthorLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email + password.
    MFA (email/WhatsApp OTP) is temporarily disabled — issues fully-verified token directly.
    """
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # MFA disabled: issue fully-verified token immediately
    token = create_access_token(
        data={
            "sub": user.email,
            "role": user.role.value,
            "author_mfa": "fully_verified",
        },
        expires_delta=timedelta(hours=MFA_SESSION_HOURS),
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "mfa_required": False,
        "user": {
            "email": user.email,
            "full_name": user.full_name,
            "has_whatsapp": bool(user.whatsapp_number),
        },
    }


# ── 2. Send OTP ─────────────────────────────────────────

@router.post("/send-otp")
def author_send_otp(
    body: SendOTPRequest,
    authorization: str = Depends(lambda request: request.headers.get("Authorization")),
    db: Session = Depends(get_db),
):
    """
    Send OTP to the specified channel (email or whatsapp).
    Requires the temp token from step 1.
    """
    token = _extract_token(authorization)
    user = _get_author_from_token(token, db)

    if body.channel not in ("email", "whatsapp"):
        raise HTTPException(status_code=400, detail="Channel must be 'email' or 'whatsapp'")

    if body.channel == "whatsapp" and not user.whatsapp_number:
        raise HTTPException(
            status_code=400,
            detail="No WhatsApp number on file. Please update your profile first.",
        )

    # Check if email must be verified first
    if body.channel == "whatsapp" and not user.mfa_email_verified_at:
        raise HTTPException(
            status_code=400,
            detail="Please verify your email first before WhatsApp verification.",
        )

    result = create_and_send_otp(db, user, channel=body.channel)

    if not result["success"]:
        raise HTTPException(status_code=429, detail=result.get("error", "Failed to send OTP"))

    return {
        "message": f"Verification code sent via {body.channel}",
        "channel": result.get("channel"),
        "expires_in_seconds": result.get("expires_in_seconds"),
        "masked_destination": result.get("masked_destination"),
        "dev_otp": result.get("dev_otp"),  # Only present in dev mode
    }


# ── 3. Verify OTP ───────────────────────────────────────

@router.post("/verify-otp")
def author_verify_otp(
    body: VerifyOTPRequest,
    authorization: str = Depends(lambda request: request.headers.get("Authorization")),
    db: Session = Depends(get_db),
):
    """
    Verify the OTP for a specific channel.
    After both email and whatsapp are verified, issues a fully-verified JWT.
    """
    token = _extract_token(authorization)
    user = _get_author_from_token(token, db)

    if body.channel not in ("email", "whatsapp"):
        raise HTTPException(status_code=400, detail="Channel must be 'email' or 'whatsapp'")

    # Must verify email before whatsapp
    if body.channel == "whatsapp" and not user.mfa_email_verified_at:
        raise HTTPException(
            status_code=400,
            detail="Please verify your email first.",
        )

    result = verify_otp(db, user, body.otp)

    if not result["success"]:
        status_code = 423 if result.get("locked") else 400
        raise HTTPException(status_code=status_code, detail=result["error"])

    # Mark channel as verified
    now = datetime.utcnow()
    if body.channel == "email":
        user.mfa_email_verified_at = now
    elif body.channel == "whatsapp":
        user.mfa_whatsapp_verified_at = now
    db.commit()

    # Check if both channels are now verified
    email_done = user.mfa_email_verified_at is not None
    whatsapp_done = user.mfa_whatsapp_verified_at is not None
    fully_verified = email_done and whatsapp_done

    response = {
        "success": True,
        "channel_verified": body.channel,
        "email_verified": email_done,
        "whatsapp_verified": whatsapp_done,
        "fully_verified": fully_verified,
    }

    if fully_verified:
        # Issue the fully-verified token
        user.mfa_last_verified_at = now
        db.commit()

        full_token = create_access_token(
            data={
                "sub": user.email,
                "role": user.role.value,
                "author_mfa": "fully_verified",
            },
            expires_delta=timedelta(hours=MFA_SESSION_HOURS),
        )
        response["access_token"] = full_token
        response["token_type"] = "bearer"
        response["message"] = "Two-step verification complete. You can now submit papers."
    else:
        steps_remaining = []
        if not email_done:
            steps_remaining.append("email")
        if not whatsapp_done:
            steps_remaining.append("whatsapp")
        response["steps_remaining"] = steps_remaining
        response["message"] = f"{body.channel.title()} verified. Please verify {steps_remaining[0]} next."

    return response


# ── 4. Get current author ────────────────────────────────

@router.get("/me", response_model=AuthorUserResponse)
def get_author_profile(
    authorization: str = Depends(lambda request: request.headers.get("Authorization")),
    db: Session = Depends(get_db),
):
    """Get current author profile."""
    token = _extract_token(authorization)
    user = _get_author_from_token(token, db)

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


# ── 5. Update author profile ────────────────────────────

@router.patch("/profile")
def update_author_profile(
    body: AuthorProfileUpdate,
    authorization: str = Depends(lambda request: request.headers.get("Authorization")),
    db: Session = Depends(get_db),
):
    """Update author profile details (name, institution, ORCID, etc.)."""
    token = _extract_token(authorization)
    user = _get_author_from_token(token, db)

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
        # Auto-update full_name from first+last when both are provided
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


# ── 6. Upload profile picture ────────────────────────────

@router.post("/profile/picture")
async def upload_profile_picture(
    picture: UploadFile = File(...),
    authorization: str = Depends(lambda request: request.headers.get("Authorization")),
    db: Session = Depends(get_db),
):
    """Upload a profile picture. Saves to S3 (or local fallback)."""
    from app.services.storage_service import upload_bytes

    ALLOWED = {"image/jpeg", "image/png", "image/webp"}
    if picture.content_type not in ALLOWED:
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, or WebP images are accepted.")

    content = await picture.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds 5 MB limit.")

    token = _extract_token(authorization)
    user = _get_author_from_token(token, db)

    ext = picture.filename.rsplit(".", 1)[-1].lower() if "." in (picture.filename or "") else "jpg"
    key = f"authors/{user.id}/profile.{ext}"
    url = upload_bytes(content, key, content_type=picture.content_type)

    user.profile_picture_url = url
    db.commit()

    return {"message": "Profile picture updated.", "url": url}
