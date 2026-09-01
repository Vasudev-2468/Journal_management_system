"""
Author revision response endpoints (spec §17-18).

Powers the "Revision Required" workspace the author enters after the
editor decides Major or Minor Revision. Pairs the author's response
+ change location against each reviewer comment.

Endpoints
---------
GET  /author-revision/submissions/{submission_id}/checklist
    Aggregated Major/Minor reviewer comments across every submitted
    reviewer report on the submission's current round, with the
    author's response merged in where they've saved one. Confidential
    comments-to-editor are NEVER exposed here.

POST /author-revision/submissions/{submission_id}/response
    Upsert a single response {review_id, comment_kind, comment_index,
    response_text, change_location}. Returns the updated row.

GET  /author-revision/submissions/{submission_id}/responses
    Return every saved response for the submission — used by the
    author page on load to hydrate the form.

Every endpoint checks that the current user owns the submission
(author_id) — the author's revision work is never visible to another
author.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.review import Review, ReviewState
from app.models.revision_response import RevisionResponse
from app.models.submission import Submission
from app.services.auth_service import get_current_user


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class ReviewComment(BaseModel):
    review_id: str
    reviewer_display_name: str
    kind: str                    # "major" | "minor"
    index: int
    page: str = ""
    section: str = ""
    line: str = ""
    comment: str
    author_response: str = ""
    change_location: str = ""
    responded_at: Optional[datetime] = None


class RevisionChecklistResponse(BaseModel):
    submission_id: str
    round: int
    total: int
    responded: int
    comments: List[ReviewComment]


class ResponseUpsertRequest(BaseModel):
    review_id: uuid.UUID
    comment_kind: str = Field(..., pattern="^(major|minor)$")
    comment_index: int = Field(..., ge=0)
    response_text: str = Field("", max_length=8000)
    change_location: str = Field("", max_length=500)


class RevisionResponseDTO(BaseModel):
    id: int
    review_id: str
    comment_kind: str
    comment_index: int
    response_text: str
    change_location: str
    updated_at: datetime


# ── Helpers ─────────────────────────────────────────────

def _load_submission_owned(
    db: Session, submission_id: uuid.UUID, user
) -> Submission:
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    # Ownership: submissions.author_id — reject if this isn't the author's paper.
    author_id = getattr(submission, "author_id", None)
    if author_id is not None and author_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorised to see this submission.")
    return submission


def _load_reviewer_comments_json(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        return []
    return parsed if isinstance(parsed, list) else []


# ── Endpoints ───────────────────────────────────────────

@router.get(
    "/submissions/{submission_id}/checklist",
    response_model=RevisionChecklistResponse,
)
def get_checklist(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return the aggregated Major/Minor reviewer comments for this
    submission's current round, merged with any saved author
    responses. Confidential editor comments and rubric internals are
    never exposed."""
    submission = _load_submission_owned(db, submission_id, user)
    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    if not reviews:
        return RevisionChecklistResponse(
            submission_id=str(submission.id), round=1, total=0, responded=0, comments=[],
        )
    target_round = max(r.round_number or 1 for r in reviews)

    # Load every saved response for this submission in one shot.
    saved = (
        db.query(RevisionResponse)
        .filter(RevisionResponse.submission_id == submission.id)
        .all()
    )
    saved_by_key = {
        (str(s.review_id), s.comment_kind, s.comment_index): s for s in saved
    }

    comments: List[ReviewComment] = []
    for idx, review in enumerate(reviews, start=1):
        if (review.round_number or 1) != target_round:
            continue
        if review.state != ReviewState.submitted:
            continue
        display_name = f"Anonymous Reviewer #{idx}"
        for kind in ("major", "minor"):
            raw = review.major_comments if kind == "major" else review.minor_comments
            for i, row in enumerate(_load_reviewer_comments_json(raw)):
                if isinstance(row, str):
                    row = {"page": "", "section": "", "line": "", "comment": row}
                if not isinstance(row, dict):
                    continue
                text = str(row.get("comment") or "").strip()
                if not text:
                    continue
                key = (str(review.id), kind, i)
                s = saved_by_key.get(key)
                comments.append(ReviewComment(
                    review_id=str(review.id),
                    reviewer_display_name=display_name,
                    kind=kind,
                    index=i,
                    page=str(row.get("page") or ""),
                    section=str(row.get("section") or ""),
                    line=str(row.get("line") or ""),
                    comment=text,
                    author_response=s.response_text if s else "",
                    change_location=s.change_location if s else "",
                    responded_at=s.updated_at if s else None,
                ))
    responded = sum(1 for c in comments if c.author_response.strip())
    return RevisionChecklistResponse(
        submission_id=str(submission.id),
        round=target_round,
        total=len(comments),
        responded=responded,
        comments=comments,
    )


@router.post(
    "/submissions/{submission_id}/response",
    response_model=RevisionResponseDTO,
)
def upsert_response(
    submission_id: uuid.UUID,
    body: ResponseUpsertRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Save (or update) the author's response for one reviewer comment.

    The (review_id, kind, index) triple is the row key — repeated
    POSTs against the same triple overwrite the previous save. The
    reviewer comment itself is not modified; only the author's
    response payload is stored."""
    submission = _load_submission_owned(db, submission_id, user)

    # Verify the review belongs to this submission AND the comment
    # exists on that review — no silent creation of dangling rows.
    review = (
        db.query(Review)
        .filter(Review.id == body.review_id, Review.submission_id == submission.id)
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found on this submission.")
    raw = review.major_comments if body.comment_kind == "major" else review.minor_comments
    comments = _load_reviewer_comments_json(raw)
    if body.comment_index >= len(comments):
        raise HTTPException(
            status_code=404,
            detail=f"No {body.comment_kind} comment at index {body.comment_index} on this review.",
        )

    existing = (
        db.query(RevisionResponse)
        .filter(
            RevisionResponse.review_id == body.review_id,
            RevisionResponse.comment_kind == body.comment_kind,
            RevisionResponse.comment_index == body.comment_index,
        )
        .first()
    )
    now = datetime.utcnow()
    if existing is None:
        row = RevisionResponse(
            submission_id=submission.id,
            review_id=body.review_id,
            round_number=review.round_number or 1,
            comment_kind=body.comment_kind,
            comment_index=body.comment_index,
            response_text=body.response_text.strip(),
            change_location=body.change_location.strip(),
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row = existing
        row.response_text = body.response_text.strip()
        row.change_location = body.change_location.strip()
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return RevisionResponseDTO(
        id=row.id,
        review_id=str(row.review_id),
        comment_kind=row.comment_kind,
        comment_index=row.comment_index,
        response_text=row.response_text,
        change_location=row.change_location,
        updated_at=row.updated_at,
    )


@router.get(
    "/submissions/{submission_id}/responses",
    response_model=List[RevisionResponseDTO],
)
def list_responses(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    submission = _load_submission_owned(db, submission_id, user)
    rows = (
        db.query(RevisionResponse)
        .filter(RevisionResponse.submission_id == submission.id)
        .order_by(RevisionResponse.updated_at.desc())
        .all()
    )
    return [
        RevisionResponseDTO(
            id=r.id, review_id=str(r.review_id),
            comment_kind=r.comment_kind, comment_index=r.comment_index,
            response_text=r.response_text, change_location=r.change_location,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
