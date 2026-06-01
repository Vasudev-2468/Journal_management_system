"""add author profile and mfa channel fields

Revision ID: e8f1a2b3c4d5
Revises: d5f7a9b1c3e2
Create Date: 2026-04-17 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8f1a2b3c4d5'
down_revision = 'd5f7a9b1c3e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('mfa_email_verified_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('mfa_whatsapp_verified_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('institution', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('orcid', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('research_areas', sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'research_areas')
    op.drop_column('users', 'orcid')
    op.drop_column('users', 'institution')
    op.drop_column('users', 'mfa_whatsapp_verified_at')
    op.drop_column('users', 'mfa_email_verified_at')
