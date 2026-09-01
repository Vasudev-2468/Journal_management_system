"""Reviewer portal end-to-end schema additions.

Adds everything the reviewer portal (dashboard → assignment details →
structured review form → save draft → submit → history → notifications
→ profile → availability → security) needs at the storage layer:

  * reviews.state — richer state pill (invited / accepted /
    in_progress / submitted / declined / overdue / cancelled /
    expired). ``status`` remains the coarse invariant for editor
    pipelines; ``state`` is the reviewer-facing surface state.
  * reviews.rubric_answers / confidence / willing_to_review_revision
    — the structured-form additions the ReviewFormPage sends.
  * reviews.coi_declared_at / accepted_at / declined_at /
    decline_reason — audit trail for the assignment-details COI step.
  * reviews.editor_summary + editor_summary_json — Editor Summary
    Agent output, populated after submit.
  * review_drafts — one row per Review carrying the in-progress JSON
    payload while the reviewer is still writing.
  * reviewers.* — extra profile fields (phone, country, department,
    designation, ORCID, Scopus ID, Google Scholar) and availability
    window (unavailable_from / unavailable_until).

Revision ID: u7s2q0h1i5o6
Revises: t6r1p9g0h4n5
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa


revision = "u7s2q0h1i5o6"
down_revision = "t6r1p9g0h4n5"
branch_labels = None
depends_on = None


_REVIEW_STATE_VALUES = (
    "invited", "accepted", "in_progress", "submitted",
    "declined", "overdue", "cancelled", "expired",
)


def upgrade() -> None:
    # ── reviews.state (new enum) ─────────────────────────
    review_state_enum = sa.Enum(*_REVIEW_STATE_VALUES, name="review_state")
    review_state_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "reviews",
        sa.Column(
            "state",
            review_state_enum,
            nullable=False,
            server_default="invited",
        ),
    )
    op.create_index("ix_reviews_state", "reviews", ["state"])

    # ── reviews.* structured-form + COI + summary fields ─
    op.add_column("reviews", sa.Column("rubric_answers", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("confidence", sa.String(length=16), nullable=True))
    op.add_column("reviews", sa.Column("willing_to_review_revision", sa.Boolean(), nullable=True))
    op.add_column("reviews", sa.Column("coi_declared_at", sa.DateTime(), nullable=True))
    op.add_column("reviews", sa.Column("accepted_at", sa.DateTime(), nullable=True))
    op.add_column("reviews", sa.Column("declined_at", sa.DateTime(), nullable=True))
    op.add_column("reviews", sa.Column("decline_reason", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("editor_summary", sa.Text(), nullable=True))
    op.add_column("reviews", sa.Column("editor_summary_json", sa.Text(), nullable=True))

    # ── review_drafts ────────────────────────────────────
    op.create_table(
        "review_drafts",
        sa.Column("review_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("saved_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("review_id"),
        sa.ForeignKeyConstraint(
            ["review_id"], ["reviews.id"], ondelete="CASCADE",
        ),
    )

    # ── reviewers.* profile + availability fields ───────
    op.add_column("reviewers", sa.Column("phone", sa.String(length=50), nullable=True))
    op.add_column("reviewers", sa.Column("country", sa.String(length=120), nullable=True))
    op.add_column("reviewers", sa.Column("department", sa.String(length=255), nullable=True))
    op.add_column("reviewers", sa.Column("designation", sa.String(length=255), nullable=True))
    op.add_column("reviewers", sa.Column("orcid", sa.String(length=64), nullable=True))
    op.add_column("reviewers", sa.Column("scopus_id", sa.String(length=64), nullable=True))
    op.add_column("reviewers", sa.Column("google_scholar", sa.String(length=500), nullable=True))
    op.add_column("reviewers", sa.Column("unavailable_from", sa.DateTime(), nullable=True))
    op.add_column("reviewers", sa.Column("unavailable_until", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("reviewers", "unavailable_until")
    op.drop_column("reviewers", "unavailable_from")
    op.drop_column("reviewers", "google_scholar")
    op.drop_column("reviewers", "scopus_id")
    op.drop_column("reviewers", "orcid")
    op.drop_column("reviewers", "designation")
    op.drop_column("reviewers", "department")
    op.drop_column("reviewers", "country")
    op.drop_column("reviewers", "phone")

    op.drop_table("review_drafts")

    op.drop_column("reviews", "editor_summary_json")
    op.drop_column("reviews", "editor_summary")
    op.drop_column("reviews", "decline_reason")
    op.drop_column("reviews", "declined_at")
    op.drop_column("reviews", "accepted_at")
    op.drop_column("reviews", "coi_declared_at")
    op.drop_column("reviews", "willing_to_review_revision")
    op.drop_column("reviews", "confidence")
    op.drop_column("reviews", "rubric_answers")

    op.drop_index("ix_reviews_state", table_name="reviews")
    op.drop_column("reviews", "state")
    sa.Enum(name="review_state").drop(op.get_bind(), checkfirst=True)
