"""Article corrections + retractions (spec §29, §30).

Revision ID: d6b1z8s4t2v0
Revises: c5a0y8r3s1t9
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "d6b1z8s4t2v0"
down_revision = "c5a0y8r3s1t9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "article_corrections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notice_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("published_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("published_by_email", sa.String(length=255), nullable=True),
        sa.Column("doi_of_notice", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_article_corrections_article_id", "article_corrections", ["article_id"])
    op.create_index("ix_article_corrections_notice_type", "article_corrections", ["notice_type"])
    op.create_index("ix_article_corrections_published_at", "article_corrections", ["published_at"])


def downgrade() -> None:
    op.drop_index("ix_article_corrections_published_at", table_name="article_corrections")
    op.drop_index("ix_article_corrections_notice_type", table_name="article_corrections")
    op.drop_index("ix_article_corrections_article_id", table_name="article_corrections")
    op.drop_table("article_corrections")
