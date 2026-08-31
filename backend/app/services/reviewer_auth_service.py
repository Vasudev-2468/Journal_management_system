"""
Reviewer auth service — dependency that resolves the current Reviewer from a
Bearer session token minted by /reviewer-auth/login.

The token carries:
  - ``sub``   — the reviewer's UUID (as a string)
  - ``role``  — "reviewer"
  - ``scope`` — "session"   (keeps us aligned with the author/editor JWTs so
                              the existing get_current_user guard still
                              rejects reviewer tokens for author endpoints —
                              they have role=reviewer, not author.)

Any other token — the per-review link JWT (type=review_link), the
reviewer-invitation JWT (type=reviewer_invite), an author session, an
editor session — is rejected with 401.
"""
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.reviewer import Reviewer


_UNAUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated as a reviewer",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _UNAUTH
    return authorization.split(" ", 1)[1].strip()


def get_current_reviewer(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Reviewer:
    """Resolve the reviewer whose session JWT is presented as
    ``Authorization: Bearer …``. Raises 401 on any failure."""
    token = _extract_bearer(authorization)
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise _UNAUTH

    # Guard against the wrong kind of token being replayed here — a review
    # link, an invitation, or an editor/author session.
    if payload.get("type") in {"review_link", "reviewer_invite"}:
        raise _UNAUTH
    if payload.get("role") != "reviewer":
        raise _UNAUTH
    if payload.get("scope") not in (None, "session"):
        raise _UNAUTH

    subject = payload.get("sub")
    if not subject:
        raise _UNAUTH
    try:
        reviewer_id = UUID(str(subject))
    except (ValueError, AttributeError):
        raise _UNAUTH

    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None or not reviewer.is_active:
        raise _UNAUTH
    return reviewer
