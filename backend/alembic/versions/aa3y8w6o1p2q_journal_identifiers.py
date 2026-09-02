"""Journal identifiers lifecycle (spec §3-4).

One row per (journal_id, identifier_type). Types: issn, eissn, pissn,
doi_prefix, doi_agency. Each carries a state machine from
NOT_REQUESTED → ACTIVE (with REJECTED / CORRECTION_REQUIRED branches).

Revision ID: aa3y8w6o1p2q
Revises: z2x7v5m6n0t1
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "aa3y8w6o1p2q"
down_revision = "z2x7v5m6n0t1"
branch_labels = None
depends_on = None


_TYPES = ("issn", "eissn", "pissn", "doi_prefix", "doi_agency")
_STATES = (
    "not_requested", "application_prepared", "application_submitted",
    "under_review", "assigned", "verified", "active",
    "rejected", "correction_required",
)


def upgrade() -> None:
    # Idempotent enum creation — a partial prior apply may have left
    # the type behind. Raw DO $$ blocks are the surest way to skip
    # cleanly in PostgreSQL.
    bind = op.get_bind()
    bind.execute(sa.text(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='journal_identifier_type') "
        "THEN CREATE TYPE journal_identifier_type AS ENUM "
        "('issn', 'eissn', 'pissn', 'doi_prefix', 'doi_agency'); END IF; END $$;"
    ))
    bind.execute(sa.text(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='journal_identifier_status') "
        "THEN CREATE TYPE journal_identifier_status AS ENUM "
        "('not_requested', 'application_prepared', 'submitted', 'active', 'rejected', 'correction_required'); END IF; END $$;"
    ))

    # Reference the already-created types via postgresql.ENUM with
    # create_type=False — the generic sa.Enum keeps trying to re-emit
    # CREATE TYPE inside op.create_table's DDL.
    from sqlalchemy.dialects.postgresql import ENUM as PgEnum
    type_col_enum = PgEnum(*_TYPES, name="journal_identifier_type", create_type=False)
    status_col_enum = PgEnum(*_STATES, name="journal_identifier_status", create_type=False)

    op.create_table(
        "journal_identifiers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("journal_id", sa.Integer(), nullable=False),
        sa.Column("identifier_type", type_col_enum, nullable=False),
        sa.Column("status", status_col_enum, nullable=False, server_default="not_requested"),
        sa.Column("value", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("application_json", sa.Text(), nullable=True),
        sa.Column("application_prepared_at", sa.DateTime(), nullable=True),
        sa.Column("application_submitted_at", sa.DateTime(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["journal_id"], ["journals.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("journal_id", "identifier_type", name="uq_journal_identifier"),
    )
    op.create_index("ix_journal_identifiers_journal_id", "journal_identifiers", ["journal_id"])
    op.create_index("ix_journal_identifiers_identifier_type", "journal_identifiers", ["identifier_type"])


def downgrade() -> None:
    op.drop_index("ix_journal_identifiers_identifier_type", table_name="journal_identifiers")
    op.drop_index("ix_journal_identifiers_journal_id", table_name="journal_identifiers")
    op.drop_table("journal_identifiers")
    sa.Enum(name="journal_identifier_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="journal_identifier_type").drop(op.get_bind(), checkfirst=True)
