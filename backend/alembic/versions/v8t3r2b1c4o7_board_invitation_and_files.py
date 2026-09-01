"""Board member invitation lifecycle + uploaded file references.

Adds file-URL columns for photo / resume / certifications and the
invitation lifecycle columns that mirror the reviewer onboarding flow
(sent, completed, revoked, iat) so editors can invite people by email
and the invitee fills the profile themselves via a signed link.

Revision ID: v8t3r2b1c4o7
Revises: t6r1p9g0h4n5
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "v8t3r2b1c4o7"
down_revision = "t6r1p9g0h4n5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("editorial_board_members", sa.Column("photo_file_url", sa.String(1000), nullable=True))
    op.add_column("editorial_board_members", sa.Column("resume_file_url", sa.String(1000), nullable=True))
    op.add_column("editorial_board_members", sa.Column("certification_files", postgresql.JSONB(), nullable=True))
    op.add_column("editorial_board_members", sa.Column("invited_email", sa.String(255), nullable=True))
    op.add_column("editorial_board_members", sa.Column("invitation_sent_at", sa.DateTime(), nullable=True))
    op.add_column("editorial_board_members", sa.Column("invitation_completed_at", sa.DateTime(), nullable=True))
    op.add_column("editorial_board_members", sa.Column("invitation_revoked_at", sa.DateTime(), nullable=True))
    op.add_column("editorial_board_members", sa.Column("invitation_token_iat", sa.DateTime(), nullable=True))
    op.create_index("ix_editorial_board_members_invited_email", "editorial_board_members", ["invited_email"])


def downgrade() -> None:
    op.drop_index("ix_editorial_board_members_invited_email", table_name="editorial_board_members")
    op.drop_column("editorial_board_members", "invitation_token_iat")
    op.drop_column("editorial_board_members", "invitation_revoked_at")
    op.drop_column("editorial_board_members", "invitation_completed_at")
    op.drop_column("editorial_board_members", "invitation_sent_at")
    op.drop_column("editorial_board_members", "invited_email")
    op.drop_column("editorial_board_members", "certification_files")
    op.drop_column("editorial_board_members", "resume_file_url")
    op.drop_column("editorial_board_members", "photo_file_url")
