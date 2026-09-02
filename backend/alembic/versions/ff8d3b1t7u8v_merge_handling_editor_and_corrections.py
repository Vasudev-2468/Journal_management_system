"""Merge — reviewer-sessions / handling-editor branch + corrections branch.

Two divergent heads both descended from earlier merges. No schema
change of its own; both parents already made theirs.

Revision ID: ff8d3b1t7u8v
Revises: ee7c2a0s6t7u, d6b1z8s4t2v0
Create Date: 2026-09-02
"""
revision = "ff8d3b1t7u8v"
down_revision = ("ee7c2a0s6t7u", "d6b1z8s4t2v0")
branch_labels = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
