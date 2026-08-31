"""article preprint — preprint DOI and URL on Article

Revision ID: o1m6h4c5d9i0
Revises: n0l5g3b4c8h9
Create Date: 2026-09-01

Adds two nullable columns to ``articles`` so an author can point readers
at the preprint (arXiv / bioRxiv / OSF / ChemRxiv / …) version of the
work from the published article page:

  * ``preprint_doi``  — canonical DOI of the preprint. The article page
    renders a "Preprint" badge that links to ``https://doi.org/{doi}``
    when this column is populated. Sized at 200 chars to match the DOI
    columns already on ``production_records`` and ``article_references``.
  * ``preprint_url``  — optional explicit landing URL. Used when the
    preprint has no DOI, or when the author wants a specific project
    landing page (e.g. an OSF project view) instead of the doi.org
    redirect target. Sized at 500 chars to fit real-world OSF / GitHub
    Pages URLs comfortably.

Both columns are nullable — every legacy article stays valid with no
preprint linkage, and the article-page badge collapses cleanly when
neither is set.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o1m6h4c5d9i0'
down_revision = 'n0l5g3b4c8h9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'articles',
        sa.Column('preprint_doi', sa.String(length=200), nullable=True),
    )
    op.add_column(
        'articles',
        sa.Column('preprint_url', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('articles', 'preprint_url')
    op.drop_column('articles', 'preprint_doi')
