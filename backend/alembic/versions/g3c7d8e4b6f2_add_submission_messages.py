"""add submission_messages table

Revision ID: g3c7d8e4b6f2
Revises: f2b6c8d3e5a1
Create Date: 2026-08-31

Adds the author ↔ editor message thread attached to a submission.
"""

from alembic import op
import sqlalchemy as sa


revision = "g3c7d8e4b6f2"
down_revision = "f2b6c8d3e5a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "submission_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "submission_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_role", sa.String(length=20), nullable=False),
        sa.Column("sender_email", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "is_from_editor",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("read_by_author_at", sa.DateTime(), nullable=True),
        sa.Column("read_by_editor_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_submission_messages_submission_id",
        "submission_messages",
        ["submission_id"],
    )
    op.create_index(
        "ix_submission_messages_created_at",
        "submission_messages",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_submission_messages_created_at",
        table_name="submission_messages",
    )
    op.drop_index(
        "ix_submission_messages_submission_id",
        table_name="submission_messages",
    )
    op.drop_table("submission_messages")
