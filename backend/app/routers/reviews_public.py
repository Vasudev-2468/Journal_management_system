"""Author-scoped reviewer packet — anonymised, read-only.

The editor-facing `/reviews/{submission_id}` endpoint carries every field on
a review, including reviewer identity and the private `comments_to_editor`.
Authors must never see either of those, but they DO have a legitimate need
to read reviewer feedback once the editorial decision is out. This router
exposes a strictly redacted view scoped to the caller's own submissions.

Redaction rules — enforced by the response builder itself, not by
downstream serialisers — so a mistake in a Pydantic model cannot leak an
attribute here:

* Never include `reviewer_name`, `reviewer_email`, reviewer_id, or any
  join to the Reviewer row.
* Never include `comments_to_editor` (the confidential channel between
  reviewer and editor).
* Only surface reviews whose `status == 'completed'` — a pending review is
  privileged editorial information until submitted.
* Only surface anything at all once the editor has actually landed a
  decision (submission.status is one of accepted / rejected /
  revision_requested / returned_to_author). Before that, return an empty
  list — the packet is not yet released.
* Enforce ownership: the authenticated user's email must match the
  submission's author_email.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


# Statuses that indicate the editorial decision has been landed and the
# author is now allowed to see the reviewer feedback packet.
_DECISION_STATUSES = {
    SubmissionStatus.revision_requested,
    SubmissionStatus.returned_to_author,
    SubmissionStatus.accepted,
    SubmissionStatus.rejected,
}


class AnonymisedReviewerEntry(BaseModel):
    reviewer_alias: str
    overall_recommendation: Optional[str] = None
    comments_to_authors: Optional[str] = None
    completed_at: Optional[datetime] = None


@router.get(
    "/for-my-submission/{submission_id}",
    response_model=List[AnonymisedReviewerEntry],
)
def anonymised_reviews_for_my_submission(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the anonymised reviewer packet for the caller's submission.

    404 if the submission does not exist or is not owned by the caller
    (never disclose the difference — an author probing UUIDs must not be
    able to distinguish "not yours" from "does not exist").
    """
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Ownership check — case-insensitive to survive minor email casing
    # differences between registration and manuscript metadata.
    author_email = (submission.author_email or "").strip().lower()
    caller_email = (user.email or "").strip().lower()
    if not author_email or author_email != caller_email:
        # Deliberately identical to the not-found branch above.
        raise HTTPException(status_code=404, detail="Submission not found")

    # Packet only released once the editorial decision has been recorded.
    if submission.status not in _DECISION_STATUSES:
        return []

    completed = (
        db.query(Review)
        .filter(
            Review.submission_id == submission_id,
            Review.status == ReviewStatus.completed,
        )
        .order_by(Review.completed_at.asc(), Review.assigned_at.asc())
        .all()
    )

    entries: List[AnonymisedReviewerEntry] = []
    for idx, r in enumerate(completed, start=1):
        entries.append(
            AnonymisedReviewerEntry(
                reviewer_alias=f"Reviewer {idx}",
                overall_recommendation=(
                    r.overall_recommendation.value
                    if r.overall_recommendation is not None
                    else None
                ),
                comments_to_authors=r.comments_to_authors,
                completed_at=r.completed_at,
            )
        )
    return entries
