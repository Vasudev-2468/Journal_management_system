"""Reviewer active sessions table.

Revision ID: dd6b1z9r5s6t
Revises: cc5a0y8q4r5s
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "dd6b1z9r5s6t"
down_revision = "cc5a0y8q4r5s"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reviewer_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reviewer_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_label", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["reviewer_id"], ["reviewers.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("token_hash", name="uq_reviewer_sessions_token_hash"),
    )
    op.create_index("ix_reviewer_sessions_reviewer_id", "reviewer_sessions", ["reviewer_id"])
    op.create_index("ix_reviewer_sessions_token_hash", "reviewer_sessions", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_reviewer_sessions_token_hash", table_name="reviewer_sessions")
    op.drop_index("ix_reviewer_sessions_reviewer_id", table_name="reviewer_sessions")
    op.drop_table("reviewer_sessions")
