"""
Agent 4: Review Link Generator

For each assigned reviewer:
  - Generates a unique, secure, one-time token (JWT with expiry)
  - Creates Review records in the database
  - Produces secure review URLs

Communicates with Agent 5 (Notification Bot) to send invitations.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import List
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.review import Review, ReviewStatus
from app.models.reviewer import Reviewer
from app.models.submission import Submission, SubmissionStatus

logger = logging.getLogger(__name__)


class ReviewLinkGeneratorAgent:
    """System Agent 4: Secure Review Link Generator."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        submission: Submission,
        reviewer_ids: List[uuid.UUID],
        agent3_result: dict = None,
    ) -> dict:
        """
        Create secure review links for each assigned reviewer.
        Returns review data for Agent 5 to send notifications.
        """
        paper_id = submission.paper_id_code
        results = {
            "agent": "ReviewLinkGeneratorAgent",
            "paper_id_code": paper_id,
            "submission_id": str(submission.id),
            "reviews_created": [],
            "errors": [],
        }

        for rid in reviewer_ids:
            reviewer = self.db.query(Reviewer).filter(Reviewer.id == rid).first()
            if reviewer is None:
                results["errors"].append(f"Reviewer {rid} not found")
                continue

            if reviewer.current_load >= reviewer.max_assignments:
                results["errors"].append(
                    f"Reviewer {reviewer.name} at max capacity ({reviewer.max_assignments})"
                )
                continue

            # Check for existing pending review
            existing = (
                self.db.query(Review)
                .filter(
                    Review.submission_id == submission.id,
                    Review.reviewer_id == rid,
                    Review.status == ReviewStatus.pending,
                )
                .first()
            )
            if existing:
                results["errors"].append(f"Reviewer {reviewer.name} already assigned")
                continue

            # Generate secure token
            token = secrets.token_urlsafe(48)
            expiry = datetime.utcnow() + timedelta(days=21)

            # Create review record
            review = Review(
                submission_id=submission.id,
                reviewer_id=rid,
                link_token=token,
                link_expires_at=expiry,
                status=ReviewStatus.pending,
            )
            self.db.add(review)
            reviewer.current_load += 1

            review_url = f"{settings.FRONTEND_URL}/review/{token}"

            results["reviews_created"].append({
                "review_id": None,  # Will be set after commit
                "reviewer_id": str(rid),
                "reviewer_name": reviewer.name,
                "reviewer_email": reviewer.email,
                "reviewer_whatsapp": reviewer.whatsapp_number,
                "review_url": review_url,
                "token": token,
                "expires_at": expiry.isoformat(),
            })

        # Update submission status
        submission.status = SubmissionStatus.under_review
        self.db.commit()

        # Update review IDs after commit
        for item in results["reviews_created"]:
            review = (
                self.db.query(Review)
                .filter(Review.link_token == item["token"])
                .first()
            )
            if review:
                item["review_id"] = str(review.id)

        results["total_created"] = len(results["reviews_created"])
        results["next_agent"] = "NotificationBotAgent"
        logger.info(
            "Agent 4 completed for %s — %d review links created",
            paper_id, len(results["reviews_created"])
        )
        return results
