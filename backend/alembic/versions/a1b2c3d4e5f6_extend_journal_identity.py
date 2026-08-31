"""extend Journal with publication identity + seed JGAIR record

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-08-29

JG-101 — one source of truth for the journal's publication identity.
Everything downstream (DOI metadata, Scholar tags, citation export, Footer,
AboutPage) reads from these columns.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


revision = 'a1b2c3d4e5f6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('journals', sa.Column('issn_online', sa.String(20), nullable=True))
    op.add_column('journals', sa.Column('issn_print', sa.String(20), nullable=True))
    op.add_column('journals', sa.Column('abbreviation', sa.String(100), nullable=True))
    op.add_column('journals', sa.Column('subject_area', sa.String(200), nullable=True))
    op.add_column('journals', sa.Column('language', sa.String(50), nullable=True))
    op.add_column('journals', sa.Column('start_year', sa.Integer(), nullable=True))
    op.add_column('journals', sa.Column('frequency', sa.String(100), nullable=True))
    op.add_column('journals', sa.Column('publisher_name', sa.String(200), nullable=True))
    op.add_column('journals', sa.Column('publisher_address', sa.Text(), nullable=True))
    op.add_column(
        'journals',
        sa.Column(
            'licence',
            sa.String(50),
            nullable=False,
            server_default='CC-BY-4.0',
        ),
    )
    op.add_column('journals', sa.Column('doi_prefix', sa.String(50), nullable=True))
    op.add_column('journals', sa.Column('oai_identifier_prefix', sa.String(200), nullable=True))
    # Boolean server_default must be a native boolean literal for Postgres.
    op.add_column(
        'journals',
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )

    journals = table(
        'journals',
        column('id', sa.Integer),
        column('title', sa.String),
        column('description', sa.Text),
        column('issn_online', sa.String),
        column('issn_print', sa.String),
        column('abbreviation', sa.String),
        column('subject_area', sa.String),
        column('language', sa.String),
        column('start_year', sa.Integer),
        column('frequency', sa.String),
        column('publisher_name', sa.String),
        column('publisher_address', sa.Text),
        column('licence', sa.String),
        column('doi_prefix', sa.String),
        column('oai_identifier_prefix', sa.String),
        column('is_active', sa.Boolean),
    )

    bind = op.get_bind()
    existing = bind.execute(sa.text("SELECT COUNT(*) FROM journals")).scalar() or 0

    if existing == 0:
        op.bulk_insert(
            journals,
            [
                {
                    'title': 'JGAIR — Journal of Generative and Applied Intelligence Research',
                    'description': (
                        'A peer-reviewed academic journal advancing scholarly publishing '
                        'through intelligent peer review, automated analysis, and streamlined '
                        'editorial workflows.'
                    ),
                    'issn_online': None,
                    'issn_print': None,
                    'abbreviation': 'JGAIR',
                    'subject_area': 'Generative and Applied Intelligence Research',
                    'language': 'English',
                    'start_year': 2026,
                    'frequency': '2 issues per year (Jan–Jun, Jul–Dec)',
                    'publisher_name': None,
                    'publisher_address': None,
                    'licence': 'CC-BY-4.0',
                    'doi_prefix': None,
                    'oai_identifier_prefix': None,
                    'is_active': True,
                }
            ],
        )
    else:
        bind.execute(
            sa.text(
                "UPDATE journals SET is_active = true, "
                "licence = COALESCE(licence, 'CC-BY-4.0') "
                "WHERE id = (SELECT MIN(id) FROM journals)"
            )
        )


def downgrade() -> None:
    op.drop_column('journals', 'is_active')
    op.drop_column('journals', 'oai_identifier_prefix')
    op.drop_column('journals', 'doi_prefix')
    op.drop_column('journals', 'licence')
    op.drop_column('journals', 'publisher_address')
    op.drop_column('journals', 'publisher_name')
    op.drop_column('journals', 'frequency')
    op.drop_column('journals', 'start_year')
    op.drop_column('journals', 'language')
    op.drop_column('journals', 'subject_area')
    op.drop_column('journals', 'abbreviation')
    op.drop_column('journals', 'issn_print')
    op.drop_column('journals', 'issn_online')
