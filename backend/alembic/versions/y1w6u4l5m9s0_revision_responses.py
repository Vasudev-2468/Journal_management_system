"""Author revision responses (spec §18).

One row per (review comment, author response). Pairs the author's
reply + location-of-change against each Major/Minor reviewer comment
identified by ``review_id + comment_kind + comment_index``.

Revision ID: y1w6u4l5m9s0
Revises: x0v5t3k4l8r9
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "y1w6u4l5m9s0"
down_revision = "x0v5t3k4l8r9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revision_responses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("review_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("comment_kind", sa.String(length=8), nullable=False),
        sa.Column("comment_index", sa.Integer(), nullable=False),
        sa.Column("response_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("change_location", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["review_id"], ["reviews.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "review_id", "comment_kind", "comment_index",
            name="uq_revision_response_comment",
        ),
    )
    op.create_index("ix_revision_responses_submission_id", "revision_responses", ["submission_id"])
    op.create_index("ix_revision_responses_review_id", "revision_responses", ["review_id"])


def downgrade() -> None:
    op.drop_index("ix_revision_responses_review_id", table_name="revision_responses")
    op.drop_index("ix_revision_responses_submission_id", table_name="revision_responses")
    op.drop_table("revision_responses")
