"""Add extended profile columns to editorial_board_members.

Adds phone, keywords, years_editorial_experience, and
max_active_manuscripts so the Add Board Member wizard can capture the
15-field minimum profile without stuffing everything into a JSON blob.

Revision ID: r4p9n7e8f2l3
Revises: 9c3a389c08af
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "r4p9n7e8f2l3"
down_revision = "9c3a389c08af"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "editorial_board_members",
        sa.Column("phone", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "editorial_board_members",
        sa.Column("keywords", sa.Text(), nullable=True),
    )
    op.add_column(
        "editorial_board_members",
        sa.Column("years_editorial_experience", sa.Integer(), nullable=True),
    )
    op.add_column(
        "editorial_board_members",
        sa.Column("max_active_manuscripts", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("editorial_board_members", "max_active_manuscripts")
    op.drop_column("editorial_board_members", "years_editorial_experience")
    op.drop_column("editorial_board_members", "keywords")
    op.drop_column("editorial_board_members", "phone")
