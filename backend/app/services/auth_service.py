import hashlib
import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.user import UserCreate
from app.utils.helpers import hash_password, verify_password
from app.database import get_db
from app.config import settings
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


# Sessions whose IP moves to a different /24 block are logged, but only
# once per this cooling-off window — otherwise a mobile client bouncing
# between two Wi-Fi/cell networks would spam the audit log on every hop.
_HIJACK_LOG_COOLDOWN = timedelta(minutes=5)


def _subnet24(ip: Optional[str]) -> Optional[str]:
    """Return the first three octets of an IPv4 address, or ``None``.

    IPv6 addresses (or anything else that doesn't parse as four dotted
    octets) fall back to the raw string — the caller uses the value only
    for equality comparison, so a non-IPv4 pair still differs correctly
    when the raw strings do.
    """
    if not ip:
        return None
    parts = ip.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        return ".".join(parts[:3])
    return ip

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class TokenData(BaseModel):
    email: Optional[str] = None

def create_user(user: UserCreate, db: Session):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = hash_password(user.password)
    # Derive full_name from first+last if not explicitly provided
    full_name = user.full_name
    if not full_name and (user.first_name or user.last_name):
        full_name = " ".join(filter(None, [user.first_name, user.last_name]))

    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=full_name,
        first_name=user.first_name,
        last_name=user.last_name,
        whatsapp_number=user.whatsapp_number,
        institution=user.institution,
        orcid=user.orcid,
        country=user.country,
        department=user.department,
        bio=user.bio,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = db.query(User).filter(User.email == email).first()
    if user and verify_password(password, user.hashed_password):
        return user
    return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def _hash_token(token: str) -> str:
    """SHA-256 hex of the raw JWT string.

    Kept as a module-level helper so the sessions router can reuse the
    exact same digest scheme to match the incoming Authorization header
    against a stored row.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _touch_session(
    db: Session,
    user: User,
    token: str,
    request: Optional[Request],
) -> None:
    """Record/refresh the per-token session row.

    Called from ``get_current_user`` after the JWT has been decoded and
    the user resolved. Also enforces the soft-revocation flag: if the
    row exists and ``revoked_at`` is set we raise 401 so the client
    drops the stale token even though it hasn't expired yet.

    Failures here MUST NOT break authentication for otherwise-valid
    requests — the tracking is additive. We rollback on unexpected
    errors and fall through; the only path that intentionally raises
    is the revoked-session check above.
    """
    token_hash = _hash_token(token)
    ip: Optional[str] = None
    ua: Optional[str] = None
    if request is not None:
        try:
            if request.client is not None:
                ip = request.client.host
        except Exception:
            ip = None
        try:
            ua = request.headers.get("user-agent")
        except Exception:
            ua = None
        # Enforced column width — truncate rather than 500 on very long UAs.
        if ua and len(ua) > 500:
            ua = ua[:500]
        if ip and len(ip) > 50:
            ip = ip[:50]

    try:
        row = (
            db.query(UserSession)
            .filter(UserSession.token_hash == token_hash)
            .first()
        )
        now = datetime.utcnow()
        if row is None:
            row = UserSession(
                user_id=user.id,
                token_hash=token_hash,
                created_at=now,
                last_seen_at=now,
                ip_address=ip,
                user_agent=ua,
            )
            db.add(row)
            db.commit()
            return

        if row.revoked_at is not None:
            # Revoked but not yet expired — force the client to drop it.
            raise HTTPException(
                status_code=401,
                detail="Session revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Passive hijack detection: if the session's IP has moved to a
        # different /24 block since we last saw it, drop an audit-log
        # row. We only log at most once every ``_HIJACK_LOG_COOLDOWN``
        # so a mobile client hopping networks doesn't spam the log, and
        # we never block the request — this is alerting, not enforcement.
        prev_ip = row.ip_address
        prev_ua = row.user_agent
        prev_seen = row.last_seen_at
        if (
            ip
            and prev_ip
            and ip != prev_ip
            and _subnet24(ip) != _subnet24(prev_ip)
            and (prev_seen is None or (now - prev_seen) >= _HIJACK_LOG_COOLDOWN)
        ):
            try:
                db.add(
                    AuditLog(
                        actor_id=user.id,
                        actor_email=user.email,
                        action="session.ip_change",
                        target_type="user_session",
                        target_id=str(row.id),
                        ip_address=ip,
                        meta={
                            "old_ip": prev_ip,
                            "new_ip": ip,
                            "user_agent_changed": bool(
                                ua and prev_ua and ua != prev_ua
                            ),
                        },
                    )
                )
            except Exception:
                # Never let audit bookkeeping deny a valid request.
                logger.exception(
                    "hijack-detection audit-log write failed for session %s",
                    row.id,
                )

        row.last_seen_at = now
        if ip:
            row.ip_address = ip
        if ua:
            row.user_agent = ua
        db.commit()
    except HTTPException:
        raise
    except Exception:
        # Best-effort tracking — never let a bookkeeping error deny a
        # request whose JWT has already verified.
        try:
            db.rollback()
        except Exception:
            pass


def get_current_user(
    request: Request = None,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Fix R2 — reject bounded-scope tokens (currently the editor pre-auth
        # token minted by editor_auth.login). Those tokens prove a password
        # was typed but MFA hasn't been completed yet; they must not authenticate
        # anything except /editor-auth/verify-otp and /editor-auth/resend-otp.
        scope = payload.get("scope")
        if scope and scope != "session":
            raise credentials_exception
        # Also reject review-link tokens (utils/link_tokens): those authorise
        # a specific review URL, not the user's identity.
        if payload.get("type") == "review_link":
            raise credentials_exception
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    # Per-device session tracking. Additive: never denies a request the
    # JWT verification already accepted, except when the session has
    # been explicitly revoked by its owner (soft-revocation flag).
    _touch_session(db, user, token, request)
    return user
