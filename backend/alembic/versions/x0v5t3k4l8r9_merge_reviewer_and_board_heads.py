"""Merge reviewer portal + board invitation heads.

Two feature branches both descended from ``t6r1p9g0h4n5`` — the reviewer
portal chain (``u7s2q0h1i5o6 → v8t3r1i2j6p7 → w9u4s2j3k7q8``) and the
board invitation chain (``v8t3r2b1c4o7``). Alembic refuses ``upgrade
head`` while there is more than one head, so this migration collapses
the two into a single lineage. No schema change of its own — both
branches have already made their column changes.

Revision ID: x0v5t3k4l8r9
Revises: w9u4s2j3k7q8, v8t3r2b1c4o7
Create Date: 2026-09-01
"""
from alembic import op  # noqa: F401 — imported to keep alembic autogen happy
import sqlalchemy as sa  # noqa: F401


revision = "x0v5t3k4l8r9"
down_revision = ("w9u4s2j3k7q8", "v8t3r2b1c4o7")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op — this migration exists only to merge the two heads."""
    pass


def downgrade() -> None:
    """No-op — the branches are downgraded independently."""
    pass
