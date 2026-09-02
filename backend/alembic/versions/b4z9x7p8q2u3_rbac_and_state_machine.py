"""RBAC permissions + submission-transition audit (spec §37, §14).

Adds two feature areas:

  ``permissions``, ``role_permissions``
      Table-driven RBAC. Every gated action names a ``Permission``
      (e.g. ``DOI_ASSIGN``, ``PUBLISH``). Roles are granted permissions
      via ``role_permissions``. Nothing on this table replaces the
      hardcoded ``require_editor_mfa`` gate — that stays as the
      authentication check. This is the authorisation matrix on top.

  ``submission_transitions``
      Append-only log of every attempted status change on a
      Submission. ``allowed=False`` rows preserve refused attempts so
      the audit trail includes "who tried to move JGAIR-2026-0042
      from rejected back to accepted" — which today is unenforced.

Revision ID: b4z9x7p8q2u3
Revises: a3y8w6o7p1u2
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa


revision = "b4z9x7p8q2u3"
down_revision = "a3y8w6o7p1u2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("action", sa.String(length=80), nullable=False, unique=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_permissions_action", "permissions", ["action"])

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "permission_id", sa.Integer(),
            sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("role", "permission_id", name="uq_role_permission"),
    )
    op.create_index("ix_role_permissions_role", "role_permissions", ["role"])
    op.create_index("ix_role_permissions_permission_id", "role_permissions", ["permission_id"])

    op.create_table(
        "submission_transitions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("performed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("performed_by_email", sa.String(length=255), nullable=True),
        sa.Column("performed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_submission_transitions_submission_id", "submission_transitions", ["submission_id"])
    op.create_index("ix_submission_transitions_to_status", "submission_transitions", ["to_status"])
    op.create_index("ix_submission_transitions_performed_at", "submission_transitions", ["performed_at"])


def downgrade() -> None:
    op.drop_index("ix_submission_transitions_performed_at", table_name="submission_transitions")
    op.drop_index("ix_submission_transitions_to_status", table_name="submission_transitions")
    op.drop_index("ix_submission_transitions_submission_id", table_name="submission_transitions")
    op.drop_table("submission_transitions")

    op.drop_index("ix_role_permissions_permission_id", table_name="role_permissions")
    op.drop_index("ix_role_permissions_role", table_name="role_permissions")
    op.drop_table("role_permissions")

    op.drop_index("ix_permissions_action", table_name="permissions")
    op.drop_table("permissions")
