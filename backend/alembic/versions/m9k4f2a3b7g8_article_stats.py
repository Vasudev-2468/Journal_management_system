"""article stats — per-article view / download / citation-click events

Revision ID: m9k4f2a3b7g8
Revises: l8j3d1e2f6h7
Create Date: 2026-09-01

Creates the ``article_events`` append-only table that backs the public
article-stats endpoints (``/article-stats/{article_id}/track``,
``/article-stats/{article_id}``, ``/article-stats/{article_id}/timeline``).

Design notes
------------
* One row per interaction. Rows are never mutated after insert — coarse
  dedup happens at write time via a lookup on the composite index
  ``(article_id, event_type, ip_hash, created_at)``. That index also
  covers the 30-minute "did we already record this?" query the router
  runs on every ``track`` call.
* Individual indexes on ``article_id``, ``event_type`` and
  ``created_at`` keep the aggregate reads (totals + timeline) cheap
  without forcing them through the composite index leading columns.
* ``article_id`` is FKd with ``ondelete=CASCADE`` so a removed article
  cleans up its event history — the aggregates never have to filter
  orphan rows.
* We deliberately store ``ip_hash`` (SHA-256 hex, 64 chars) rather than
  a raw IP; see :mod:`app.models.article_event` for the salting scheme.
"""
from alembic import op
import sqlalchemy as sa


revision = "m9k4f2a3b7g8"
down_revision = "l8j3d1e2f6h7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "article_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("referrer", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_article_events_article_id",
        "article_events",
        ["article_id"],
    )
    op.create_index(
        "ix_article_events_event_type",
        "article_events",
        ["event_type"],
    )
    op.create_index(
        "ix_article_events_created_at",
        "article_events",
        ["created_at"],
    )
    # Composite index tuned for the dedup lookup — matches the exact
    # column order the router filters on.
    op.create_index(
        "ix_article_events_dedup",
        "article_events",
        ["article_id", "event_type", "ip_hash", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_article_events_dedup", table_name="article_events")
    op.drop_index("ix_article_events_created_at", table_name="article_events")
    op.drop_index("ix_article_events_event_type", table_name="article_events")
    op.drop_index("ix_article_events_article_id", table_name="article_events")
    op.drop_table("article_events")
