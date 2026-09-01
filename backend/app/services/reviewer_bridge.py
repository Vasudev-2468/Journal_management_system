"""
Reviewer <-> User bridge helpers.

The system has two identity surfaces for the same person: the ``Reviewer``
table (peer-review operational record: load counters, expertise tags,
per-review token flow) and the ``users`` table (platform-wide identity:
login credentials, MFA, role). ``Reviewer.linked_user_id`` was added by
migration ``p2n7l5c6d0j1`` to bridge the two — this module provides the
small resolver + provisioning helpers callers should use rather than
open-coding a join.

None of these helpers mutate an existing endpoint's response shape; they
are additive utilities that let a caller obtain the *other* handle when
they already have one, or make sure both exist for a given reviewer.
"""
from __future__ import annotations

from typing import Optional, Union
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.reviewer import Reviewer
from app.models.user import User


ReviewerId = Union[str, UUID]


def _coerce_reviewer_uuid(reviewer_id: ReviewerId) -> Optional[UUID]:
    """Best-effort coerce the caller's reviewer id to a UUID.

    Returns None for anything unparseable so callers get a clean
    ``None`` result instead of an exception — the bridge is a lookup
    helper, not a validator.
    """
    if isinstance(reviewer_id, UUID):
        return reviewer_id
    try:
        return UUID(str(reviewer_id))
    except (ValueError, AttributeError, TypeError):
        return None


def find_user_for_reviewer(
    db: Session, reviewer_id: ReviewerId
) -> Optional[User]:
    """Return the ``User`` linked to this reviewer, or ``None``.

    Resolution order:
      1. ``reviewers.linked_user_id`` — the canonical bridge column set by
         the backfill migration and by :func:`ensure_link`.
      2. ``users.email == reviewers.email`` fallback — covers the narrow
         window on legacy environments where the migration has not yet
         run, so callers never see a false ``None`` on a reviewer whose
         User exists but is not yet linked. Does NOT create a link; use
         :func:`ensure_link` for that.
    """
    rid = _coerce_reviewer_uuid(reviewer_id)
    if rid is None:
        return None
    reviewer = db.query(Reviewer).filter(Reviewer.id == rid).first()
    if reviewer is None:
        return None
    if reviewer.linked_user_id is not None:
        return db.query(User).filter(User.id == reviewer.linked_user_id).first()
    # Fallback for reviewers created before the bridge existed.
    if reviewer.email:
        return db.query(User).filter(User.email == reviewer.email).first()
    return None


def find_reviewer_for_user(db: Session, user_id: int) -> Optional[Reviewer]:
    """Return the ``Reviewer`` linked to this user, or ``None``.

    Resolution order mirrors :func:`find_user_for_reviewer`:
      1. ``reviewers.linked_user_id == user.id``
      2. ``reviewers.email == user.email`` fallback for un-linked legacy
         rows. Does NOT persist the link.
    """
    if user_id is None:
        return None
    reviewer = (
        db.query(Reviewer).filter(Reviewer.linked_user_id == user_id).first()
    )
    if reviewer is not None:
        return reviewer
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.email:
        return None
    return db.query(Reviewer).filter(Reviewer.email == user.email).first()


def ensure_link(db: Session, reviewer: Reviewer) -> User:
    """Return the ``User`` bridged to ``reviewer``, creating one if needed.

    Idempotent:
      * If ``reviewer.linked_user_id`` already resolves to a real User,
        that User is returned unchanged.
      * Otherwise, look up a User by ``reviewer.email``. If found, stamp
        the link and return it — never duplicate an existing identity.
      * Otherwise, create a User row mirroring the reviewer's identity:
        ``role='reviewer'``, ``is_active=reviewer.is_active``,
        ``full_name=reviewer.name``, ``hashed_password=None`` (the
        reviewer sets a password later through the existing
        ``/reviewer-auth/set-password`` handler; this helper does not
        touch the password_hash on the Reviewer row).

    The caller is expected to commit the surrounding transaction — this
    function flushes so the new ``users.id`` is available for the FK
    stamp, but leaves the final commit to the caller so the link and any
    other work in the same handler stay atomic.
    """
    # 1. Already linked and the link resolves — nothing to do.
    if reviewer.linked_user_id is not None:
        user = (
            db.query(User)
            .filter(User.id == reviewer.linked_user_id)
            .first()
        )
        if user is not None:
            return user
        # The FK pointed at a row that no longer exists (ON DELETE SET
        # NULL means the DB would normally clear it, but treat a stale
        # value defensively). Fall through and re-provision.
        reviewer.linked_user_id = None

    # 2. Existing user with the same email — adopt it.
    user = None
    if reviewer.email:
        user = db.query(User).filter(User.email == reviewer.email).first()

    # 3. No user yet — create one.
    if user is None:
        base_username = (reviewer.email or "").split("@", 1)[0].strip().lower()
        if not base_username:
            base_username = f"reviewer_{str(reviewer.id).replace('-', '')[:12]}"
        candidate = base_username
        suffix = 1
        while (
            db.query(User).filter(User.username == candidate).first() is not None
        ):
            suffix += 1
            candidate = f"{base_username}{suffix}"

        user = User(
            username=candidate,
            email=reviewer.email,
            full_name=reviewer.name,
            hashed_password=None,
            is_active=bool(reviewer.is_active),
            role="reviewer",
        )
        db.add(user)
        db.flush()  # populate user.id for the FK stamp below.

    reviewer.linked_user_id = user.id
    return user
