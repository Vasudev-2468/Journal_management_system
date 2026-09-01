"""Multi-journal tenancy helpers.

The platform grew up as a single-journal deployment. Every operationally
scoped table (submissions, articles, announcements, board members, special
issues, policy pages, reviewers, …) now carries a nullable ``journal_id``
column — see the migration ``q3o8m6d7e1k2`` and the models under
``app.models``.

A NULL ``journal_id`` means "belongs to the primary journal" — the row is
owned by whichever Journal is the first row ordered by ``created_at``.
That rule is enforced only at read time: callers that need "the current
journal" use :func:`get_primary_journal_id` (or the object variant) and
fall back to it when the caller-supplied id is missing.

Nothing here mutates data. The helpers are cheap read-only lookups intended
to be called from routers, services, and background tasks that need to
scope work to "this deployment's default journal" without pinning behavior
to a specific id.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.journal import Journal


def get_primary_journal(db: Session) -> Optional[Journal]:
    """Return the primary Journal — the oldest row by ``created_at``.

    Ties on ``created_at`` (e.g. seeded fixtures written in the same
    transaction) fall back to ``id`` so the choice is deterministic. Returns
    ``None`` if no Journal row exists yet — callers must handle that state,
    since a fresh install still renders public pages with masthead defaults.
    """
    return (
        db.query(Journal)
        .order_by(Journal.created_at.asc(), Journal.id.asc())
        .first()
    )


def get_primary_journal_id(db: Session) -> Optional[int]:
    """Return the primary Journal's ``id`` (see :func:`get_primary_journal`).

    Convenience wrapper for callers that only need the id — for example,
    when defaulting a ``journal_id`` on write, or when filtering a query
    that already joins on ``journals``.
    """
    journal = get_primary_journal(db)
    return journal.id if journal is not None else None


def ensure_journal_id(db: Session, current: Optional[int]) -> Optional[int]:
    """Return ``current`` when set; else the primary journal's id.

    Callers use this when they have an optional ``journal_id`` from a
    request payload / caller and want to default missing values to the
    primary journal without special-casing single-journal deployments.
    Returns ``None`` when the value is missing *and* no Journal row exists
    — the caller decides what to do with an un-tenanted deployment.
    """
    if current is not None:
        return current
    return get_primary_journal_id(db)
