"""Per-user active-session management.

Endpoints (all authenticated as the caller):

  * ``GET  /sessions/mine``
      Return the caller's non-revoked sessions, most-recently-used first.
      Each row is ``{id, ip_address, user_agent, created_at, last_seen_at,
      is_current}``. ``is_current`` is true when the row's ``token_hash``
      matches the SHA-256 of the token in the incoming Authorization
      header — which is how the UI knows to disable the "revoke" button
      for the row the user is signed in with right now.

  * ``POST /sessions/{id}/revoke``
      Stamp ``revoked_at`` on that session. Refuses to revoke the
      current one unless the caller passes ``?force=true`` — the guard
      stops a mis-click from immediately locking the user out of the
      page they're on.

  * ``POST /sessions/revoke-others``
      Convenience: stamp ``revoked_at`` on every OTHER live session of
      the caller. The row matching the current token_hash is preserved.

The soft-revocation flag is enforced downstream in
``auth_service.get_current_user`` — a revoked token that has not yet
expired is refused with a 401 on its next authenticated request.
"""

import hashlib
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.rate_limit import forget_all_for_user
from app.models.user import User
from app.models.user_session import UserSession
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# We reuse the same tokenUrl the app-wide scheme uses so the sessions
# router doesn't drift from auth_service's OAuth2 bearer.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


class SessionRow(BaseModel):
    id: int
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    last_seen_at: datetime
    is_current: bool


class RevokeResponse(BaseModel):
    ok: bool = True
    revoked: int = 0


def _hash_token(token: str) -> str:
    """Match ``auth_service._hash_token``. Kept local so the router
    stays importable even if the service module reshuffles its private
    helpers."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _incoming_token(request: Request) -> Optional[str]:
    """Return the raw Bearer token off the Authorization header.

    Depends() on the OAuth2 scheme also works, but the header inspection
    is trivial and lets ``/sessions/mine`` return a well-formed answer
    (with every row's ``is_current=false``) even in edge cases where
    the token was passed by some other mechanism.
    """
    auth = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if not auth:
        return None
    parts = auth.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


@router.get("/mine", response_model=List[SessionRow])
def list_my_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SessionRow]:
    """List the caller's live (non-revoked) sessions, most recent first."""
    token = _incoming_token(request)
    current_hash = _hash_token(token) if token else None

    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id)
        .filter(UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )
    return [
        SessionRow(
            id=r.id,
            ip_address=r.ip_address,
            user_agent=r.user_agent,
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            is_current=(current_hash is not None and r.token_hash == current_hash),
        )
        for r in rows
    ]


@router.post("/{session_id}/revoke", response_model=RevokeResponse)
def revoke_session(
    session_id: int,
    request: Request,
    force: bool = Query(False, description="Allow revoking the current session"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RevokeResponse:
    """Mark one session as revoked. Refuses to touch the row matching
    the caller's own token unless ``?force=true`` — the UI disables the
    button for the current row and this is a defence in depth."""
    row = (
        db.query(UserSession)
        .filter(UserSession.id == session_id)
        .filter(UserSession.user_id == current_user.id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    if row.revoked_at is not None:
        # Idempotent — repeated revoke calls should not 400.
        return RevokeResponse(ok=True, revoked=0)

    token = _incoming_token(request)
    current_hash = _hash_token(token) if token else None
    if current_hash is not None and row.token_hash == current_hash and not force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Refusing to revoke the current session. Pass "
                "?force=true to sign out this device."
            ),
        )

    row.revoked_at = datetime.utcnow()
    db.commit()
    # Proactively evict any cached sub-claim decoded for this user from
    # the rate-limiter — without this, a revoked bearer would still be
    # counted against its old bucket for up to _TOKEN_CACHE_TTL_SECONDS.
    try:
        forget_all_for_user(current_user.id)
    except Exception:
        logger.exception("rate-limit cache eviction after revoke_session failed")
    logger.info(
        "Session %s revoked by user %s (id=%s)",
        session_id,
        current_user.email,
        current_user.id,
    )
    return RevokeResponse(ok=True, revoked=1)


@router.post("/revoke-others", response_model=RevokeResponse)
def revoke_other_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RevokeResponse:
    """Revoke every OTHER live session for the caller.

    The row matching the current token_hash is preserved so the user is
    not signed out of the tab they just clicked the button in.
    """
    token = _incoming_token(request)
    current_hash = _hash_token(token) if token else None

    query = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id)
        .filter(UserSession.revoked_at.is_(None))
    )
    if current_hash:
        query = query.filter(UserSession.token_hash != current_hash)

    now = datetime.utcnow()
    revoked = 0
    for row in query.all():
        row.revoked_at = now
        revoked += 1
    db.commit()
    # Same reasoning as ``revoke_session`` — clear the rate-limiter's
    # cached ``sub`` entries for this user so a just-revoked bearer
    # can't keep filling its old bucket for the TTL window.
    try:
        forget_all_for_user(current_user.id)
    except Exception:
        logger.exception("rate-limit cache eviction after revoke_others failed")
    logger.info(
        "Bulk-revoked %s other session(s) for user %s (id=%s)",
        revoked,
        current_user.email,
        current_user.id,
    )
    return RevokeResponse(ok=True, revoked=revoked)
