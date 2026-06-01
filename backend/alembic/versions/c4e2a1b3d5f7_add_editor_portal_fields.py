"""add editor portal fields

Revision ID: c4e2a1b3d5f7
Revises: ad39f7a638c9
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "c4e2a1b3d5f7"
down_revision = "ad39f7a638c9"
branch_labels = None
depends_on = None


def upgrade():
    # New submission statuses
    op.execute("ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'awaiting_format_check'")
    op.execute("ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'awaiting_consult_review'")
    op.execute("ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'awaiting_reviewer_suggestions'")
    op.execute("ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'returned_to_author'")

    # New columns on submissions
    op.add_column("submissions", sa.Column("format_check_report", JSON))
    op.add_column("submissions", sa.Column("format_check_completed_at", sa.DateTime))
    op.add_column("submissions", sa.Column("consult_party_email", sa.String(255)))
    op.add_column("submissions", sa.Column("consult_party_decision", sa.String(50)))
    op.add_column("submissions", sa.Column("consult_party_comments", sa.Text))
    op.add_column("submissions", sa.Column("suggested_reviewers_data", JSON))
    op.add_column("submissions", sa.Column("paper_id_code", sa.String(50)))
    op.create_index("ix_submissions_paper_id_code", "submissions", ["paper_id_code"], unique=True)


def downgrade():
    op.drop_index("ix_submissions_paper_id_code", "submissions")
    op.drop_column("submissions", "paper_id_code")
    op.drop_column("submissions", "suggested_reviewers_data")
    op.drop_column("submissions", "consult_party_comments")
    op.drop_column("submissions", "consult_party_decision")
    op.drop_column("submissions", "consult_party_email")
    op.drop_column("submissions", "format_check_completed_at")
    op.drop_column("submissions", "format_check_report")
