"""Add reject_and_resubmit to SubmissionStatus enum.

The editor's "Reject and Resubmit" decision now maps to a distinct
SubmissionStatus so the author dashboard can surface an "Invitation
to resubmit" state instead of a plain rejection.

Revision ID: cc5a0y8q4r5s
Revises: bb4z9x7p2q3r
Create Date: 2026-09-02
"""
from alembic import op


revision = "cc5a0y8q4r5s"
down_revision = "bb4z9x7p2q3r"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres enum value additions are transactional in recent
    # versions; use raw SQL for compatibility.
    # Enum type is named ``submission_status`` in this schema (declared
    # in models/submission.py with ``Enum(SubmissionStatus, name="submission_status")``).
    # The original literal ``submissionstatus`` was the default SQLAlchemy
    # would emit if no explicit ``name=`` were passed — but it was passed,
    # so the type has always been snake_case here.
    op.execute("ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'reject_and_resubmit'")


def downgrade() -> None:
    # Enum values cannot be dropped from a Postgres enum without a
    # full recreate. No-op downgrade.
    pass
