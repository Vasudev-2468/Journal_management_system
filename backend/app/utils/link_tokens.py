"""
Helpers for creating and verifying secure review-link tokens.

Each token is a JWT containing the review_id, signed with the app SECRET_KEY.
The DB row stores the token string, expiry, and a one-time-use flag.
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt

from app.config import settings


def create_review_link_token(review_id: UUID, expires_days: int | None = None) -> str:
    """Create a signed JWT that encodes the review_id and expiry."""
    expire = datetime.utcnow() + timedelta(
        days=expires_days or settings.JWT_EXPIRE_DAYS
    )
    payload = {
        "sub": str(review_id),
        "type": "review_link",
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_review_link_token(token: str) -> Optional[str]:
    """
    Verify the JWT signature and expiry.

    Returns the review_id (as string) if valid, or None if the signature is
    invalid.  Raises jose.ExpiredSignatureError if the token is expired
    (caller should catch and return 410).
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "review_link":
            return None
        return payload.get("sub")
    except JWTError:
        return None
