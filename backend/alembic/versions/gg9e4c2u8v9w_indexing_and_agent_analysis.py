"""Indexing status tracker + AgentAnalysis persistence

Revision ID: gg9e4c2u8v9w
Revises: ff8d3b1t7u8v
Create Date: 2026-09-03

Adds two new tables:

* ``indexing_status`` — one row per (article, service) submission.
  Editors log every push to DOAJ / OpenAlex / Google Scholar / etc.
  and update the state as the service acknowledges. Enum types
  ``indexing_service`` and ``indexing_state`` back the columns.
* ``agent_analysis`` — persists Editorial Decision Agent briefings
  so an editor can diff rounds and reproduce the AI's advice at
  decision time (Layer-2 audit separation).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "gg9e4c2u8v9w"
down_revision = "ff8d3b1t7u8v"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums for indexing_status ─────────────────────────
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'indexing_service') THEN "
        "CREATE TYPE indexing_service AS ENUM ("
        "'doaj','openalex','google_scholar','crossref','pubmed_central',"
        "'scopus','web_of_science','other'"
        "); END IF; END $$;"
    )
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'indexing_state') THEN "
        "CREATE TYPE indexing_state AS ENUM ("
        "'pending','submitted','indexed','rejected','skipped'"
        "); END IF; END $$;"
    )

    op.create_table(
        "indexing_status",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(),
                  sa.ForeignKey("articles.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("submissions.id", ondelete="SET NULL"),
                  nullable=True, index=True),
        sa.Column("service",
                  postgresql.ENUM(name="indexing_service", create_type=False),
                  nullable=False, index=True),
        sa.Column("state",
                  postgresql.ENUM(name="indexing_state", create_type=False),
                  nullable=False, index=True,
                  server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("external_id", sa.String(length=200), nullable=True),
        sa.Column("external_url", sa.String(length=500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("indexed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
    )

    # ── agent_analysis ────────────────────────────────────
    op.create_table(
        "agent_analysis",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("submissions.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("agent_name", sa.String(length=120), nullable=False, index=True),
        sa.Column("round_number", sa.Integer(), nullable=True, index=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("suggested_decision", sa.String(length=80), nullable=True, index=True),
        sa.Column("confidence", sa.String(length=20), nullable=True),
        sa.Column("reviews_received", sa.Integer(), nullable=True),
        sa.Column("reviews_expected", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("agent_analysis")
    op.drop_table("indexing_status")
    op.execute("DROP TYPE IF EXISTS indexing_state;")
    op.execute("DROP TYPE IF EXISTS indexing_service;")
