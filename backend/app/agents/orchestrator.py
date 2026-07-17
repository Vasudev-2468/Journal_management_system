"""
Agent Orchestrator

Coordinates the 5 agents in the editorial portal workflow.
Each agent receives the output of the previous agent, enabling
inter-agent communication through a shared pipeline context.

Pipeline:
  Submission → Agent 1 (Acknowledge) → Agent 2 (Format Check)
  → Agent 3 (Reviewer Suggest) → Agent 4 (Link Gen) → Agent 5 (Notify)
"""

import logging
from datetime import datetime
from typing import List, Optional
import uuid

from sqlalchemy.orm import Session

from app.models.submission import Submission, SubmissionStatus
from app.agents.agent1_acknowledgement import AcknowledgementAgent
from app.agents.agent2_format_validation import FormatValidationAgent
from app.agents.agent3_reviewer_suggester import ReviewerSuggesterAgent
from app.agents.agent4_link_generator import ReviewLinkGeneratorAgent
from app.agents.agent5_notification import NotificationBotAgent

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """
    Coordinates all 5 agents, passing results between them.
    Each method represents a pipeline stage that can be called
    independently (e.g., from Celery tasks) or chained together.
    """

    def __init__(self, db: Session):
        self.db = db
        self.pipeline_context = {}

    def generate_paper_id(self, submission: Submission) -> str:
        """Generate a human-readable paper ID like JGAIR-2026-0001."""
        if submission.paper_id_code:
            return submission.paper_id_code

        year = datetime.utcnow().year
        # Count existing submissions this year
        count = (
            self.db.query(Submission)
            .filter(Submission.paper_id_code.isnot(None))
            .filter(Submission.paper_id_code.like(f"JGAIR-{year}-%"))
            .count()
        )
        paper_id = f"JGAIR-{year}-{count + 1:04d}"
        submission.paper_id_code = paper_id
        self.db.commit()
        return paper_id

    # ── Stage 1: Submission Acknowledgement ────────────────

    def run_acknowledgement(
        self,
        submission_id: uuid.UUID,
        consult_party_email: Optional[str] = None,
    ) -> dict:
        """
        Stage 1: Generate paper ID and send acknowledgements.
        Called immediately when a submission is received.
        """
        submission = self.db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        # Assign consult party if provided
        if consult_party_email:
            submission.consult_party_email = consult_party_email
            self.db.commit()

        # Generate paper ID
        self.generate_paper_id(submission)

        agent1 = AcknowledgementAgent(self.db)
        result = agent1.execute(submission)
        self.pipeline_context["agent1"] = result
        return result

    # ── Stage 2: Format Validation ─────────────────────────

    def run_format_validation(self, submission_id: uuid.UUID) -> dict:
        """
        Stage 2: Run format checks and send report to consult party.
        Called after Stage 1 (can be immediate or async via Celery).
        """
        submission = self.db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        agent2 = FormatValidationAgent(self.db)
        result = agent2.execute(submission, self.pipeline_context.get("agent1"))
        self.pipeline_context["agent2"] = result
        return result

    # ── Stage 3: Reviewer Suggestion ───────────────────────

    def run_reviewer_suggestion(
        self,
        submission_id: uuid.UUID,
        provided_reviewers: Optional[List[dict]] = None,
    ) -> dict:
        """
        Stage 3: Suggest or validate reviewers.
        Called when consult party submits their response, or after format check.
        """
        submission = self.db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        agent3 = ReviewerSuggesterAgent(self.db)
        result = agent3.execute(
            submission,
            provided_reviewers=provided_reviewers,
            agent2_result=self.pipeline_context.get("agent2"),
        )
        self.pipeline_context["agent3"] = result
        return result

    # ── Stage 4 + 5: Assign Reviewers + Send Notifications ─

    def run_reviewer_assignment(
        self,
        submission_id: uuid.UUID,
        reviewer_ids: List[uuid.UUID],
    ) -> dict:
        """
        Stage 4+5: Create review links and send invitations.
        Called when editor finalizes reviewer selection.
        """
        submission = self.db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            raise ValueError(f"Submission {submission_id} not found")

        # Agent 4: Generate review links
        agent4 = ReviewLinkGeneratorAgent(self.db)
        agent4_result = agent4.execute(
            submission,
            reviewer_ids,
            self.pipeline_context.get("agent3"),
        )
        self.pipeline_context["agent4"] = agent4_result

        # Agent 5: Send notifications
        agent5 = NotificationBotAgent(self.db)
        agent5_result = agent5.execute(agent4_result)
        self.pipeline_context["agent5"] = agent5_result

        return {
            "agent4": agent4_result,
            "agent5": agent5_result,
        }

    # ── Full Pipeline (Stages 1+2) ─────────────────────────

    def run_intake_pipeline(
        self,
        submission_id: uuid.UUID,
        consult_party_email: Optional[str] = None,
    ) -> dict:
        """
        Run Stages 1+2 automatically on new submission.
        Stages 3-5 require human input (consult party / editor decisions).
        """
        result1 = self.run_acknowledgement(submission_id, consult_party_email)
        result2 = self.run_format_validation(submission_id)

        return {
            "agent1": result1,
            "agent2": result2,
            "pipeline_status": "awaiting_consult_review",
            "next_action": "Consult party must review format report and suggest reviewers",
        }

    # ── Review Completion Handler ──────────────────────────

    def handle_review_submitted(
        self,
        paper_id_code: str,
        submission_id: str,
        reviewer_name: str,
        recommendation: str,
        all_complete: bool = False,
    ) -> dict:
        """Called by the review submission endpoint to trigger Agent 5 notifications."""
        agent5 = NotificationBotAgent(self.db)
        return agent5.send_review_complete_alert(
            paper_id_code=paper_id_code,
            submission_id=submission_id,
            reviewer_name=reviewer_name,
            recommendation=recommendation,
            all_complete=all_complete,
        )
