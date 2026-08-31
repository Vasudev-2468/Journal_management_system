"""add article_reviews table

Revision ID: c5e7f2a1b3d9
Revises: b2c3d4e5f6a7
Create Date: 2026-08-31

JG-403 — lightweight reader review of a published article (title, content,
rating 1-5) linked to the article and the authenticated user.
"""
from alembic import op
import sqlalchemy as sa


revision = "c5e7f2a1b3d9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "article_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reviewer_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_article_reviews_rating_range"),
    )
    op.create_index(
        "ix_article_reviews_article_id", "article_reviews", ["article_id"]
    )
    op.create_index(
        "ix_article_reviews_reviewer_id", "article_reviews", ["reviewer_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_article_reviews_reviewer_id", table_name="article_reviews")
    op.drop_index("ix_article_reviews_article_id", table_name="article_reviews")
    op.drop_table("article_reviews")
