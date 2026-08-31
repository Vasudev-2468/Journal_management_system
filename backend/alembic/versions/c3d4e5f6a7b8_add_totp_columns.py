"""add TOTP columns to users (authenticator-app 2FA)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-31

Adds a base32-encoded TOTP secret and an enrolment timestamp per user.
The secret is stored as-is; the SECRET_KEY protects the DB against JWT
forgery but the TOTP secret is a shared secret with the user's device by
design, and can be revoked by rotating the row.
"""
from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enrolled_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_enrolled_at")
    op.drop_column("users", "totp_secret")
