"""journal_id scaffolding — nullable journal_id on operational tables

Revision ID: q3o8m6d7e1k2
Revises: p2n7l5c6d0j1
Create Date: 2026-09-01

Adds a nullable ``journal_id`` column (with FK to ``journals.id`` and a
single-column index) to every operationally-scoped table that did not
already carry one. This is the storage foundation for multi-journal
deployments — see ``app.services.tenancy`` and ``Docs/MULTI_JOURNAL.md``.

Tables touched:

  * submissions
  * articles                  (already has journal_id — skipped defensively)
  * announcements
  * editorial_board_members
  * special_issues
  * policy_pages
  * reviewers

Every column is nullable and every add is guarded by an ``information_schema``
lookup, so the migration is safe on:

  * a fresh database that has no ``journal_id`` anywhere,
  * a database where ``articles.journal_id`` already exists (from an
    earlier migration), and
  * a re-run — nothing is re-added, no ``DuplicateColumn`` is raised.

A NULL ``journal_id`` means "belongs to the primary journal", so no data
migration is needed: single-journal deployments keep working as before and
every existing query stays correct.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "q3o8m6d7e1k2"
down_revision = "p2n7l5c6d0j1"
branch_labels = None
depends_on = None


# ── Tables getting a nullable journal_id ────────────────
# Order matters only for reversibility (downgrade unwinds this list in
# reverse) — nothing here has an inter-table dependency.
_TABLES = (
    "submissions",
    "articles",
    "announcements",
    "editorial_board_members",
    "special_issues",
    "policy_pages",
    "reviewers",
)


def _has_column(bind, table_name: str, column_name: str) -> bool:
    """Return True iff ``table.column`` already exists in the connected DB.

    Uses ``information_schema.columns`` so this works uniformly on Postgres
    (production) and any other backend developers might point Alembic at.
    Falls back to ``False`` on any lookup error — the surrounding add is
    still wrapped in a try/except, so a false negative just triggers the
    duplicate-column guard one layer down.
    """
    try:
        result = bind.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table_name, "c": column_name},
        ).first()
        return result is not None
    except Exception:
        return False


def _add_journal_id(table_name: str) -> None:
    """Add ``journal_id`` + FK + index to ``table_name`` if it is missing.

    Safe to call on a table that already has the column: the
    ``information_schema`` check short-circuits, and any race is caught by
    the surrounding try/except so a duplicate add on Postgres never breaks
    the migration.
    """
    bind = op.get_bind()
    if _has_column(bind, table_name, "journal_id"):
        return

    fk_name = f"fk_{table_name}_journal_id_journals"
    ix_name = f"ix_{table_name}_journal_id"

    try:
        op.add_column(
            table_name,
            sa.Column(
                "journal_id",
                sa.Integer(),
                sa.ForeignKey("journals.id", name=fk_name),
                nullable=True,
            ),
        )
    except Exception:
        # A concurrent add or a backend without information_schema visibility
        # can land us here — the important invariant is that after this call
        # the column exists. Re-check and swallow the error if so; re-raise
        # otherwise so a genuine failure still surfaces.
        if not _has_column(bind, table_name, "journal_id"):
            raise

    # Index add is guarded too: if the index somehow pre-exists (Alembic run
    # partially completed on a prior attempt) we want the migration to keep
    # going, not to abort.
    try:
        op.create_index(ix_name, table_name, ["journal_id"])
    except Exception:
        pass


def upgrade() -> None:
    for table_name in _TABLES:
        _add_journal_id(table_name)


def downgrade() -> None:
    # Reverse order for symmetry. Every drop is guarded so a partially-
    # applied migration can still be rolled back cleanly.
    for table_name in reversed(_TABLES):
        ix_name = f"ix_{table_name}_journal_id"
        try:
            op.drop_index(ix_name, table_name=table_name)
        except Exception:
            pass
        try:
            op.drop_column(table_name, "journal_id")
        except Exception:
            pass
