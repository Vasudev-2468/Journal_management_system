"""
Editor Portal API — Agent-based editorial workflow endpoints.

Provides endpoints for:
  - Consult party format review & reviewer suggestion
  - Editor reviewer assignment with agent pipeline
  - Format check report retrieval
  - Submission agent status
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.editor_auth import require_editor_mfa
from app.models.submission import Submission, SubmissionStatus
from app.tasks import (
    run_agent_intake_pipeline,
    run_agent_reviewer_suggestion,
    run_agent_reviewer_assignment,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────

class ConsultPartyReviewerSuggestion(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    orcid: Optional[str] = ""
    affiliation: Optional[str] = ""
    expertise: Optional[str] = ""


class ConsultPartyDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject)$")
    comments: Optional[str] = ""
    suggested_reviewers: List[ConsultPartyReviewerSuggestion] = Field(default_factory=list)


class TriggerAgentPipelineRequest(BaseModel):
    consult_party_email: Optional[EmailStr] = None


class EditorAssignReviewersRequest(BaseModel):
    reviewer_ids: List[uuid.UUID] = Field(..., min_length=2, max_length=4)


class FormatCheckReportResponse(BaseModel):
    paper_id_code: Optional[str]
    overall: Optional[str]
    checks: Optional[list] = []
    checked_at: Optional[str]
    passed: int = 0
    warnings: int = 0
    failures: int = 0


class SubmissionAgentStatusResponse(BaseModel):
    submission_id: uuid.UUID
    paper_id_code: Optional[str]
    status: str
    format_check_report: Optional[dict] = None
    consult_party_email: Optional[str] = None
    consult_party_decision: Optional[str] = None
    suggested_reviewers: Optional[list] = None


# ── Endpoints ────────────────────────────────────────────

@router.post("/trigger-pipeline/{submission_id}")
def trigger_agent_pipeline(
    submission_id: uuid.UUID,
    body: TriggerAgentPipelineRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Manually trigger the agent intake pipeline (Stages 1+2) for a submission."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    run_agent_intake_pipeline.delay(
        str(submission_id),
        consult_party_email=body.consult_party_email,
    )
    return {
        "message": "Agent pipeline triggered",
        "submission_id": str(submission_id),
        "stages": "1 (Acknowledgement) + 2 (Format Validation)",
    }


@router.get("/format-report/{submission_id}", response_model=FormatCheckReportResponse)
def get_format_report(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get the format check report for a submission (requires MFA-verified editor)."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    report = submission.format_check_report or {}
    return FormatCheckReportResponse(
        paper_id_code=submission.paper_id_code,
        overall=report.get("overall"),
        checks=report.get("checks", []),
        checked_at=report.get("checked_at"),
        passed=report.get("passed", 0),
        warnings=report.get("warnings", 0),
        failures=report.get("failures", 0),
    )


@router.post("/consult-party-decision/{submission_id}")
def submit_consult_party_decision(
    submission_id: uuid.UUID,
    body: ConsultPartyDecisionRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """
    Consult party submits their format review decision + optional reviewer suggestions.
    Triggers Agent 3 (Reviewer Suggester).
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status not in (
        SubmissionStatus.awaiting_consult_review,
        SubmissionStatus.awaiting_format_check,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Submission is not awaiting consult review (current: {submission.status.value})",
        )

    # Record decision
    submission.consult_party_decision = body.decision
    submission.consult_party_comments = body.comments
    db.commit()

    if body.decision == "reject":
        # Return to author
        submission.status = SubmissionStatus.returned_to_author
        db.commit()
        return {
            "message": "Paper returned to author for revision",
            "submission_id": str(submission_id),
            "decision": "reject",
        }

    # Approved — trigger Agent 3 with provided reviewers
    provided = [r.dict() for r in body.suggested_reviewers] if body.suggested_reviewers else None
    run_agent_reviewer_suggestion.delay(str(submission_id), provided_reviewers=provided)

    return {
        "message": "Decision recorded. Reviewer suggestion agent triggered.",
        "submission_id": str(submission_id),
        "decision": "approve",
        "reviewers_suggested": len(body.suggested_reviewers),
    }


@router.get("/agent-status/{submission_id}", response_model=SubmissionAgentStatusResponse)
def get_agent_status(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get current agent pipeline status for a submission."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    return SubmissionAgentStatusResponse(
        submission_id=submission.id,
        paper_id_code=submission.paper_id_code,
        status=submission.status.value,
        format_check_report=submission.format_check_report,
        consult_party_email=submission.consult_party_email,
        consult_party_decision=submission.consult_party_decision,
        suggested_reviewers=submission.suggested_reviewers_data,
    )


@router.get("/suggested-reviewers/{submission_id}")
def get_suggested_reviewers(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """Get auto-suggested reviewers for editor to review and assign."""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    return {
        "submission_id": str(submission_id),
        "paper_id_code": submission.paper_id_code,
        "suggestions": submission.suggested_reviewers_data or [],
        "consult_party_decision": submission.consult_party_decision,
    }


@router.post("/assign-reviewers/{submission_id}")
def editor_assign_reviewers(
    submission_id: uuid.UUID,
    body: EditorAssignReviewersRequest,
    db: Session = Depends(get_db),
    user=Depends(require_editor_mfa),
):
    """
    Editor finalizes reviewer selection.
    Triggers Agent 4 (Link Generator) + Agent 5 (Notification Bot).
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    run_agent_reviewer_assignment.delay(
        str(submission_id),
        [str(rid) for rid in body.reviewer_ids],
    )

    return {
        "message": "Reviewer assignment triggered via agent pipeline",
        "submission_id": str(submission_id),
        "reviewer_count": len(body.reviewer_ids),
        "stages": "4 (Link Generation) + 5 (Notifications)",
    }
