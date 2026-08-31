"""article search index — add tsvector column + GIN index on articles

Revision ID: j6f0a8b9c4e3
Revises: i5e9f6a7b3d2
Create Date: 2026-08-31

Adds a Postgres full-text search column to ``articles`` so the new
``GET /search/articles`` endpoint can rank matches with an indexed
``@@ websearch_to_tsquery(...)`` instead of the previous client-side
substring filter.

Column:
  - ``search_vector`` — ``tsvector``, ``GENERATED ALWAYS AS`` a
    ``to_tsvector('english', coalesce(title,'') || ' ' ||
    coalesce(abstract,'') || ' ' || coalesce(content,''))`` and
    ``STORED``. Because it is a generated column the database keeps
    it in sync on every INSERT / UPDATE — no trigger, no application
    code path can forget it, and it cannot drift.

Index:
  - ``ix_articles_search_vector`` — GIN index on ``search_vector``.

The generated-column form requires Postgres 12+, which this project
already targets (README pins Postgres 14+). Down-migration drops the
index and the column so a rollback returns the table to its prior
shape.
"""
from alembic import op


revision = "j6f0a8b9c4e3"
down_revision = "i5e9f6a7b3d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Generated column: Postgres computes the tsvector on write and
    # persists it. ``coalesce`` guards each source field so a NULL
    # title/abstract/content does not collapse the whole expression
    # to NULL.
    op.execute(
        """
        ALTER TABLE articles
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(content, '')
            )
        ) STORED
        """
    )
    op.execute(
        "CREATE INDEX ix_articles_search_vector "
        "ON articles USING GIN (search_vector)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_articles_search_vector")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS search_vector")
