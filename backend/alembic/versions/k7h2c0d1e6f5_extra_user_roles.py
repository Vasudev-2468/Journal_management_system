"""extra user roles — super_admin, managing_editor, production_editor

Revision ID: k7h2c0d1e6f5
Revises: j6f0a8b9c4e3
Create Date: 2026-08-31

Adds three new values to the Postgres ``user_role`` enum:

  - ``super_admin``       — highest-level administrator
  - ``managing_editor``   — editorial oversight, same access as an editor
  - ``production_editor`` — production-pipeline staff (typesetting, DOI,
                            copy edit) with NO editorial-decision rights

Postgres note
-------------
``ALTER TYPE ... ADD VALUE`` cannot execute inside a transaction on
Postgres versions prior to 12. It is also idempotent when guarded with
``IF NOT EXISTS`` (Postgres 9.6+), so re-running the migration on an
environment where a value already exists is a no-op instead of an error.

We disable Alembic's transactional wrapping for this migration so the
``ADD VALUE`` statements run in their own autocommit block. Downgrade is
intentionally a no-op — Postgres does not support removing a value from
an enum without recreating the type, which would require rewriting every
row in ``users`` and is not worth the risk during rollback.
"""
from alembic import op
import sqlalchemy as sa


revision = "k7h2c0d1e6f5"
down_revision = "j6f0a8b9c4e3"
branch_labels = None
depends_on = None

# Older Postgres versions refuse ``ALTER TYPE ... ADD VALUE`` inside a
# transaction. Alembic honours this attribute per-migration.
transactional_ddl = False


def upgrade() -> None:
    # Each ADD VALUE runs on its own line so a partial failure leaves a
    # clear point of restart. ``IF NOT EXISTS`` makes the migration safe
    # to re-run against an environment where one value has already been
    # applied out-of-band.
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'"))
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'managing_editor'"))
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'production_editor'"))


def downgrade() -> None:
    # Postgres cannot remove a single value from an enum. A true rollback
    # would rebuild the type and rewrite every ``users.role`` cell, which
    # is destructive and out of scope for a schema-only migration. We
    # intentionally leave the values in place; the application code that
    # references them is what gates their use.
    pass
