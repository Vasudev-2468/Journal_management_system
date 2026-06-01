"""add user role and MFA fields

Revision ID: d5f7a9b1c3e2
Revises: c4e2a1b3d5f7
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "d5f7a9b1c3e2"
down_revision = "c4e2a1b3d5f7"
branch_labels = None
depends_on = None


def upgrade():
    # Create role enum
    op.execute("CREATE TYPE user_role AS ENUM ('author', 'editor', 'section_editor', 'admin')")

    op.add_column("users", sa.Column("role", sa.Enum("author", "editor", "section_editor", "admin", name="user_role"), nullable=True))
    op.execute("UPDATE users SET role = 'author' WHERE role IS NULL")
    op.alter_column("users", "role", nullable=False, server_default="author")

    op.add_column("users", sa.Column("whatsapp_number", sa.String(30)))
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean, nullable=False, server_default="true"))
    op.add_column("users", sa.Column("mfa_otp_hash", sa.String(255)))
    op.add_column("users", sa.Column("mfa_otp_expires_at", sa.DateTime))
    op.add_column("users", sa.Column("mfa_otp_attempts", sa.Integer, server_default="0"))
    op.add_column("users", sa.Column("mfa_locked_until", sa.DateTime))
    op.add_column("users", sa.Column("mfa_last_verified_at", sa.DateTime))

    op.create_index("ix_users_role", "users", ["role"])


def downgrade():
    op.drop_index("ix_users_role", "users")
    op.drop_column("users", "mfa_last_verified_at")
    op.drop_column("users", "mfa_locked_until")
    op.drop_column("users", "mfa_otp_attempts")
    op.drop_column("users", "mfa_otp_expires_at")
    op.drop_column("users", "mfa_otp_hash")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "whatsapp_number")
    op.drop_column("users", "role")
    op.execute("DROP TYPE user_role")
