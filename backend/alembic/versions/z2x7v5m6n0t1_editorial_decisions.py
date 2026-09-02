"""Editorial decisions audit trail (spec §13).

One row per editor decision on a manuscript — captures decision,
round_number, editor_id, the final decision letter, an internal
editor_note, and decided_at. Complements the submission-level status
field (kept for pipeline compatibility) with a full per-round audit
trail.

Revision ID: z2x7v5m6n0t1
Revises: y1w6u4l5m9s0
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "z2x7v5m6n0t1"
down_revision = "y1w6u4l5m9s0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "editorial_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("editor_id", sa.Integer(), nullable=True),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("letter_text", sa.Text(), nullable=True),
        sa.Column("editor_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["editor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_editorial_decisions_submission_id", "editorial_decisions", ["submission_id"])
    op.create_index("ix_editorial_decisions_editor_id", "editorial_decisions", ["editor_id"])


def downgrade() -> None:
    op.drop_index("ix_editorial_decisions_editor_id", table_name="editorial_decisions")
    op.drop_index("ix_editorial_decisions_submission_id", table_name="editorial_decisions")
    op.drop_table("editorial_decisions")
