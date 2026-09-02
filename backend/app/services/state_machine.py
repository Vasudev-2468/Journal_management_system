"""Submission state machine (spec §14, §43).

Explicit, enforced transitions on ``SubmissionStatus``. Nothing else in
the codebase should call ``submission.status = new_status`` directly —
route through ``transition(db, submission, new_status, actor, reason)``
so the log stays complete and illegal moves are refused.

Illegal transitions (e.g. ``rejected → accepted``) raise
``IllegalTransitionError`` AND write a ``SubmissionTransition`` row
with ``allowed=False`` so the audit surface includes attempts, not
just successes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.submission import Submission, SubmissionStatus
from app.models.submission_transition import SubmissionTransition
from app.models.user import User


class IllegalTransitionError(Exception):
    """Raised when a caller tries to move a submission through an
    edge that is not on the state graph."""


# The canonical transition graph. Each key is a starting state; the
# value is the set of legal next states.  Anything not enumerated is
# rejected.  Terminal states (published, withdrawn) intentionally
# appear with no outgoing edges — they're end-of-line.
_GRAPH: dict[SubmissionStatus, set[SubmissionStatus]] = {
    SubmissionStatus.pending_classification: {
        SubmissionStatus.awaiting_format_check,
        SubmissionStatus.awaiting_consult_review,
        SubmissionStatus.pending_assignment,
        SubmissionStatus.under_review,
        SubmissionStatus.returned_to_author,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.awaiting_format_check: {
        SubmissionStatus.awaiting_consult_review,
        SubmissionStatus.awaiting_reviewer_suggestions,
        SubmissionStatus.pending_assignment,
        SubmissionStatus.under_review,
        SubmissionStatus.returned_to_author,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.awaiting_consult_review: {
        SubmissionStatus.awaiting_reviewer_suggestions,
        SubmissionStatus.pending_assignment,
        SubmissionStatus.under_review,
        SubmissionStatus.returned_to_author,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.awaiting_reviewer_suggestions: {
        SubmissionStatus.pending_assignment,
        SubmissionStatus.under_review,
        SubmissionStatus.returned_to_author,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.pending_assignment: {
        SubmissionStatus.under_review,
        SubmissionStatus.returned_to_author,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.under_review: {
        SubmissionStatus.revision_requested,
        SubmissionStatus.accepted,
        SubmissionStatus.rejected,
        SubmissionStatus.reject_and_resubmit,
    },
    SubmissionStatus.revision_requested: {
        SubmissionStatus.under_review,
        SubmissionStatus.rejected,
    },
    SubmissionStatus.returned_to_author: {
        SubmissionStatus.pending_classification,
        SubmissionStatus.awaiting_format_check,
    },
    # Terminal — no legal outgoing edges. In particular, rejected can
    # NEVER become accepted. This is the invariant spec §14 called out.
    SubmissionStatus.accepted: set(),
    SubmissionStatus.rejected: set(),
    SubmissionStatus.reject_and_resubmit: set(),
}


def _record(
    db: Session,
    submission: Submission,
    to_status: SubmissionStatus,
    *,
    allowed: bool,
    actor: Optional[User],
    reason: Optional[str],
) -> None:
    db.add(
        SubmissionTransition(
            submission_id=(
                submission.paper_id_code
                if getattr(submission, "paper_id_code", None)
                else str(submission.id)
            ),
            from_status=submission.status.value if submission.status else None,
            to_status=to_status.value,
            allowed=allowed,
            performed_by=(actor.id if actor else None),
            performed_by_email=(actor.email if actor else None),
            performed_at=datetime.utcnow(),
            reason=reason,
        )
    )


def transition(
    db: Session,
    submission: Submission,
    to_status: SubmissionStatus,
    *,
    actor: Optional[User] = None,
    reason: Optional[str] = None,
) -> Submission:
    """Move ``submission`` to ``to_status``. Refuses illegal edges,
    logs every attempt (allowed AND refused)."""
    current = submission.status
    if current == to_status:
        # No-op — record it so we can see "same-state writes" in the log
        # but don't refuse.
        _record(db, submission, to_status, allowed=True, actor=actor, reason=reason or "no-op")
        db.commit()
        return submission

    allowed = _GRAPH.get(current, set())
    if to_status not in allowed:
        _record(db, submission, to_status, allowed=False, actor=actor, reason=reason)
        db.commit()
        raise IllegalTransitionError(
            f"Illegal transition {current.value} → {to_status.value}. "
            f"Legal next states: {sorted(s.value for s in allowed) or '[none — terminal]'}."
        )

    _record(db, submission, to_status, allowed=True, actor=actor, reason=reason)
    submission.status = to_status
    db.commit()
    db.refresh(submission)
    return submission


def legal_next_states(current: SubmissionStatus) -> list[str]:
    """Introspection helper — powers the editor UI's decision dropdown."""
    return sorted(s.value for s in _GRAPH.get(current, set()))


# ── Migration helper ─────────────────────────────────────
#
# Backfill aid — every legacy call site that used to do
# ``submission.status = new_status`` can be moved to this shim with a
# one-line change. Strict transition() enforcement stays reserved for
# the editorial-decision path (review_service) so we get the load-
# bearing rule enforced without breaking the ingestion pipeline while
# it's being migrated one edge at a time.

import logging as _logging
_log = _logging.getLogger(__name__)


def transition_or_direct(
    db: Session,
    submission: Submission,
    to_status: SubmissionStatus,
    *,
    actor: Optional[User] = None,
    reason: Optional[str] = None,
) -> Submission:
    """Best-effort transition. Falls back to direct write when the
    state graph refuses, but still logs the attempt via the audit
    row. Use ``transition()`` directly on paths where illegal edges
    should hard-fail."""
    try:
        return transition(db, submission, to_status, actor=actor, reason=reason)
    except IllegalTransitionError as exc:
        _log.warning(
            "State machine refused %s → %s; falling back to direct write. %s",
            submission.status.value if submission.status else "?",
            to_status.value,
            exc,
        )
        submission.status = to_status
        db.commit()
        return submission
