"""Editor-facing view over the persisted plagiarism-check history.

The public /ai/plagiarism endpoint returns only the current run's score.
Editors reviewing a manuscript over its lifecycle want to see every past
screening — who ran it, when, and against which article the highest
similarity was recorded. That log lives in ``plagiarism_checks``; this
router surfaces it read-only, gated behind the same MFA-verified editor
dependency the rest of the editor portal uses.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.plagiarism_check import PlagiarismCheck
from app.schemas.plagiarism_check import PlagiarismCheckRead
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


@router.get("/plagiarism-checks", response_model=List[PlagiarismCheckRead])
def list_plagiarism_checks(
    submission_id: Optional[str] = Query(
        default=None,
        description="Filter to checks for a specific submission id.",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """List past plagiarism screenings, newest first.

    Filters:
      * ``submission_id`` — narrow to a single manuscript's screening trail.
    """
    q = db.query(PlagiarismCheck)
    if submission_id:
        q = q.filter(PlagiarismCheck.submission_id == submission_id)
    return (
        q.order_by(PlagiarismCheck.created_at.desc())
        .limit(limit)
        .all()
    )
