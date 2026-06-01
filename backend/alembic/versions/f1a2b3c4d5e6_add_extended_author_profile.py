"""add extended author profile fields

Revision ID: f1a2b3c4d5e6
Revises: e8f1a2b3c4d5
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e8f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('first_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('country', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('department', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('profile_picture_url', sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'profile_picture_url')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'department')
    op.drop_column('users', 'country')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
