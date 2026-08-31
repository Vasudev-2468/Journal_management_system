"""extend editorial_board_members with full academic-profile fields

Revision ID: e9a1c4b2d7f5
Revises: d8f3e6c2a4b1
Create Date: 2026-08-31

Adds the columns needed to render a complete academic editor profile per
the JGAIR editorial-board checklist:
  - category (grouping bucket: EiC, associate, managing, section, board,
    advisory, technical)
  - department
  - qualifications
  - scholar_url
  - scopus_id
  - institutional_profile_url
"""
from alembic import op
import sqlalchemy as sa


revision = "e9a1c4b2d7f5"
down_revision = "d8f3e6c2a4b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "editorial_board_members",
        sa.Column("category", sa.String(length=30), nullable=False, server_default="board_member"),
    )
    op.add_column("editorial_board_members", sa.Column("department", sa.String(length=300), nullable=True))
    op.add_column("editorial_board_members", sa.Column("qualifications", sa.Text(), nullable=True))
    op.add_column("editorial_board_members", sa.Column("scholar_url", sa.String(length=500), nullable=True))
    op.add_column("editorial_board_members", sa.Column("scopus_id", sa.String(length=80), nullable=True))
    op.add_column(
        "editorial_board_members",
        sa.Column("institutional_profile_url", sa.String(length=500), nullable=True),
    )
    op.create_index(
        "ix_editorial_board_members_category", "editorial_board_members", ["category"]
    )


def downgrade() -> None:
    op.drop_index("ix_editorial_board_members_category", table_name="editorial_board_members")
    op.drop_column("editorial_board_members", "institutional_profile_url")
    op.drop_column("editorial_board_members", "scopus_id")
    op.drop_column("editorial_board_members", "scholar_url")
    op.drop_column("editorial_board_members", "qualifications")
    op.drop_column("editorial_board_members", "department")
    op.drop_column("editorial_board_members", "category")
