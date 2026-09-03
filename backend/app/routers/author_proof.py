"""Author Proof approval endpoints.

Once production sets a ``ProductionRecord.stage = author_proof_pending``
and uploads a proof PDF, the corresponding author gets these three
endpoints on the same submission:

* GET  /author-proof/submissions/{submission_id}
    Returns the current proof PDF URL, stage, and any prior author
    corrections. Ownership-gated.

* POST /author-proof/submissions/{submission_id}/approve
    Author signs off — flips stage to ``author_proof_approved``.
    Production can then move to ``final_pdf``.

* POST /author-proof/submissions/{submission_id}/request-correction
    Author flags corrections. Stage stays at ``author_proof_pending``
    (production knows to re-issue), the note is appended to
    ``author_corrections``, editorial inbox is pinged.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.production_stage import ProductionRecord
from app.models.submission import Submission
from app.services.auth_service import get_current_user


router = APIRouter()


class ProofView(BaseModel):
    submission_id: str
    manuscript_id: str
    paper_title: str
    stage: str
    proof_pdf_url: Optional[str] = None
    author_corrections: Optional[str] = None
    updated_at: datetime


class RequestCorrectionRequest(BaseModel):
    corrections: str = Field(..., min_length=1, max_length=8000)


class ProofActionResponse(BaseModel):
    ok: bool = True
    submission_id: str
    new_stage: str


def _load_owned_submission(db: Session, submission_id: uuid.UUID, user) -> Submission:
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    author_id = getattr(submission, "author_id", None)
    if author_id is not None and author_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorised to see this submission.")
    return submission


def _load_production(db: Session, submission_id: uuid.UUID) -> ProductionRecord:
    row = (
        db.query(ProductionRecord)
        .filter(ProductionRecord.submission_id == submission_id)
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="This manuscript has no production record yet — no proof to approve.",
        )
    return row


def _display_id(submission: Submission) -> str:
    return (
        getattr(submission, "paper_id_code", None)
        or f"#{str(submission.id)[:8]}"
        or "unassigned"
    )


@router.get("/submissions/{submission_id}", response_model=ProofView)
def get_proof(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> ProofView:
    submission = _load_owned_submission(db, submission_id, user)
    prod = _load_production(db, submission_id)
    return ProofView(
        submission_id=str(submission.id),
        manuscript_id=_display_id(submission),
        paper_title=submission.paper_title,
        stage=prod.stage,
        proof_pdf_url=prod.proof_pdf_url,
        author_corrections=prod.author_corrections,
        updated_at=prod.updated_at,
    )


@router.post("/submissions/{submission_id}/approve", response_model=ProofActionResponse)
def approve_proof(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> ProofActionResponse:
    """Author approves the current proof. Flips
    ``author_proof_pending → author_proof_approved`` — production
    picks it up from there. Idempotent: approving an already-approved
    row is a no-op that still returns 200.
    """
    submission = _load_owned_submission(db, submission_id, user)
    prod = _load_production(db, submission_id)

    if prod.stage not in ("author_proof_pending", "author_proof_approved"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Current stage is '{prod.stage}' — approval is only accepted "
                f"while the manuscript is waiting for author sign-off."
            ),
        )
    prod.stage = "author_proof_approved"
    db.commit()

    # Best-effort ping to editorial so production knows to move on.
    try:
        from app.services.email_service import _send_and_log, _wrap
        editor_inbox = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
        if editor_inbox:
            _send_and_log(
                editor_inbox,
                f"Author approved proof — {_display_id(submission)}",
                _wrap(
                    f"<p>The corresponding author has approved the proof for "
                    f"<strong>{submission.paper_title}</strong>. Production "
                    f"can move to <em>final_pdf</em>.</p>"
                ),
                "author_proof_approved",
            )
    except Exception:  # noqa: BLE001
        pass

    return ProofActionResponse(submission_id=str(submission.id), new_stage=prod.stage)


@router.post(
    "/submissions/{submission_id}/request-correction",
    response_model=ProofActionResponse,
)
def request_correction(
    submission_id: uuid.UUID,
    body: RequestCorrectionRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> ProofActionResponse:
    """Author sends a list of corrections back to production. The stage
    stays at ``author_proof_pending`` — production reads the new note,
    fixes the proof, and re-uploads. The correction history is
    accumulated on ``author_corrections`` so we never lose an ask.
    """
    submission = _load_owned_submission(db, submission_id, user)
    prod = _load_production(db, submission_id)

    if prod.stage not in ("author_proof_pending", "author_proof_approved"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Current stage is '{prod.stage}' — corrections can only be "
                f"raised while the manuscript is in author-proof review."
            ),
        )

    # Reopen if the author previously approved and now spotted an issue.
    prod.stage = "author_proof_pending"

    stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    entry = f"[{stamp}] {body.corrections.strip()}"
    prod.author_corrections = (
        f"{prod.author_corrections}\n\n{entry}"
        if prod.author_corrections else entry
    )
    db.commit()

    try:
        from app.services.email_service import _send_and_log, _wrap
        editor_inbox = settings.EDITORIAL_INBOX_EMAIL or settings.SENDGRID_FROM_EMAIL
        if editor_inbox:
            _send_and_log(
                editor_inbox,
                f"Author requested proof corrections — {_display_id(submission)}",
                _wrap(
                    f"<p>The corresponding author has requested corrections on "
                    f"the proof of <strong>{submission.paper_title}</strong>.</p>"
                    f"<pre style='background:#f3f4f6;padding:12px;border-radius:8px;"
                    f"white-space:pre-wrap;font-family:inherit;'>{body.corrections}</pre>"
                ),
                "author_proof_correction_request",
            )
    except Exception:  # noqa: BLE001
        pass

    return ProofActionResponse(submission_id=str(submission.id), new_stage=prod.stage)
