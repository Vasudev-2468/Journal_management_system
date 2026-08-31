"""user sessions — per-device active session tracking

Revision ID: n0l5g3b4c8h9
Revises: m9k4f2a3b7g8
Create Date: 2026-09-01

Creates the ``user_sessions`` table that backs the "signed in on these
devices" panel (``/sessions/mine``) and its two revocation endpoints
(``POST /sessions/{id}/revoke``, ``POST /sessions/revoke-others``).

Design notes
------------
* One row per (user, JWT). We store the SHA-256 of the token string
  rather than the token itself, so a leaked DB dump cannot be replayed
  as an active session. ``token_hash`` is unique + indexed so the
  per-request "find this session" lookup is a single index probe.
* ``user_id`` is FKd with ``ondelete=CASCADE`` — a removed user tears
  their live sessions down atomically, so the revocation checks never
  need to worry about orphan rows.
* ``last_seen_at`` is indexed so the panel's default ordering
  (most-recently-used first) is cheap even on very active accounts.
* ``ip_address`` / ``user_agent`` are nullable because the auth path
  degrades gracefully when a Request isn't in scope. ``revoked_at`` is
  a soft flag — the row stays around after revocation so the security
  log can display "signed out at Y".
"""
from alembic import op
import sqlalchemy as sa


revision = "n0l5g3b4c8h9"
down_revision = "m9k4f2a3b7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("ip_address", sa.String(length=50), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_user_sessions_token_hash"),
    )
    op.create_index(
        "ix_user_sessions_user_id",
        "user_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_user_sessions_token_hash",
        "user_sessions",
        ["token_hash"],
    )
    op.create_index(
        "ix_user_sessions_last_seen_at",
        "user_sessions",
        ["last_seen_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_sessions_last_seen_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
