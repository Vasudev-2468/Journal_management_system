"""Reviewer TOTP columns (spec — reviewer 2FA enrolment).

Adds ``totp_secret`` + ``totp_enrolled_at`` to the reviewers table so
reviewers can pair an authenticator app the same way editors already
do (via ``app/services/totp_service.py``).

Revision ID: bb4z9x7p2q3r
Revises: aa3y8w6o1p2q
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "bb4z9x7p2q3r"
down_revision = "aa3y8w6o1p2q"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reviewers", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column("reviewers", sa.Column("totp_enrolled_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviewers", "totp_enrolled_at")
    op.drop_column("reviewers", "totp_secret")
