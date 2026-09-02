import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa
from app.services.permissions import ACTION_ASSIGN_REVIEWERS, require_permission

_require_assign_reviewers = require_permission(ACTION_ASSIGN_REVIEWERS)
from app.models.reviewer import Reviewer
from app.services.reviewer_service import (
    assign_reviewers,
    build_invitation_link,
    delete_reviewer,
    get_reviewer_detail,
    invite_reviewer,
    list_reviewers,
    register_reviewer,
    resend_reviewer_invitation,
    reset_reviewer_password_only,
    revoke_reviewer_invitation,
    send_welcome_email,
    update_reviewer,
    _REVIEWER_INVITE_TTL,
)
from datetime import datetime
from app.services.ai_agent import match_reviewers
from app.schemas.reviewer import (
    AssignReviewersRequest,
    AssignReviewersResponse,
    ReviewerCredentialsRevealResponse,
    ReviewerDetailResponse,
    ReviewerInvitationLinkResponse,
    ReviewerListItem,
    ReviewerRegisteredResponse,
    ReviewerRegisterRequest,
    ReviewerResendResponse,
    ReviewerSuggestion,
    ReviewerUpdateRequest,
)
from app.tasks import compute_reviewer_embedding, send_reviewer_invitations

router = APIRouter()


# ── POST /reviewers/register (public) ───────────────────

