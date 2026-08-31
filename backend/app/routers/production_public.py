"""Author-scoped view onto the production pipeline.

The full production queue lives behind the editor MFA gate — authors must
not see other authors' in-progress copy edits, DOIs, or proof PDFs. But
once a paper has crossed the finish line (production stage == 'published'),
the author has a legitimate need to point colleagues at the final PDF and
DOI without hunting through the discovery UI. This router exposes only
that terminal, publicly-visible subset, scoped to the caller's own papers.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.production_stage import ProductionRecord
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


class MyPublishedRecord(BaseModel):
    submission_id: str
    paper_title: str
    doi: Optional[str] = None
    published_at: Optional[datetime] = None
    final_pdf_url: Optional[str] = None


@router.get("/my-published", response_model=List[MyPublishedRecord])
def my_published_papers(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return production records at stage `published` for the caller's accepted submissions.

    Ordered newest-first by `published_at`; a record without a
    `published_at` timestamp (should not normally happen for a
    published-stage row, but the DB permits it) is sorted last so the
    author's most recently released work is at the top of the list.
    """
    caller_email = (user.email or "").strip().lower()
    if not caller_email:
        return []

    # Join production_records → submissions and filter to the caller's own
    # accepted papers currently at the `published` production stage.
    rows = (
        db.query(ProductionRecord, Submission)
        .join(Submission, ProductionRecord.submission_id == Submission.id)
        .filter(
            ProductionRecord.stage == "published",
            Submission.status == SubmissionStatus.accepted,
        )
        .all()
    )

    scoped = [
        (record, submission)
        for record, submission in rows
        if (submission.author_email or "").strip().lower() == caller_email
    ]

    # Sort newest-first; None published_at sinks to the bottom.
    scoped.sort(
        key=lambda pair: (pair[0].published_at or datetime.min),
        reverse=True,
    )

    return [
        MyPublishedRecord(
            submission_id=str(submission.id),
            paper_title=submission.paper_title,
            doi=record.doi,
            published_at=record.published_at,
            final_pdf_url=record.final_pdf_url,
        )
        for record, submission in scoped
    ]
