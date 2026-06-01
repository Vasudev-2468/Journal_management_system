"""
Agent 0: Author Profile Collection Agent

Runs after author completes two-step authentication.
Collects and validates author details before allowing paper submission.

Responsibilities:
  - Validate author profile completeness (name, email, institution, WhatsApp)
  - Create a profile snapshot attached to each submission
  - Flag incomplete profiles and prompt for completion
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger(__name__)


class AuthorProfileAgent:
    """System Agent 0: Author Profile Collection & Validation."""

    REQUIRED_FIELDS = ["full_name", "email", "whatsapp_number", "institution"]

    def __init__(self, db: Session):
        self.db = db

    def execute(self, user: User) -> dict:
        """
        Validate and collect author details.
        Returns dict with profile status and any missing fields.
        """
        result = {
            "agent": "AuthorProfileAgent",
            "user_id": user.id,
            "email": user.email,
            "profile_complete": True,
            "missing_fields": [],
            "collected_profile": {},
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Check required fields
        for field in self.REQUIRED_FIELDS:
            value = getattr(user, field, None)
            if not value or (isinstance(value, str) and not value.strip()):
                result["missing_fields"].append(field)
                result["profile_complete"] = False

        # Collect the profile snapshot
        result["collected_profile"] = {
            "full_name": user.full_name or "",
            "email": user.email,
            "whatsapp_number": user.whatsapp_number or "",
            "institution": user.institution or "",
            "orcid": user.orcid or "",
            "research_areas": user.research_areas or "",
            "mfa_email_verified": user.mfa_email_verified_at is not None,
            "mfa_whatsapp_verified": user.mfa_whatsapp_verified_at is not None,
            "two_step_auth_complete": (
                user.mfa_email_verified_at is not None
                and user.mfa_whatsapp_verified_at is not None
            ),
        }

        if result["profile_complete"]:
            logger.info(
                "Agent 0: Author profile complete for %s (%s)",
                user.full_name,
                user.email,
            )
        else:
            logger.warning(
                "Agent 0: Incomplete profile for %s — missing: %s",
                user.email,
                result["missing_fields"],
            )

        return result

    def create_submission_snapshot(self, user: User) -> dict:
        """
        Create a frozen snapshot of author details to attach to a submission.
        This ensures we have a record even if the author updates their profile later.
        """
        return {
            "author_name": user.full_name,
            "author_email": user.email,
            "author_whatsapp": user.whatsapp_number,
            "author_institution": user.institution,
            "author_orcid": user.orcid or "",
            "author_research_areas": user.research_areas or "",
            "snapshot_taken_at": datetime.utcnow().isoformat(),
            "mfa_verified": True,
        }
