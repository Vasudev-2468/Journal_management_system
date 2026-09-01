"""Add accept/decline/expires columns to reviewers.

Powers the new "invite → Accept/Reject → auto-revoke after 21 days"
panel flow. The invitation email now carries auto-generated
credentials plus signed Accept and Reject links; the reviewer's
choice (or the scheduled agent's timeout) is stamped into these
three timestamps.

Revision ID: t6r1p9g0h4n5
Revises: s5q0o8f9g3m4
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "t6r1p9g0h4n5"
down_revision = "s5q0o8f9g3m4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reviewers",
        sa.Column("invitation_expires_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "reviewers",
        sa.Column("invitation_accepted_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "reviewers",
        sa.Column("invitation_declined_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviewers", "invitation_declined_at")
    op.drop_column("reviewers", "invitation_accepted_at")
    op.drop_column("reviewers", "invitation_expires_at")
