"""reviewer <-> user link — bridge the Reviewer table to the unified users identity

Revision ID: p2n7l5c6d0j1
Revises: o1m6h4c5d9i0
Create Date: 2026-09-01

Adds ``reviewers.linked_user_id`` — a nullable FK to ``users.id`` with
``ON DELETE SET NULL`` — so a Reviewer row (the operational peer-review
record) and a User row (the platform-wide identity) resolve to the same
person via ``linked_user_id``.

The upgrade also runs a one-shot idempotent backfill:

  * For every Reviewer that lacks ``linked_user_id``, look for an existing
    ``users`` row by email.
  * If one exists, use its id.
  * Otherwise, insert a fresh User row with
    ``role='reviewer'``, ``is_active=reviewer.is_active``,
    ``full_name=reviewer.name``, ``hashed_password=NULL`` (they set a
    password later via the existing ``/reviewer-auth/set-password``
    handler), and a ``username`` derived from the email local-part with
    a numeric suffix on collision so the ``username`` uniqueness index is
    honoured.
  * ``UPDATE reviewers SET linked_user_id = <found user id>``.

Every step is guarded so re-running the migration is a no-op once a
Reviewer already has a ``linked_user_id``, and no Reviewer or User row is
ever deleted.

Downgrade drops the index and column; the User rows created by the
backfill are intentionally left in place — deleting them would silently
lose reviewer identities that any downstream table might now be pointing
at.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "p2n7l5c6d0j1"
down_revision = "o1m6h4c5d9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Additive schema change — nullable FK + index. Safe on a live
    #    table; no rewrite because the default is NULL.
    op.add_column(
        "reviewers",
        sa.Column(
            "linked_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_reviewers_linked_user_id",
        "reviewers",
        ["linked_user_id"],
    )

    # 2. Backfill. Runs in the same migration transaction as the schema
    #    change so a failure rolls the whole thing back cleanly.
    bind = op.get_bind()

    # Reviewers still needing a linked user. Filter here (rather than
    # unconditionally rewriting) so re-runs after a partial success are
    # a no-op.
    rows = bind.execute(
        sa.text(
            "SELECT id, email, name, is_active "
            "FROM reviewers "
            "WHERE linked_user_id IS NULL"
        )
    ).fetchall()

    for reviewer_id, email, name, is_active in rows:
        # 2a. Prefer an existing users row keyed on email — never create a
        #     duplicate identity for a person who already has a User.
        user_row = bind.execute(
            sa.text("SELECT id FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()

        if user_row is not None:
            user_id = user_row[0]
        else:
            # 2b. No matching user. Mint one. ``username`` has a UNIQUE
            #     index; derive it from the email local-part and disambiguate
            #     on collision with a numeric suffix.
            base_username = (email or "").split("@", 1)[0].strip().lower()
            if not base_username:
                base_username = f"reviewer_{str(reviewer_id).replace('-', '')[:12]}"
            candidate = base_username
            suffix = 1
            while (
                bind.execute(
                    sa.text("SELECT 1 FROM users WHERE username = :u"),
                    {"u": candidate},
                ).fetchone()
                is not None
            ):
                suffix += 1
                candidate = f"{base_username}{suffix}"

            insert_result = bind.execute(
                sa.text(
                    "INSERT INTO users ("
                    "  username, email, full_name, hashed_password, "
                    "  is_active, role"
                    ") VALUES ("
                    "  :username, :email, :full_name, NULL, "
                    "  :is_active, 'reviewer'"
                    ") RETURNING id"
                ),
                {
                    "username": candidate,
                    "email": email,
                    "full_name": name,
                    "is_active": bool(is_active),
                },
            )
            user_id = insert_result.scalar()

        # 2c. Stamp the FK. Idempotent on re-runs because the outer SELECT
        #     already filtered to NULL rows.
        bind.execute(
            sa.text(
                "UPDATE reviewers "
                "SET linked_user_id = :uid "
                "WHERE id = :rid AND linked_user_id IS NULL"
            ),
            {"uid": user_id, "rid": reviewer_id},
        )


def downgrade() -> None:
    # Drop the bridge, keeping any users rows the backfill created —
    # deleting them here would silently remove reviewer identities that
    # downstream tables may already reference by user id.
    op.drop_index("ix_reviewers_linked_user_id", table_name="reviewers")
    op.drop_column("reviewers", "linked_user_id")
