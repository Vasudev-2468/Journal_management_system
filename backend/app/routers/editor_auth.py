"""
Editor Auth Router — password-based login for the Editor Portal.

Flow:
  1. POST /editor-auth/login  → Login (email + password) → returns full JWT
  2. GET  /editor-auth/me     → Get current editor user (requires valid JWT)
"""

import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.services.auth_service import authenticate_user, create_access_token
from app.services.editor_auth import require_editor_mfa, EDITOR_ROLES

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────

class EditorLoginRequest(BaseModel):
    email: EmailStr
    password: str


class EditorUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: str
    mfa_verified: bool = False

    class Config:
        orm_mode = True


# ── Login (password only → full token) ───────────────────

@router.post("/login")
def editor_login(body: EditorLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate with email + password.
    Returns a full session token for the Editor Portal.
    """
    user = authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    if user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="This login is for editors only")

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


# ── Get current editor ──────────────────────────────────

@router.get("/me", response_model=EditorUserResponse)
def get_editor_profile(user: User = Depends(require_editor_mfa)):
    """Get current editor profile. Requires valid token."""
    return EditorUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        mfa_verified=True,
    )
