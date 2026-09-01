"""Review form v2 — structured comment lists + ethics + annotations.

Adds the structured-comment sections the reviewer portal form now
sends: major_comments / minor_comments / suggestions_to_authors as
JSON lists, ethics_flag + ethics_note as a separate ethical-concern
surface, and page_annotations for the line-by-line PDF anchors.

Revision ID: v8t3r1i2j6p7
Revises: u7s2q0h1i5o6
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "v8t3r1i2j6p7"
down_revision = "u7s2q0h1i5o6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("major_comments", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("minor_comments", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("suggestions_to_authors", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("page_annotations", sa.Text(), nullable=True))
    op.add_column(
        "reviews",
        sa.Column(
            "ethics_flag", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
        ),
    )
    op.add_column("reviews", sa.Column("ethics_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviews", "ethics_note")
    op.drop_column("reviews", "ethics_flag")
    op.drop_column("reviews", "page_annotations")
    op.drop_column("reviews", "suggestions_to_authors")
    op.drop_column("reviews", "minor_comments")
    op.drop_column("reviews", "major_comments")
