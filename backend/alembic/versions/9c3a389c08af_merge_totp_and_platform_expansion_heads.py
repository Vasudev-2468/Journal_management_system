"""merge totp and platform expansion heads

Revision ID: 9c3a389c08af
Revises: c3d4e5f6a7b8, q3o8m6d7e1k2
Create Date: 2026-09-01 10:37:54.879601

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c3a389c08af'
down_revision: Union[str, None] = ('c3d4e5f6a7b8', 'q3o8m6d7e1k2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
