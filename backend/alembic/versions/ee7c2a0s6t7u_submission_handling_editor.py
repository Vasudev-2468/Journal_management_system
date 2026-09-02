"""Add handling_editor_id to submissions.

Powers the "assign to me / delegate to X" flow. Nullable — legacy
submissions stay unassigned until an editor claims them.

Revision ID: ee7c2a0s6t7u
Revises: dd6b1z9r5s6t
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "ee7c2a0s6t7u"
down_revision = "dd6b1z9r5s6t"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("handling_editor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_submissions_handling_editor",
        "submissions", "users",
        ["handling_editor_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_submissions_handling_editor_id", "submissions", ["handling_editor_id"])


def downgrade() -> None:
    op.drop_index("ix_submissions_handling_editor_id", table_name="submissions")
    op.drop_constraint("fk_submissions_handling_editor", "submissions", type_="foreignkey")
    op.drop_column("submissions", "handling_editor_id")