@router.post("/register", response_model=ReviewerRegisteredResponse, status_code=201)
def register(body: ReviewerRegisterRequest, db: Session = Depends(get_db)):
    try:
        reviewer = register_reviewer(
            db,
            name=body.name,
            email=body.email,
            whatsapp_number=body.whatsapp_number,
            institution=body.institution,
            expertise_tags=body.expertise_tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Async: compute embedding for future matching
    compute_reviewer_embedding.delay(str(reviewer.id))

    # Send welcome email (best-effort, don't fail the request)
    try:
        send_welcome_email(reviewer)
    except Exception:
        pass  # logged via SendGrid dashboard; notification service can retry

    return ReviewerRegisteredResponse(
        reviewer_id=reviewer.id,
        message="Registration successful. You will receive review invitations matching your expertise.",
    )


# ── POST /reviewers/invite (editor only) ────────────────
#
# Editor-driven onboarding: the editor supplies contact + expertise and
# the reviewer receives a "set your password" activation link. Distinct
# from ``/register`` (which is public self-sign-up) — this path is
# initiated by the editorial office and gates on editor MFA.

class ReviewerInviteRequest(ReviewerRegisterRequest):
    """Same shape as self-registration — the editor supplies exactly the
    same fields, we just gate the endpoint on MFA and additionally
    dispatch an activation link email."""


class ReviewerInvitedResponse(ReviewerRegisteredResponse):
    email_sent: bool
    # When the activation email fails to dispatch the editor still gets a
    # reviewer_id back so they can retry send-invite from the UI without
    # duplicating the row.


@router.post("/invite", response_model=ReviewerInvitedResponse, status_code=201)
def invite(
    body: ReviewerInviteRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    try:
        reviewer, email_sent = invite_reviewer(
            db,
            name=body.name,
            email=body.email,
            whatsapp_number=body.whatsapp_number,
            institution=body.institution,
            expertise_tags=body.expertise_tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Best-effort: compute the embedding so the reviewer immediately
    # appears in the suggest-reviewers ranking for new submissions.
    compute_reviewer_embedding.delay(str(reviewer.id))

    message = (
        "Invitation sent — the reviewer has 21 days to accept or reject."
        if email_sent
        else "Reviewer created, but the invitation email could not be dispatched. "
             "Check the notification log and resend."
    )
    return ReviewerInvitedResponse(
        reviewer_id=reviewer.id,
        message=message,
        email_sent=email_sent,
    )


# ── GET /reviewers/ (editor only) ───────────────────────

@router.get("/", response_model=List[ReviewerListItem])
def list_all_reviewers(
    expertise_tag: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[str] = Query(
        None,
        description=(
            "Optional Reviewers-panel status pill: "
            "active | inactive | pending | accepted | declined | revoked."
        ),
    ),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    return list_reviewers(
        db,
        expertise_tag=expertise_tag,
        is_active=is_active,
        status=status,
    )


# ── GET /reviewers/{reviewer_id} (editor only) ──────────

@router.get("/{reviewer_id}", response_model=ReviewerDetailResponse)
def get_reviewer(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    result = get_reviewer_detail(db, reviewer_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Reviewer not found.")
    return result


# ── PATCH /reviewers/{reviewer_id} (editor only) ────────

@router.patch("/{reviewer_id}", response_model=ReviewerListItem)
def patch_reviewer(
    reviewer_id: uuid.UUID,
    body: ReviewerUpdateRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    reviewer = update_reviewer(
        db,
        reviewer_id,
        expertise_tags=body.expertise_tags,
        max_assignments=body.max_assignments,
        is_active=body.is_active,
    )
    if reviewer is None:
        raise HTTPException(status_code=404, detail="Reviewer not found.")
    return reviewer


# ── GET /reviewers/suggest/{submission_id} (editor only) ─

@router.get("/suggest/{submission_id}", response_model=List[ReviewerSuggestion])
def suggest_reviewers(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    try:
        suggestions = match_reviewers(db, submission_id, top_k=5)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return suggestions


# ── POST /reviewers/assign (editor only) ────────────────

@router.post("/assign", response_model=AssignReviewersResponse, status_code=201)
def assign(
    body: AssignReviewersRequest,
    db: Session = Depends(get_db),
    # ASSIGN_REVIEWERS is the RBAC gate that actually authorises
    # invitation dispatch. Editors without this permission see the
    # AI-suggested shortlist but can't fire emails to the reviewers.
    _editor=Depends(_require_assign_reviewers),
):
    try:
        created_reviews = assign_reviewers(db, body.submission_id, body.reviewer_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Trigger async invitation delivery
    send_reviewer_invitations.delay([str(r.id) for r in created_reviews])

    return AssignReviewersResponse(
        submission_id=body.submission_id,
        reviews_created=len(created_reviews),
        message=f"{len(created_reviews)} reviewers assigned. Invitations are being sent.",
    )


# ── Invitation lifecycle: link / resend / revoke ────────
#
# Powers the editor's Reviewers panel per-row actions. All three
# endpoints refuse to operate on a reviewer that has already set a
# password — that reviewer is activated and belongs to the login
# flow, not the invitation flow. The distinction is enforced here
# rather than in the service so the HTTP response is coherent.


def _load_reviewer_or_404(db: Session, reviewer_id: uuid.UUID) -> Reviewer:
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        raise HTTPException(status_code=404, detail="Reviewer not found.")
    return reviewer


def _refuse_if_accepted(reviewer: Reviewer) -> None:
    """Invitation-lifecycle endpoints (show-link, resend, revoke) are
    only meaningful before the reviewer clicks Accept. Post-accept the
    reviewer owns the account and the correct control is deactivation
    or deletion, not another invitation."""
    if reviewer.invitation_accepted_at is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Reviewer has already accepted this invitation. "
                "Deactivate or delete the reviewer instead."
            ),
        )


@router.get(
    "/{reviewer_id}/invitation-link",
    response_model=ReviewerInvitationLinkResponse,
)
def get_reviewer_invitation_link(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Mint a fresh 48-hour activation URL the editor can copy and
    share out-of-band. Refused for reviewers that have already
    activated — the URL there would silently double as a password
    reset, which is not what "Show invite link" means to an editor.
    """
    reviewer = _load_reviewer_or_404(db, reviewer_id)
    _refuse_if_accepted(reviewer)
    url = build_invitation_link(reviewer)
    # Report the reviewer's actual deadline where we have one — the
    # newly-minted token itself is good for another 21 days, but the
    # panel status pill flips to "revoked" the moment
    # ``invitation_expires_at`` passes (the scheduled agent enforces
    # it), so the honest expiry to surface is the row's own.
    expires = reviewer.invitation_expires_at or (
        datetime.utcnow() + _REVIEWER_INVITE_TTL
    )
    return ReviewerInvitationLinkResponse(
        reviewer_id=reviewer.id,
        invitation_url=url,
        expires_at=expires,
    )


@router.post(
    "/{reviewer_id}/resend-invitation",
    response_model=ReviewerResendResponse,
)
def resend_invitation(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Dispatch a fresh activation email. Clears any prior revoke, so
    resending un-revokes a previously-invalidated invitation."""
    reviewer = _load_reviewer_or_404(db, reviewer_id)
    _refuse_if_accepted(reviewer)
    email_sent = resend_reviewer_invitation(db, reviewer)
    return ReviewerResendResponse(
        reviewer_id=reviewer.id,
        email_sent=email_sent,
        message=(
            "Activation email resent."
            if email_sent
            else "Could not dispatch the email — check the notification log."
        ),
    )


@router.post(
    "/{reviewer_id}/reset-credentials",
    response_model=ReviewerCredentialsRevealResponse,
)
def reset_and_reveal_credentials(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Reset the reviewer's password and return the plaintext once.

    Editor-only, MFA-gated. The DB stores only a bcrypt hash — there is
    no way to reveal an existing password. This endpoint replaces the
    hash with a freshly-generated one and returns the plaintext exactly
    once so the editor can pass the credentials on out-of-band (chat,
    phone, in-person). It also mints a fresh invitation URL when the
    reviewer has not yet accepted their invitation, and always includes
    the reviewer login URL.

    Because a reset is destructive to any password the reviewer may
    already have set, the intent is deliberate: an editor invoking this
    is committing to hand the new credentials to the reviewer.
    """
    from app.config import settings

    reviewer = _load_reviewer_or_404(db, reviewer_id)
    plaintext = reset_reviewer_password_only(db, reviewer)

    # Only mint a fresh invitation link for reviewers who have not
    # accepted yet — for accepted reviewers, the login URL alone is
    # the right entry point.
    invitation_url = None
    invitation_expires_at = None
    if reviewer.invitation_accepted_at is None:
        try:
            invitation_url = build_invitation_link(reviewer)
            invitation_expires_at = reviewer.invitation_expires_at or (
                datetime.utcnow() + _REVIEWER_INVITE_TTL
            )
        except Exception:
            # A minting failure must not prevent us returning the
            # password itself — the invitation URL is the extra channel,
            # not the primary payload.
            invitation_url = None

    login_url = f"{settings.FRONTEND_URL}/reviewer/login"

    return ReviewerCredentialsRevealResponse(
        reviewer_id=reviewer.id,
        username=reviewer.email,
        password=plaintext,
        login_url=login_url,
        invitation_url=invitation_url,
        invitation_expires_at=invitation_expires_at,
    )


@router.post(
    "/{reviewer_id}/revoke-invitation",
    status_code=204,
)
def revoke_invitation(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Invalidate any outstanding activation token. The reviewer row
    stays put so the editor can resend later, but the pending
    invitation is refused by ``reviewer_auth.set_password`` from this
    point on."""
    reviewer = _load_reviewer_or_404(db, reviewer_id)
    _refuse_if_accepted(reviewer)
    revoke_reviewer_invitation(db, reviewer)
    return None


# ── DELETE /reviewers/{reviewer_id} (editor only) ───────

@router.delete("/{reviewer_id}", status_code=204)
def delete_reviewer_endpoint(
    reviewer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Hard-delete a reviewer. A reviewer that carries any review
    history is refused (409) — deactivate them instead so the audit
    trail stays intact."""
    reviewer = _load_reviewer_or_404(db, reviewer_id)
    try:
        delete_reviewer(db, reviewer)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return None
