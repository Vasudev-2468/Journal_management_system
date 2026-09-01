"""Add invitation_sent_at + invitation_revoked_at to reviewers.

Powers the editor's Reviewers panel "resend / revoke / delete"
lifecycle. A nullable ``invitation_sent_at`` is stamped when the
activation email is dispatched; ``invitation_revoked_at`` is stamped
when the editor revokes a pending invite, at which point any
outstanding activation token is refused by
``reviewer_auth.set_password``.

Revision ID: s5q0o8f9g3m4
Revises: r4p9n7e8f2l3
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "s5q0o8f9g3m4"
down_revision = "r4p9n7e8f2l3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reviewers",
        sa.Column("invitation_sent_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "reviewers",
        sa.Column("invitation_revoked_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviewers", "invitation_revoked_at")
    op.drop_column("reviewers", "invitation_sent_at")
