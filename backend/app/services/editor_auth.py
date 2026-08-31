"""
Editor Portal Auth Guard

FastAPI dependencies that enforce:
1. Valid JWT token (existing auth)
2. User role is editor / section_editor / admin
3. MFA was verified within the current session (mfa_verified claim in JWT)

Every editor portal endpoint uses `require_editor_mfa` as a dependency.
"""

import logging
from datetime import datetime

from fastapi import Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.services.auth_service import oauth2_scheme

logger = logging.getLogger(__name__)

# Roles allowed to access the editor portal.
#
# ``super_admin`` and ``managing_editor`` are privileged editorial roles
# introduced alongside the legacy set; they get the same gate as an editor.
# ``production_editor`` is deliberately NOT in this whitelist — production
# staff cannot make editorial decisions. They pass a separate gate that
# ``require_role(UserRole.production_editor, ...)`` wires up on production
# endpoints (see the helper at the bottom of this file).
EDITOR_ROLES = {
    UserRole.editor,
    UserRole.section_editor,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.managing_editor,
}

# MFA session validity — how long since last OTP verification before
# the user must re-verify.  Set to 0 to require OTP on every login session.
MFA_SESSION_MAX_SECONDS = 0  # Always require fresh MFA


def _decode_token(token: str) -> dict:
    """Decode and validate the JWT, returning the payload."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_editor_mfa(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency that enforces:
      1. Valid JWT
      2. Editor-level role
      3. MFA verified (mfa_verified=True in JWT claims)

    Raises 401 for auth failures, 403 for role/MFA failures.
    """
    payload = _decode_token(token)

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token — no subject claim",
        )

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    # Role check
    if user.role not in EDITOR_ROLES:
        logger.warning("Non-editor user %s attempted editor portal access", email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access the Editor Portal",
        )

    # MFA check — the JWT must contain mfa_verified=True
    mfa_verified = payload.get("mfa_verified", False)
    if not mfa_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA verification required. Please verify your identity with a one-time code.",
            headers={"X-MFA-Required": "true"},
        )

    return user


def require_editor(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Lighter dependency — checks role only (no MFA).
    Used for the MFA verification endpoint itself.
    """
    payload = _decode_token(token)

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor access required",
        )

    return user


# ── Generic role whitelist helper ───────────────────────
#
# The editor gate above is route-agnostic. For endpoints that need a
# custom whitelist — production routes that must let ``production_editor``
# in but keep everyone else out, or a super-admin-only settings surface —
# use ``require_role(*roles)`` to build a dependency on the fly:
#
#     @router.post("/production/{id}/typeset",
#                  dependencies=[Depends(require_role(
#                      UserRole.production_editor,
#                      UserRole.managing_editor,
#                      UserRole.admin,
#                      UserRole.super_admin,
#                  ))])
#
# The returned dependency validates the JWT, requires MFA, and enforces
# the whitelist. It does NOT change ``require_editor_mfa`` behaviour —
# every existing gate keeps working exactly as before.
def require_role(*roles: UserRole):
    """Return a FastAPI dependency that lets a user through when their
    role is in ``roles`` (and their JWT is valid and MFA-verified).

    Empty ``roles`` is treated as "any authenticated + MFA-verified user"
    so this can double as a plain MFA gate without a role restriction.
    """
    allowed = set(roles)

    def _dependency(
        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db),
    ) -> User:
        payload = _decode_token(token)

        email = payload.get("sub")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token — no subject claim",
            )

        user = db.query(User).filter(User.email == email).first()
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or deactivated",
            )

        if allowed and user.role not in allowed:
            logger.warning(
                "User %s (role=%s) blocked by require_role whitelist %s",
                email,
                user.role,
                sorted(r.value for r in allowed),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission for this action.",
            )

        if not payload.get("mfa_verified", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA verification required.",
                headers={"X-MFA-Required": "true"},
            )

        return user

    return _dependency
