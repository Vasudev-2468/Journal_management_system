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

from fastapi import APIRouter, Depends, HTTPException, status
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

@router.post("/login", response_model=LoginResponse)
def login(
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

    reviewer.last_login_at = datetime.utcnow()
    db.commit()
    return LoginResponse(
        access_token=_mint_session_token(reviewer),
        reviewer_id=str(reviewer.id),
        token_type="bearer",
    )


# ── 3. Current reviewer profile ─────────────────────────

@router.get("/me", response_model=ReviewerMeResponse)
def get_me(reviewer: Reviewer = Depends(get_current_reviewer)):
    return _to_me(reviewer)


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
