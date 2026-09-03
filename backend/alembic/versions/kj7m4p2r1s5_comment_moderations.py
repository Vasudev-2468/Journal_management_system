"""Editorial comment moderation table (JG-Editor-Moderation).

One row per reviewer comment being moderated by the editor. The
reviewer's original wording is copied verbatim on creation and never
modified — the editor's rewrite lives in ``edited_text``. The
author-facing API is required to filter to (visibility ==
'AUTHOR_VISIBLE' AND status == 'RELEASED_TO_AUTHOR') so unmoderated /
confidential / removed comments never leak to the author.

Revision ID: kj7m4p2r1s5
Revises: gg9e4c2u8v9w
Create Date: 2026-09-03
"""
from alembic import op
import sqlalchemy as sa


revision = "kj7m4p2r1s5"
down_revision = "gg9e4c2u8v9w"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comment_moderations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("comment_kind", sa.String(8), nullable=False),
        sa.Column("comment_index", sa.Integer(), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("edited_text", sa.Text(), nullable=True),
        sa.Column("editor_note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="EDITOR_REVIEW"),
        sa.Column("visibility", sa.String(32), nullable=False, server_default="AUTHOR_VISIBLE"),
        sa.Column("consolidated_into", sa.Integer(), nullable=True),
        sa.Column("released_text", sa.Text(), nullable=True),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("released_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["review_id"], ["reviews.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["consolidated_into"], ["comment_moderations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["released_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "review_id", "comment_kind", "comment_index",
            name="uq_moderation_addressing",
        ),
    )
    op.create_index("ix_comment_moderations_review_id", "comment_moderations", ["review_id"])
    op.create_index("ix_moderation_status", "comment_moderations", ["status"])
    op.create_index("ix_moderation_visibility", "comment_moderations", ["visibility"])


def downgrade() -> None:
    op.drop_index("ix_moderation_visibility", table_name="comment_moderations")
    op.drop_index("ix_moderation_status", table_name="comment_moderations")
    op.drop_index("ix_comment_moderations_review_id", table_name="comment_moderations")
    op.drop_table("comment_moderations")
