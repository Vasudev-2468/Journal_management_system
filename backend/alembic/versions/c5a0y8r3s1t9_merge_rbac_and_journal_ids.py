"""Merge migration — collapses the RBAC branch and the journal-identifier
branch that both descended from ``z2x7v5m6n0t1``.

No schema change of its own — both parents already made theirs.

Revision ID: c5a0y8r3s1t9
Revises: b4z9x7p8q2u3, aa3y8w6o1p2q
Create Date: 2026-09-02
"""
revision = "c5a0y8r3s1t9"
down_revision = ("b4z9x7p8q2u3", "aa3y8w6o1p2q")
branch_labels = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
