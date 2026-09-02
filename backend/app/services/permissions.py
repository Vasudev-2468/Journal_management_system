"""RBAC permissions service (spec §37).

One entry point: ``has_permission(user, action)``. Everything else in
the module supports it.

Seeding
-------
``seed_default_permissions(db)`` writes the canonical action list plus
the role→action grants from ``_DEFAULT_MATRIX``. Idempotent — the
seed is safe to run at every backend startup, and calling code should.

Runtime
-------
``has_permission(user, action)`` returns True iff:
  * the user is active, AND
  * a ``role_permissions`` row exists linking ``user.role`` to a
    ``permissions.action == action``.

Missing permission rows silently deny — this matches "default deny"
posture. If a role should have a new action, add it to the matrix and
re-run the seed.

FastAPI dependencies
--------------------
``require_permission(action)`` returns a dependency you can drop into
any endpoint to enforce authorization declaratively:

    from app.services.permissions import require_permission, ACTION_PUBLISH

    @router.post("/{id}/publish")
    def publish(id: int, _=Depends(require_permission(ACTION_PUBLISH))):
        ...
"""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.permission import Permission, RolePermission
from app.models.user import User, UserRole
from app.services.editor_auth import require_editor_mfa


# ── Canonical action catalogue ──────────────────────────

ACTION_DOI_ASSIGN = "DOI_ASSIGN"
ACTION_PUBLISH = "PUBLISH"
ACTION_MANAGE_USERS = "MANAGE_USERS"
ACTION_CONFIGURE_JOURNAL = "CONFIGURE_JOURNAL"
ACTION_FINAL_DECISION = "FINAL_DECISION"
ACTION_ASSIGN_REVIEWERS = "ASSIGN_REVIEWERS"
ACTION_CORRECT_ARTICLE = "CORRECT_ARTICLE"
ACTION_RETRACT_ARTICLE = "RETRACT_ARTICLE"
ACTION_VIEW_AUDIT = "VIEW_AUDIT"

_ALL_ACTIONS: dict[str, str] = {
    ACTION_DOI_ASSIGN:        "Assign or register a DOI on an accepted article.",
    ACTION_PUBLISH:           "Flip an article to the published state.",
    ACTION_MANAGE_USERS:      "Create, edit, deactivate user accounts.",
    ACTION_CONFIGURE_JOURNAL: "Change journal identity, policies, board.",
    ACTION_FINAL_DECISION:    "Issue the authoritative editorial decision on a manuscript.",
    ACTION_ASSIGN_REVIEWERS:  "Assign reviewers to a manuscript.",
    ACTION_CORRECT_ARTICLE:   "Publish a correction on a published article.",
    ACTION_RETRACT_ARTICLE:   "Retract a published article.",
    ACTION_VIEW_AUDIT:        "Read the immutable audit trails.",
}


# ── Default role → action matrix ────────────────────────
#
# Mirrors spec §37. ``super_admin`` and ``admin`` receive every
# permission unconditionally so a fresh install has a working
# authorisation surface out of the box. Everything else is granted
# in the minimum-necessary spirit.

_DEFAULT_MATRIX: dict[UserRole, set[str]] = {
    UserRole.super_admin: set(_ALL_ACTIONS),
    UserRole.admin:       set(_ALL_ACTIONS),
    UserRole.managing_editor: {
        ACTION_DOI_ASSIGN, ACTION_PUBLISH, ACTION_MANAGE_USERS,
        ACTION_CONFIGURE_JOURNAL, ACTION_FINAL_DECISION,
        ACTION_ASSIGN_REVIEWERS, ACTION_CORRECT_ARTICLE,
        ACTION_RETRACT_ARTICLE, ACTION_VIEW_AUDIT,
    },
    UserRole.editor: {
        # JG-RBAC-1: `editor` is treated as the full journal-runner role
        # in this deployment, so it carries every admin-shaped action.
        # The dedicated `section_editor` / `production_editor` roles keep
        # their narrower scopes below.
        ACTION_FINAL_DECISION, ACTION_ASSIGN_REVIEWERS, ACTION_VIEW_AUDIT,
        ACTION_CONFIGURE_JOURNAL, ACTION_MANAGE_USERS, ACTION_PUBLISH,
        ACTION_DOI_ASSIGN, ACTION_CORRECT_ARTICLE, ACTION_RETRACT_ARTICLE,
    },
    UserRole.section_editor: {
        ACTION_ASSIGN_REVIEWERS,
    },
    UserRole.production_editor: {
        ACTION_PUBLISH,
    },
}


# ── Seed ────────────────────────────────────────────────

def seed_default_permissions(db: Session) -> None:
    """Idempotent — writes any missing rows from the catalogue/matrix.

    Safe to call at backend startup. Never revokes existing grants;
    revocations must be explicit (delete the row directly).
    """
    existing_actions = {
        row.action: row for row in db.query(Permission).all()
    }
    for action, description in _ALL_ACTIONS.items():
        if action not in existing_actions:
            row = Permission(action=action, description=description)
            db.add(row)
            db.flush()
            existing_actions[action] = row

    existing_grants = {
        (rp.role, rp.permission_id)
        for rp in db.query(RolePermission).all()
    }
    for role, actions in _DEFAULT_MATRIX.items():
        for action in actions:
            perm = existing_actions.get(action)
            if perm is None:
                continue
            key = (role.value, perm.id)
            if key not in existing_grants:
                db.add(RolePermission(role=role.value, permission_id=perm.id))
                existing_grants.add(key)
    db.commit()


# ── Runtime check ───────────────────────────────────────

def has_permission(db: Session, user: User, action: str) -> bool:
    """Return True iff ``user.role`` is granted ``action`` in role_permissions."""
    if not user or not user.is_active:
        return False
    row = (
        db.query(RolePermission)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .filter(RolePermission.role == user.role.value)
        .filter(Permission.action == action)
        .first()
    )
    return row is not None


def require_permission(action: str) -> Callable:
    """FastAPI dependency factory. Uses ``require_editor_mfa`` upstream
    so the caller must have an MFA-verified editor session; then
    checks the RBAC matrix on top."""

    def _dep(
        user: User = Depends(require_editor_mfa),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(db, user, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role '{user.role.value}' lacks the '{action}' permission.",
            )
        return user

    return _dep
