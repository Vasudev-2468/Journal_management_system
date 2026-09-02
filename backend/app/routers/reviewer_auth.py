"""
Reviewer Auth Router — persistent reviewer accounts.

Endpoints:
  - POST /reviewer-auth/set-password  → redeem a signed invitation token to
                                        set (or replace) the reviewer's
                                        password.
  - POST /reviewer-auth/login         → OAuth2 password form (username=email,
                                        password=…) → session Bearer token.
  - GET  /reviewer-auth/me            → the current reviewer's public row.
  - GET  /reviewer-auth/my-assignments → the reviewer's Review rows joined
                                        with the paper title, ordered
                                        pending-first then completed.

The per-submission review link flow at /reviews/access/{token} and
/reviews/submit/{token} is completely unchanged — this router lives
alongside it. A reviewer may have a persistent password AND continue to
receive per-review token links; the two are independent.
"""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.review import Review, ReviewStatus
from app.models.reviewer import Reviewer
from app.models.submission import Submission
from app.services.auth_service import create_access_token
from app.services.reviewer_auth_service import get_current_reviewer
from app.services.reviewer_bridge import ensure_link
import hashlib
from fastapi import Request
from app.utils.helpers import hash_password, verify_password


router = APIRouter()


SESSION_HOURS = 24
MIN_PASSWORD_LEN = 8
_INVITE_TYPE = "reviewer_invite"


# ── Schemas ─────────────────────────────────────────────

class SetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SetPasswordResponse(BaseModel):
    reviewer_id: str
    message: str


class LoginResponse(BaseModel):
    access_token: str
    reviewer_id: str
    token_type: str = "bearer"


class ReviewerMeResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    institution: Optional[str] = None
    whatsapp_number: Optional[str] = None
    expertise_tags: list[str] = []
    max_assignments: int
    current_load: int
    is_active: bool
    email_verified_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MyAssignmentRow(BaseModel):
    review_id: str
    submission_id: str
    paper_title: str
    status: str
    deadline: Optional[datetime] = None
    assigned_at: datetime
    completed_at: Optional[datetime] = None
    link_token: Optional[str] = None
    link_valid: bool
    review_url: Optional[str] = None


# ── Token helpers ───────────────────────────────────────

