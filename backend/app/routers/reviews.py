import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import ExpiredSignatureError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.services import pubsub
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa
from app.services.review_service import (
    get_review_by_token,
    get_submission_reviews,
    log_access,
    record_decision,
    submit_review,
)
from app.models.editorial_decision import EditorialDecision
from app.models.review import Review, ReviewState
from app.models.submission import Submission, SubmissionStatus
from app.services.state_machine import transition_or_direct
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

logger = logging.getLogger(__name__)

router = APIRouter()


def _persist_editorial_decision(
    db: Session,
    *,
    submission: Submission,
    editor_id: int | None,
    decision: str,
    letter_text: str | None,
) -> None:
    """Append a row to editorial_decisions for the current review round.

    Best-effort — a persistence failure here MUST NOT break the outer
    /decision endpoint. The submission-level status update has already
    happened by the time we get here; the audit row is a separate
    record. If the migration hasn't run yet (table missing), we log
    and swallow.
    """
    try:
        current_round = 1
        for r in submission.reviews or []:
            if r.round_number and r.round_number > current_round:
                current_round = r.round_number
        row = EditorialDecision(
            submission_id=submission.id,
            editor_id=editor_id,
            decision=decision,
            round_number=current_round,
            letter_text=(letter_text or None),
        )
        db.add(row)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception(
            "reviews.decision: editorial_decisions insert failed for %s",
            submission.id,
        )


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

    # Best-effort real-time nudge to every connected editor. The
    # submission model has no assigned-editor column, so we fan out via
    # the editor role broadcast topics — each editor's WebSocket is
    # subscribed to its own role. Failure never blocks the response;
    # the poll fallback catches the update on the next tick.
    try:
        submission_id = str(updated.submission_id) if updated.submission_id else None
        review_completed_payload = {
            "kind": "review_completed",
            "submission_id": submission_id,
            "review_id": str(updated.id),
        }
        for topic in (
            "broadcast:editor",
            "broadcast:section_editor",
            "broadcast:admin",
            "broadcast:managing_editor",
            "broadcast:super_admin",
        ):
            pubsub.publish_threadsafe(topic, review_completed_payload)
    except Exception:
        logger.debug("reviews: pubsub publish failed", exc_info=True)

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
    request: Request,
    db: Session = Depends(get_db),
    editor=Depends(require_editor_mfa),
):
    # Idempotency guard — refuse a second decision on the same round.
    # The workspace's "Issue Decision" button can double-fire on slow
    # networks; without this a duplicate `editorial_decisions` row +
    # a duplicate author-notification email would slip through.
    from app.models.editorial_decision import EditorialDecision as _EdDec
    from app.models.review import Review as _Rev
    _sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if _sub is not None:
        cur_round = max(
            (r.round_number or 1 for r in (_sub.reviews or [])),
            default=1,
        )
        prior = (
            db.query(_EdDec)
            .filter(
                _EdDec.submission_id == submission_id,
                _EdDec.round_number == cur_round,
            )
            .first()
        )
        if prior is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A decision ({prior.decision}) has already been issued "
                    f"for round {cur_round}. Open a new round before deciding again."
                ),
            )

    submission = record_decision(db, submission_id, body.decision)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # JG — structured reject-reason. Only meaningful when the decision is
    # ``rejected``; for anything else we ignore the field entirely so
    # ``format_check_report`` stays untouched. That column is unstructured
    # today so a best-effort key-merge is safe — we never delete existing
    # keys, just set our own.
    reject_reason_code = body.reject_reason_code if body.decision == "rejected" else None
    if reject_reason_code is not None:
        current = submission.format_check_report or {}
        # SQLAlchemy JSON change tracking is opt-in per column. Since this
        # model doesn't use MutableDict, we must reassign the attribute for
        # the merged dict to be persisted on commit.
        if isinstance(current, dict):
            merged = {**current, "reject_reason_code": reject_reason_code}
        else:
            merged = {"reject_reason_code": reject_reason_code}
        submission.format_check_report = merged
        db.commit()
        db.refresh(submission)

    # Persist the decision to the editorial_decisions audit trail
    # (spec §13) — one row per (submission, round, editor). The
    # letter/editor_note are optional; the frontend sends the letter as
    # ``editor_comments`` when it's issued from the workspace.
    _persist_editorial_decision(
        db,
        submission=submission,
        editor_id=editor.id if editor else None,
        decision=body.decision,
        letter_text=body.editor_comments,
    )

    # Structured audit log entry — the reason code lives in ``meta`` so
    # analytics can group rejections by reason without parsing free text.
    audit = AuditLog(
        actor_id=editor.id if editor else None,
        actor_email=editor.email if editor else None,
        action="reviews.decision",
        target_type="submission",
        target_id=str(submission.id),
        ip_address=request.client.host if request.client else None,
        meta={
            "decision": body.decision,
            "reject_reason_code": reject_reason_code,
        },
    )
    db.add(audit)
    db.commit()

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

    transition_or_direct(db, submission, SubmissionStatus.pending_assignment)
    db.commit()
    db.refresh(submission)

    return {
        "submission_id": str(submission.id),
        "new_status": submission.status.value,
        "message": "Submission reopened for one additional reviewer assignment.",
    }