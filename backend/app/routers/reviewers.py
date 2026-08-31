import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa
from app.services.reviewer_service import (
    assign_reviewers,
    get_reviewer_detail,
    list_reviewers,
    register_reviewer,
    send_welcome_email,
    update_reviewer,
)
from app.services.ai_agent import match_reviewers
from app.schemas.reviewer import (
    AssignReviewersRequest,
    AssignReviewersResponse,
    ReviewerDetailResponse,
    ReviewerListItem,
    ReviewerRegisteredResponse,
    ReviewerRegisterRequest,
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


# ── GET /reviewers/ (editor only) ───────────────────────

@router.get("/", response_model=List[ReviewerListItem])
def list_all_reviewers(
    expertise_tag: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    return list_reviewers(db, expertise_tag=expertise_tag, is_active=is_active)


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
    _editor=Depends(require_editor_mfa),
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
