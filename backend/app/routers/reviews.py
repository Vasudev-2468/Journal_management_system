import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import ExpiredSignatureError
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa
from app.services.review_service import (
    get_review_by_token,
    get_submission_reviews,
    log_access,
    record_decision,
    submit_review,
)
from app.models.submission import Submission, SubmissionStatus
from app.schemas.review import (
    DecisionRequest,
    DecisionResponse,
    ReviewAccessResponse,
    ReviewSubmitRequest,
    ReviewSubmitResponse,
    SubmissionReviewsResponse,
)
from app.utils.link_tokens import verify_review_link_token
from app.tasks import notify_editor_review_complete, send_decision_to_author

router = APIRouter()


# ── GET /reviews/access/{link_token}  (reviewer portal) ─

@router.get("/access/{link_token}", response_model=ReviewAccessResponse)
def access_review(link_token: str, request: Request, db: Session = Depends(get_db)):
    # 1. Look up the review row by the raw token string
    review = get_review_by_token(db, link_token)
    if review is None:
        raise HTTPException(status_code=404, detail="Review link not found.")

    # 2. Check if already used
    if review.link_used:
        raise HTTPException(
            status_code=409, detail="This review has already been submitted."
        )

    # 3. Check expiry
    if review.link_expires_at and review.link_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=410, detail="This review link has expired."
        )

    # 4. Verify JWT signature (defence-in-depth on top of DB lookup)
    review_id_str = verify_review_link_token(link_token)
    if review_id_str is None:
        raise HTTPException(status_code=401, detail="Invalid review link token.")

    # 5. Log the access attempt
    client_ip = request.client.host if request.client else "unknown"
    log_access(db, review, ip_address=client_ip)

    # 6. Build response
    submission = review.submission
    reviewer = review.reviewer

    return ReviewAccessResponse(
        reviewer_name=reviewer.name if reviewer else "Reviewer",
        paper_title=submission.paper_title if submission else "N/A",
        redacted_pdf_url=submission.redacted_pdf_url if submission else None,
    )


# ── POST /reviews/submit/{link_token}  (reviewer portal) ─

@router.post("/submit/{link_token}", response_model=ReviewSubmitResponse, status_code=201)
def submit_review_endpoint(
    link_token: str,
    body: ReviewSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Validate link
    review = get_review_by_token(db, link_token)
    if review is None:
        raise HTTPException(status_code=404, detail="Review link not found.")
    if review.link_used:
        raise HTTPException(
            status_code=409, detail="This review has already been submitted."
        )
    if review.link_expires_at and review.link_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=410, detail="This review link has expired."
        )

    review_id_str = verify_review_link_token(link_token)
    if review_id_str is None:
        raise HTTPException(status_code=401, detail="Invalid review link token.")

    # Log access
    client_ip = request.client.host if request.client else "unknown"
    log_access(db, review, ip_address=client_ip)

    # Persist the review
    updated = submit_review(
        db,
        review,
        score_originality=body.score_originality,
        score_technical=body.score_technical,
        score_relevance=body.score_relevance,
        score_clarity=body.score_clarity,
        score_references=body.score_references,
        overall_recommendation=body.overall_recommendation,
        comments_to_authors=body.comments_to_authors,
        comments_to_editor=body.comments_to_editor,
    )

    # D6 — the task recomputes all_reviews_completed internally and stamps
    # the "all reviews in" message from that state, so the second delay()
    # was firing an identical email. Send the notification exactly once.
    notify_editor_review_complete.delay(str(updated.id))

    return ReviewSubmitResponse(
        review_id=updated.id,
        message="Review submitted successfully. Thank you for your contribution.",
    )


# ── GET /reviews/{submission_id}  (editor only) ─────────

@router.get("/{submission_id}", response_model=SubmissionReviewsResponse)
def get_reviews_for_submission(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    result = get_submission_reviews(db, submission_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return result


# ── POST /reviews/{submission_id}/decision  (editor only) ─

@router.post(
    "/{submission_id}/decision",
    response_model=DecisionResponse,
    status_code=201,
)
def make_decision(
    submission_id: uuid.UUID,
    body: DecisionRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    submission = record_decision(db, submission_id, body.decision)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Trigger author notification
    send_decision_to_author.delay(
        str(submission.id), body.decision, body.editor_comments or ""
    )

    return DecisionResponse(
        submission_id=submission.id,
        new_status=submission.status.value,
        message=f"Decision '{body.decision}' recorded. Author has been notified.",
    )


# ── POST /reviews/{submission_id}/request-additional-review  (editor only) ─
#
# When the completed reviews on a submission are split or an editor otherwise
# wants another opinion, this reopens the submission for reviewer assignment
# so the existing suggestion pipeline (Agent 3 → Agent 4) can produce and
# assign one more reviewer. We deliberately do NOT retire or invalidate any
# existing reviews — they remain valid feedback on the file.

@router.post("/{submission_id}/request-additional-review", status_code=200)
def request_additional_review(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Move the submission back to pending_assignment so the editor can pick
    # (or the suggestion agent can recommend) an additional reviewer. If a
    # decision has already been recorded we refuse — the review round is
    # closed and reopening it here would silently overwrite that outcome.
    if submission.status in (
        SubmissionStatus.accepted,
        SubmissionStatus.rejected,
    ):
        raise HTTPException(
            status_code=409,
            detail="Submission has a final decision; additional review cannot be requested.",
        )

    submission.status = SubmissionStatus.pending_assignment
    db.commit()
    db.refresh(submission)

    return {
        "submission_id": str(submission.id),
        "new_status": submission.status.value,
        "message": "Submission reopened for one additional reviewer assignment.",
    }