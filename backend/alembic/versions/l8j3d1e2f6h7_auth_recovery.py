"""auth recovery — password reset + TOTP backup codes

Revision ID: l8j3d1e2f6h7
Revises: k7h2c0d1e6f5
Create Date: 2026-09-01

Adds four columns to ``users`` that back two independent auth-recovery
flows:

  * ``password_reset_token_hash`` / ``password_reset_expires_at``
      bcrypt hash of the currently-outstanding signed reset JWT and its
      absolute expiry timestamp. Storing the hash (rather than the raw
      token) means a leaked row cannot be replayed as a live reset link.

  * ``recovery_codes_hashes`` / ``recovery_codes_generated_at``
      Comma-joined bcrypt hashes of 8 one-time TOTP backup codes plus
      the timestamp of the last regeneration. A consumed code is replaced
      in-place with the literal string ``"USED"`` so audit still knows
      the position was spent while the hash itself is gone.

All four columns are nullable — every existing user starts with no
outstanding reset and no recovery codes.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'l8j3d1e2f6h7'
down_revision = 'k7h2c0d1e6f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('password_reset_token_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_reset_expires_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('recovery_codes_hashes', sa.String(2048), nullable=True))
    op.add_column('users', sa.Column('recovery_codes_generated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'recovery_codes_generated_at')
    op.drop_column('users', 'recovery_codes_hashes')
    op.drop_column('users', 'password_reset_expires_at')
    op.drop_column('users', 'password_reset_token_hash')
