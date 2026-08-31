"""reviewer auth — persistent reviewer accounts (password + email verification + last login)

Revision ID: i5e9f6a7b3d2
Revises: f2b6c8d3e5a1
Create Date: 2026-08-31

Adds three nullable columns to ``reviewers`` so a reviewer can hold a
persistent account (email + password) alongside the legacy per-review
token flow, which continues to work unchanged:

  - ``password_hash``       — bcrypt hash set by /reviewer-auth/set-password
  - ``email_verified_at``   — stamped when the invitation token is redeemed
  - ``last_login_at``       — stamped on each successful /reviewer-auth/login

All three are nullable; a reviewer that has never logged in keeps NULL in
all three, which matches the pre-migration behaviour.
"""
from alembic import op
import sqlalchemy as sa


revision = "i5e9f6a7b3d2"
down_revision = "h4d8e5f6a2c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviewers", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("reviewers", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
    op.add_column("reviewers", sa.Column("last_login_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviewers", "last_login_at")
    op.drop_column("reviewers", "email_verified_at")
    op.drop_column("reviewers", "password_hash")
