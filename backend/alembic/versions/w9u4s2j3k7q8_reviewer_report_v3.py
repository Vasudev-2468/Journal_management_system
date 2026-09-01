"""Reviewer Report v3 — overall_assessment + round_number.

Adds the two remaining first-class fields the Reviewer Report needs
(spec §2A and §19). The structured Major / Minor comment lists +
suggestions list already fit inside the existing JSON Text columns —
no schema change needed there, only the JSON shape evolves.

Revision ID: w9u4s2j3k7q8
Revises: v8t3r1i2j6p7
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "w9u4s2j3k7q8"
down_revision = "v8t3r1i2j6p7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("overall_assessment", sa.Text(), nullable=True))
    op.add_column(
        "reviews",
        sa.Column(
            "round_number", sa.Integer(),
            nullable=False, server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("reviews", "round_number")
    op.drop_column("reviews", "overall_assessment")
