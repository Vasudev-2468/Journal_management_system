"""DOI lifecycle columns on ``articles`` + immutable ``doi_audit_log``.

Adds the columns needed to enforce the "DOI may only be assigned to an
ACCEPTED manuscript by a DOI_ASSIGN-authorised editor" rule (spec §14):

    articles
      + doi
      + doi_status                 (default 'not_eligible')
      + doi_assigned_by            (FK users.id)
      + doi_assigned_at
      + doi_registered_at
      + doi_registration_response  (text — Crossref response snippet)

    doi_audit_log                  (new table)
      one row per DOI event: eligibility checks, assign, register,
      retries, deactivations. Never updated.

Revision ID: a3y8w6o7p1u2
Revises: z2x7v5m6n0t1
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a3y8w6o7p1u2"
down_revision = "z2x7v5m6n0t1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("articles", sa.Column("doi", sa.String(length=200), nullable=True))
    op.add_column(
        "articles",
        sa.Column("doi_status", sa.String(length=32), nullable=False, server_default="not_eligible"),
    )
    op.add_column("articles", sa.Column("doi_assigned_by", sa.Integer(), nullable=True))
    op.add_column("articles", sa.Column("doi_assigned_at", sa.DateTime(), nullable=True))
    op.add_column("articles", sa.Column("doi_registered_at", sa.DateTime(), nullable=True))
    op.add_column("articles", sa.Column("doi_registration_response", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_articles_doi_assigned_by_users",
        "articles", "users",
        ["doi_assigned_by"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_articles_doi", "articles", ["doi"])
    op.create_index("ix_articles_doi_status", "articles", ["doi_status"])

    op.create_table(
        "doi_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submission_id", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("performed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("performed_by_email", sa.String(length=255), nullable=True),
        sa.Column("performed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("previous_status", sa.String(length=32), nullable=True),
        sa.Column("new_status", sa.String(length=32), nullable=True),
        sa.Column("proposed_doi", sa.String(length=200), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
    )
    op.create_index("ix_doi_audit_log_article_id", "doi_audit_log", ["article_id"])
    op.create_index("ix_doi_audit_log_submission_id", "doi_audit_log", ["submission_id"])
    op.create_index("ix_doi_audit_log_action", "doi_audit_log", ["action"])
    op.create_index("ix_doi_audit_log_performed_at", "doi_audit_log", ["performed_at"])


def downgrade() -> None:
    op.drop_index("ix_doi_audit_log_performed_at", table_name="doi_audit_log")
    op.drop_index("ix_doi_audit_log_action", table_name="doi_audit_log")
    op.drop_index("ix_doi_audit_log_submission_id", table_name="doi_audit_log")
    op.drop_index("ix_doi_audit_log_article_id", table_name="doi_audit_log")
    op.drop_table("doi_audit_log")

    op.drop_index("ix_articles_doi_status", table_name="articles")
    op.drop_index("ix_articles_doi", table_name="articles")
    op.drop_constraint("fk_articles_doi_assigned_by_users", "articles", type_="foreignkey")
    for col in (
        "doi_registration_response", "doi_registered_at", "doi_assigned_at",
        "doi_assigned_by", "doi_status", "doi",
    ):
        op.drop_column("articles", col)