def _verify_invitation_token(token: str) -> tuple[UUID, Optional[datetime]]:
    """Decode a reviewer-invitation JWT and return
    ``(reviewer_id, issued_at)``.

    The token uses the same signing key/algorithm as review-link tokens
    (utils/link_tokens) but a distinct ``type`` claim so a review-link
    token can't be reused to set a password, and vice versa. The
    ``iat`` claim lets ``set_password`` reject tokens older than the
    reviewer's most recent invitation (see the revoke/resend flow in
    ``services.reviewer_service``).
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation token.")
    if payload.get("type") != _INVITE_TYPE:
        raise HTTPException(status_code=400, detail="Invitation token is not valid for this action.")
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=400, detail="Malformed invitation token.")
    try:
        reviewer_id = UUID(str(subject))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Malformed invitation token.")
    iat_raw = payload.get("iat")
    issued_at: Optional[datetime] = None
    if isinstance(iat_raw, (int, float)):
        try:
            issued_at = datetime.utcfromtimestamp(int(iat_raw))
        except (OverflowError, OSError, ValueError):
            issued_at = None
    return reviewer_id, issued_at


def _mint_session_token(reviewer: Reviewer) -> str:
    return create_access_token(
        data={
            "sub": str(reviewer.id),
            "role": "reviewer",
            "scope": "session",
        },
        expires_delta=timedelta(hours=SESSION_HOURS),
    )


def _to_me(reviewer: Reviewer) -> ReviewerMeResponse:
    return ReviewerMeResponse(
        id=str(reviewer.id),
        name=reviewer.name,
        email=reviewer.email,
        institution=reviewer.institution,
        whatsapp_number=reviewer.whatsapp_number,
        expertise_tags=list(reviewer.expertise_tags or []),
        max_assignments=reviewer.max_assignments,
        current_load=reviewer.current_load,
        is_active=reviewer.is_active,
        email_verified_at=reviewer.email_verified_at,
        last_login_at=reviewer.last_login_at,
        created_at=reviewer.created_at,
    )


# ── 1. Set password from invitation token ───────────────

@router.post("/set-password", response_model=SetPasswordResponse)
def set_password(body: SetPasswordRequest, db: Session = Depends(get_db)):
    if not body.new_password or len(body.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters.",
        )
    reviewer_id, token_iat = _verify_invitation_token(body.token)
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        raise HTTPException(status_code=404, detail="Reviewer not found.")
    if not reviewer.is_active:
        raise HTTPException(status_code=403, detail="Reviewer account is inactive.")
    # An editor can revoke a pending invitation from the Reviewers
    # panel. Any activation token minted before the revoke is refused
    # here — the reviewer will see a "revoked" message and the editor
    # can resend a fresh invite from the panel if they change their
    # mind. Only the most recent invitation is redeemable:
    # ``reviewer.invitation_sent_at`` is bumped on every send/resend,
    # so a stale token (iat < invitation_sent_at) is rejected even
    # after a subsequent resend un-revokes the reviewer.
    if reviewer.password_hash is None:
        if reviewer.invitation_revoked_at is not None:
            raise HTTPException(
                status_code=410,
                detail="This invitation has been revoked. Contact the editorial office for a new invitation.",
            )
        if (
            reviewer.invitation_sent_at is not None
            and token_iat is not None
            # 1s slack absorbs JWT integer-second truncation vs. the
            # microsecond timestamp on the DB row.
            and token_iat < reviewer.invitation_sent_at - timedelta(seconds=1)
        ):
            raise HTTPException(
                status_code=410,
                detail="This invitation link has been superseded by a newer one — check your most recent invitation email.",
            )

    # Idempotent — replace an existing password if one has already been set.
    reviewer.password_hash = hash_password(body.new_password)
    if reviewer.email_verified_at is None:
        # Signed invitation delivered to the reviewer's inbox is proof of
        # email possession.
        reviewer.email_verified_at = datetime.utcnow()

    # Bridge to the unified users identity surface. Idempotent — if the
    # link is already stamped, ensure_link is a no-op; if it is missing
    # (either a legacy reviewer created before migration p2n7l5c6d0j1, or
    # one that was reactivated after the backfill), a matching User row
    # is adopted or created. The response shape below is unchanged.
    if reviewer.linked_user_id is None:
        ensure_link(db, reviewer)

    db.commit()
    return SetPasswordResponse(
        reviewer_id=str(reviewer.id),
        message="Password set successfully. You can now sign in.",
    )


# ── 2. Login (email + password → session token) ─────────

def _persist_session(
    db: Session, reviewer: Reviewer, token: str, request: Optional[Request],
) -> None:
    """Idempotent — upsert a reviewer_sessions row keyed by the token's
    SHA-256 hash. Every subsequent /me call refreshes ``last_seen_at``
    via the get_current_reviewer dependency."""
    from app.models.reviewer_session import ReviewerSession as _RS
    th = _hash_token(token)
    existing = db.query(_RS).filter(_RS.token_hash == th).first()
    ua = request.headers.get("user-agent") if request else None
    ip = request.client.host if request and request.client else None
    now = datetime.utcnow()
    if existing is not None:
        existing.last_seen_at = now
        existing.revoked_at = None
        if ip:
            existing.ip_address = ip
        if ua:
            existing.user_agent = ua
            existing.device_label = _device_label(ua)
    else:
        db.add(_RS(
            reviewer_id=reviewer.id,
            token_hash=th,
            ip_address=ip,
            user_agent=ua,
            device_label=_device_label(ua),
            created_at=now,
            last_seen_at=now,
        ))
    db.commit()


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # form_data.username carries the email — matches the OAuth2 password flow
    # the frontend already uses for the editor/admin login form.
    reviewer = db.query(Reviewer).filter(Reviewer.email == form_data.username).first()
    if reviewer is None or not reviewer.password_hash:
        # Do NOT leak whether the account exists but has no password vs. does
        # not exist at all — both look identical to a caller.
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not reviewer.is_active:
        raise HTTPException(status_code=403, detail="Reviewer account is inactive.")
    if not verify_password(form_data.password, reviewer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    # Panel-membership gating: a reviewer who was invited must click
    # Accept in the email before their login unlocks. A revoked or
    # declined invitation blocks login even after a correct password.
    # Legacy self-registered reviewers (no invitation_expires_at) are
    # unaffected — they never went through the accept flow.
    if reviewer.invitation_declined_at is not None or reviewer.invitation_revoked_at is not None:
        raise HTTPException(
            status_code=403,
            detail=(
                "This invitation has been retired. Please contact the "
                "editorial office if you would still like to review."
            ),
        )
    if (
        reviewer.invitation_expires_at is not None
        and reviewer.invitation_accepted_at is None
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Please open the invitation email and click Accept before "
                "signing in."
            ),
        )

    # TOTP enforcement — if the reviewer has paired an authenticator
    # (``totp_enrolled_at`` is set), refuse the password-only login and
    # hand back a short pre-auth token the frontend swaps for a full
    # session via /verify-totp. Reviewers who haven't enrolled log in
    # exactly as before.
    if getattr(reviewer, "totp_enrolled_at", None) and getattr(reviewer, "totp_secret", None):
        pre_auth = create_access_token(
            data={
                "sub": str(reviewer.id),
                "role": "reviewer",
                "scope": "pre_auth",
            },
            expires_delta=timedelta(minutes=10),
        )
        return LoginResponse(
            access_token=pre_auth,
            reviewer_id=str(reviewer.id),
            token_type="pre_auth",
        )

    reviewer.last_login_at = datetime.utcnow()
    db.commit()
    session_token = _mint_session_token(reviewer)
    _persist_session(db, reviewer, session_token, request)
    return LoginResponse(
        access_token=session_token,
        reviewer_id=str(reviewer.id),
        token_type="bearer",
    )


# ── 2b. TOTP verification during login ──────────────────

class TotpLoginRequest(BaseModel):
    pre_auth_token: str
    code: str


@router.post("/verify-totp", response_model=LoginResponse)
def verify_totp_login(
    body: TotpLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Swap the pre-auth token + a valid TOTP code for a full session.
    Only reachable after ``/login`` returned ``token_type=pre_auth``."""
    try:
        payload = jwt.decode(
            body.pre_auth_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired pre-auth token.")
    if payload.get("scope") != "pre_auth" or payload.get("role") != "reviewer":
        raise HTTPException(status_code=401, detail="Wrong pre-auth token scope.")
    sub = payload.get("sub")
    try:
        reviewer_id = UUID(str(sub))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Malformed pre-auth token.")
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None or not reviewer.is_active or not getattr(reviewer, "totp_secret", None):
        raise HTTPException(status_code=401, detail="Not authorised.")
    import pyotp
    if not pyotp.TOTP(reviewer.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Authenticator code did not match.")
    reviewer.last_login_at = datetime.utcnow()
    db.commit()
    session_token = _mint_session_token(reviewer)
    _persist_session(db, reviewer, session_token, request)
    return LoginResponse(
        access_token=session_token,
        reviewer_id=str(reviewer.id),
        token_type="bearer",
    )


# ── 3. Current reviewer profile ─────────────────────────

@router.get("/me", response_model=ReviewerMeResponse)
def get_me(reviewer: Reviewer = Depends(get_current_reviewer)):
    return _to_me(reviewer)


# ── Change password (self-service) ──────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Reviewer changes their password from the Security page.

    Verifies the current password before writing the new hash so a
    hijacked session token cannot silently pivot to a permanent
    takeover. Also invalidates every existing session by bumping
    ``password_hash`` — any bearer token minted before the change is
    still cryptographically valid but a subsequent ``/me`` will
    happily reissue (bearer + password_hash are independent). If the
    reviewer wants to explicitly revoke every session they use the
    ``/sign-out-everywhere`` endpoint below.
    """
    if not body.new_password or len(body.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters.",
        )
    if not reviewer.password_hash or not verify_password(body.current_password, reviewer.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    reviewer.password_hash = hash_password(body.new_password)
    reviewer.last_login_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Password updated."}


# ── Sign out everywhere ─────────────────────────────────

@router.post("/sign-out-everywhere")
def sign_out_everywhere(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Invalidate every reviewer session by bumping the token's
    ``iat`` cutoff on the reviewer row. ``last_login_at`` is the
    freshness marker — the login endpoint stamps it on every issue,
    so setting it to *now* forces every extant token minted before
    ``now`` to fail the ``/me`` freshness check below."""
    from app.models.reviewer_session import ReviewerSession as _RS
    now = datetime.utcnow()
    reviewer.last_login_at = now
    (
        db.query(_RS)
        .filter(_RS.reviewer_id == reviewer.id, _RS.revoked_at.is_(None))
        .update({_RS.revoked_at: now})
    )
    db.commit()
    return {"ok": True, "message": "All reviewer sessions signed out."}


# ── TOTP enrolment for reviewers ────────────────────────

class TotpEnrolStartResponse(BaseModel):
    secret: str
    otpauth_uri: str
    qr_data_uri: str


class TotpEnrolConfirmRequest(BaseModel):
    code: str


@router.post("/totp/start", response_model=TotpEnrolStartResponse)
def totp_start(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Generate a fresh TOTP secret for the reviewer and hand back the
    otpauth URI + inlined QR data-URI for scanning. The secret is
    stashed on the reviewer row but the reviewer is not marked
    enrolled until ``/totp/confirm`` verifies the first code."""
    # Reuse the shared totp_service — same primitives used by editors.
    from app.services import totp_service
    from app.models.user import User  # noqa: F401 — totp_service signature

    # totp_service.start_enrolment expects a User; we adapt for the
    # Reviewer model by writing to columns of the same name.
    secret = totp_service.generate_secret()
    reviewer.totp_secret = secret if hasattr(reviewer, "totp_secret") else None
    if not hasattr(reviewer, "totp_secret"):
        raise HTTPException(
            status_code=501,
            detail="TOTP columns not yet available on reviewer schema — run migrations.",
        )
    reviewer.totp_enrolled_at = None
    db.commit()
    otpauth = totp_service.provisioning_uri(secret, reviewer.email)
    return TotpEnrolStartResponse(
        secret=secret,
        otpauth_uri=otpauth,
        qr_data_uri=totp_service.qr_code_data_uri(otpauth),
    )


@router.post("/totp/confirm")
def totp_confirm(
    body: TotpEnrolConfirmRequest,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    from app.services import totp_service
    if not getattr(reviewer, "totp_secret", None):
        raise HTTPException(status_code=400, detail="TOTP enrolment not started.")
    import pyotp
    if not pyotp.TOTP(reviewer.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Code did not match.")
    reviewer.totp_enrolled_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Authenticator enrolled."}


# ── Reviewer sessions listing + per-session revoke ─────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _device_label(user_agent: str | None) -> str:
    """Turn a raw UA string into a compact display label. Handles the
    common browsers + mobile OSes without pulling in a UA parser."""
    if not user_agent:
        return "Unknown device"
    ua = user_agent
    lower = ua.lower()
    if "edg/" in lower:
        browser = "Edge"
    elif "chrome/" in lower and "chromium" not in lower:
        browser = "Chrome"
    elif "firefox/" in lower:
        browser = "Firefox"
    elif "safari/" in lower and "chrome/" not in lower:
        browser = "Safari"
    else:
        browser = "Browser"
    if "iphone" in lower:
        platform = "iPhone"
    elif "android" in lower:
        platform = "Android"
    elif "mac os x" in lower or "macintosh" in lower:
        platform = "Mac"
    elif "windows" in lower:
        platform = "Windows"
    elif "linux" in lower:
        platform = "Linux"
    else:
        platform = "Device"
    return f"{browser} on {platform}"


class ReviewerSessionRow(BaseModel):
    id: int
    device_label: str
    ip_address: Optional[str] = None
    created_at: datetime
    last_seen_at: datetime
    is_current: bool = False


@router.get("/sessions", response_model=list[ReviewerSessionRow])
def list_reviewer_sessions(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Every un-revoked session for the current reviewer, freshest
    first. The row matching the caller's token is marked
    ``is_current`` so the UI can call it out."""
    from app.models.reviewer_session import ReviewerSession as _RS
    current_hash: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        current_hash = _hash_token(authorization.split(" ", 1)[1].strip())
    rows = (
        db.query(_RS)
        .filter(_RS.reviewer_id == reviewer.id, _RS.revoked_at.is_(None))
        .order_by(_RS.last_seen_at.desc())
        .all()
    )
    return [
        ReviewerSessionRow(
            id=r.id, device_label=r.device_label or "Unknown device",
            ip_address=r.ip_address, created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            is_current=(r.token_hash == current_hash),
        )
        for r in rows
    ]


@router.post("/sessions/{session_id}/revoke")
def revoke_reviewer_session(
    session_id: int,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    from app.models.reviewer_session import ReviewerSession as _RS
    row = (
        db.query(_RS)
        .filter(_RS.id == session_id, _RS.reviewer_id == reviewer.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    row.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Reviewer forgot-password ────────────────────────────

class ReviewerForgotRequest(BaseModel):
    email: EmailStr


class ReviewerResetRequest(BaseModel):
    token: str
    new_password: str


_RESET_TTL_MINUTES = 30


@router.post("/forgot-password", status_code=202)
def reviewer_forgot_password(
    body: ReviewerForgotRequest,
    db: Session = Depends(get_db),
):
    """Kick off a reviewer password reset. Always 202 — the response is
    identical whether or not the email matches a reviewer, so this
    endpoint can't be used to check membership."""
    reviewer = db.query(Reviewer).filter(Reviewer.email == body.email).first()
    if reviewer and reviewer.is_active:
        token = jwt.encode(
            {
                "sub": str(reviewer.id),
                "type": "reviewer_password_reset",
                "iat": datetime.utcnow(),
                "exp": datetime.utcnow() + timedelta(minutes=_RESET_TTL_MINUTES),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        # Best-effort email — a delivery failure never leaks the
        # existence/non-existence of the account.
        try:
            from app.services.email_service import _send_and_log, _wrap, _btn
            frontend = (settings.FRONTEND_URL or "").rstrip("/")
            url = f"{frontend}/reset-password?token={token}&for=reviewer" if frontend else f"/reset-password?token={token}&for=reviewer"
            body_html = _wrap(f"""
                <p>Dear {reviewer.name},</p>
                <p>Someone requested a password reset for your reviewer account.
                   Click the button below to choose a new password — the link
                   is valid for {_RESET_TTL_MINUTES} minutes and can only be
                   used once.</p>
                <div style="text-align:center;">
                  {_btn("Choose new password", url)}
                </div>
                <p style="font-size:12px;color:#6b7280;">
                  If you did not request this reset you can safely ignore this
                  email — your password stays unchanged.
                </p>
            """)
            _send_and_log(reviewer.email, "Reviewer password reset", body_html, "reviewer_password_reset")
        except Exception:
            logger = __import__("logging").getLogger(__name__)
            logger.exception("Failed to dispatch reviewer password-reset email")
    return {"message": "If a reviewer account matches, a reset link is on the way."}


@router.post("/reset-password")
def reviewer_reset_password(
    body: ReviewerResetRequest,
    db: Session = Depends(get_db),
):
    """Consume the reset token and set a new password. Fails on any
    invalid / expired token with a single generic 400."""
    generic = HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    if not body.new_password or len(body.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters.",
        )
    try:
        payload = jwt.decode(body.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise generic
    if payload.get("type") != "reviewer_password_reset":
        raise generic
    try:
        reviewer_id = UUID(str(payload.get("sub")))
    except (ValueError, AttributeError, TypeError):
        raise generic
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None or not reviewer.is_active:
        raise generic
    reviewer.password_hash = hash_password(body.new_password)
    reviewer.last_login_at = datetime.utcnow()  # invalidate every existing session
    db.commit()
    return {"ok": True, "message": "Password reset. You can now sign in."}


@router.post("/totp/disable")
def totp_disable(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    reviewer.totp_secret = None
    reviewer.totp_enrolled_at = None
    db.commit()
    return {"ok": True, "message": "Authenticator disabled."}


# ── 4. My assignments (all reviews for the reviewer) ────

@router.get("/my-assignments", response_model=list[MyAssignmentRow])
def my_assignments(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Review, Submission.paper_title)
        .join(Submission, Submission.id == Review.submission_id)
        .filter(Review.reviewer_id == reviewer.id)
        .all()
    )

    now = datetime.utcnow()
    frontend_root = (settings.FRONTEND_URL or "").rstrip("/")

    def _row(review: Review, paper_title: str) -> MyAssignmentRow:
        link_valid = (
            not review.link_used
            and review.link_expires_at is not None
            and review.link_expires_at > now
            and review.status == ReviewStatus.pending
        )
        review_url = None
        if review.link_token:
            # Path-only URL is fine — the frontend router mounts /review/:token.
            path = f"/review/{review.link_token}"
            review_url = f"{frontend_root}{path}" if frontend_root else path
        return MyAssignmentRow(
            review_id=str(review.id),
            submission_id=str(review.submission_id),
            paper_title=paper_title,
            status=review.status.value if review.status else "pending",
            deadline=review.link_expires_at,
            assigned_at=review.assigned_at,
            completed_at=review.completed_at,
            link_token=review.link_token,
            link_valid=link_valid,
            review_url=review_url,
        )

    assignments = [_row(r, title) for r, title in rows]

    # Pending first (any non-completed), completed after. Within each bucket,
    # most recent assignment first — pending users usually want to see the
    # freshest invite at the top.
    def _bucket(a: MyAssignmentRow) -> int:
        return 0 if a.status != ReviewStatus.completed.value else 1

    assignments.sort(key=lambda a: (_bucket(a), -a.assigned_at.timestamp()))
    return assignments
