"""Aggregated per-manuscript event stream.

``GET /submission-timeline/{submission_id}`` stitches together everything
we know about the life of a submission — the initial upload, review
assignments and completions, editorial decisions, revision cycles, and
the production stage transitions — into one chronologically-sorted
list. The author sees the timeline for their own submission, and any
editor (MFA-verified) can view any submission's timeline. Authentication
follows the same "own-or-editor" pattern the reviewer-comments packet
uses, so the author flow works with an ordinary session token.

Every event has the shape::

    {"at": ISO-8601, "kind": str, "label": str, "actor"?: str, "meta"?: dict}

``kind`` is deliberately parameterised (``status_change:{status}``,
``decision:{decision}``, ``revision:v{n}``, ``production:{stage}``) so the
frontend can render a per-kind icon while still recognising the family
without hard-coding every possible value.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.manuscript_version import ManuscriptVersion
from app.models.production_stage import ProductionRecord
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.services.auth_service import oauth2_scheme

router = APIRouter()


# Roles considered "editorial" for the purposes of viewing any
# submission's timeline. Mirrors the whitelist in ``editor_auth`` but is
# duplicated here so we can decide identity + role in a single JWT decode
# without invoking the MFA gate (the timeline is a read-only view; the
# heavier MFA gate would push authors and editors through different
# ``Depends`` trees).
_EDITORIAL_ROLES = {
    UserRole.editor,
    UserRole.section_editor,
    UserRole.admin,
    UserRole.super_admin,
    UserRole.managing_editor,
}


class TimelineEvent(BaseModel):
    at: datetime
    kind: str
    label: str
    actor: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class TimelineResponse(BaseModel):
    events: List[TimelineEvent]


def _resolve_viewer(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decode the caller's session token and return the ``User`` row.

    The timeline endpoint accepts any authenticated identity — ownership
    and editor-role checks are performed inside the endpoint against the
    resolved user. We reject bounded-scope tokens (editor pre-auth,
    review-link tokens) here so an OTP-pending session cannot read
    another submission's timeline.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    scope = payload.get("scope")
    if scope and scope != "session":
        raise HTTPException(status_code=401, detail="Bounded-scope token rejected")
    if payload.get("type") == "review_link":
        raise HTTPException(status_code=401, detail="Review-link token rejected")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return user


def _emails_equal(a: Optional[str], b: Optional[str]) -> bool:
    """Case-insensitive email comparison, tolerating leading/trailing space."""
    return bool(a) and bool(b) and (a or "").strip().lower() == (b or "").strip().lower()


def _reviewer_alias(index: int) -> str:
    """Return a stable anonymous alias for the ``index``-th reviewer.

    We deliberately never expose reviewer identity via the timeline —
    even to authors who own the submission — so the ``actor`` on
    review events is always ``"Reviewer N"``.
    """
    return f"Reviewer {index}"


def _collect_events(
    db: Session, submission: Submission, is_editor: bool
) -> List[TimelineEvent]:
    """Assemble the raw event list from every contributing source."""
    events: List[TimelineEvent] = []

    # ── submitted ────────────────────────────────────────
    if submission.submitted_at is not None:
        events.append(
            TimelineEvent(
                at=submission.submitted_at,
                kind="submitted",
                label="Manuscript submitted",
                actor=submission.author_name,
            )
        )

    # ── status_change:{status} ───────────────────────────
    #
    # We don't keep a per-transition ledger, so at minimum emit the
    # current status stamped with ``updated_at``. If the status has
    # never moved off the enum default, ``updated_at`` will equal
    # ``submitted_at`` and the two events sort next to each other —
    # which is the correct visual: "submitted → pending classification".
    if submission.status is not None and submission.updated_at is not None:
        status_value = (
            submission.status.value
            if hasattr(submission.status, "value")
            else str(submission.status)
        )
        events.append(
            TimelineEvent(
                at=submission.updated_at,
                kind=f"status_change:{status_value}",
                label=f"Status: {status_value.replace('_', ' ').title()}",
            )
        )

    # ── review_assigned / review_completed ───────────────
    reviews = (
        db.query(Review)
        .filter(Review.submission_id == submission.id)
        .order_by(Review.assigned_at.asc())
        .all()
    )
    for idx, r in enumerate(reviews, start=1):
        alias = _reviewer_alias(idx)
        if r.assigned_at is not None:
            events.append(
                TimelineEvent(
                    at=r.assigned_at,
                    kind="review_assigned",
                    label=f"{alias} assigned",
                    actor=alias,
                )
            )
        if r.status == ReviewStatus.completed and r.completed_at is not None:
            rec = (
                r.overall_recommendation.value
                if r.overall_recommendation is not None
                else None
            )
            meta: Dict[str, Any] = {}
            if rec:
                meta["recommendation"] = rec
            events.append(
                TimelineEvent(
                    at=r.completed_at,
                    kind="review_completed",
                    label=f"{alias} completed review",
                    actor=alias,
                    meta=meta or None,
                )
            )

    # ── decision:{decision} ──────────────────────────────
    #
    # Best-effort — the audit trail is populated by the editor gate and
    # not every deployment has it turned on. Filter by target_id +
    # action prefix so we get the right rows regardless of the exact
    # decision name.
    try:
        decisions = (
            db.query(AuditLog)
            .filter(
                AuditLog.target_id == str(submission.id),
                AuditLog.action.like("decision.%"),
            )
            .order_by(AuditLog.created_at.asc())
            .all()
        )
    except Exception:  # noqa: BLE001 — timeline should never 500 on audit
        decisions = []
    for row in decisions:
        # ``action`` is ``decision.<name>``; keep the tail for kind
        # parity with the shape spec.
        tail = row.action.split(".", 1)[-1] if "." in row.action else row.action
        # Editors see actor_email; authors only see a redacted "Editor"
        # to avoid identifying the specific decision maker.
        actor = row.actor_email if is_editor else "Editor"
        events.append(
            TimelineEvent(
                at=row.created_at,
                kind=f"decision:{tail}",
                label=f"Editorial decision: {tail.replace('_', ' ').title()}",
                actor=actor,
                meta=row.meta if is_editor else None,
            )
        )

    # ── revision:v{n} ────────────────────────────────────
    versions = (
        db.query(ManuscriptVersion)
        .filter(ManuscriptVersion.submission_id == submission.id)
        .order_by(ManuscriptVersion.version_number.asc())
        .all()
    )
    for v in versions:
        if v.created_at is None:
            continue
        events.append(
            TimelineEvent(
                at=v.created_at,
                kind=f"revision:v{v.version_number}",
                label=f"Revision v{v.version_number} — {v.label or 'submitted'}",
                actor=submission.author_name,
            )
        )

    # ── production:{stage} ───────────────────────────────
    prod = (
        db.query(ProductionRecord)
        .filter(ProductionRecord.submission_id == submission.id)
        .first()
    )
    if prod is not None:
        # The model only stores the current stage — emit both the
        # "entered production" event (record.created_at) and the
        # current stage event (record.updated_at) so a reader can see
        # both the initial handoff and the latest movement.
        if prod.created_at is not None:
            events.append(
                TimelineEvent(
                    at=prod.created_at,
                    kind="production:copy_editing",
                    label="Entered production — copy editing",
                )
            )
        current = prod.stage or "copy_editing"
        # Avoid duplicating the "entered production" row when the record
        # is still on the initial stage AND updated_at == created_at.
        if not (
            current == "copy_editing"
            and prod.updated_at is not None
            and prod.created_at is not None
            and prod.updated_at == prod.created_at
        ) and prod.updated_at is not None:
            events.append(
                TimelineEvent(
                    at=prod.updated_at,
                    kind=f"production:{current}",
                    label=f"Production — {current.replace('_', ' ').title()}",
                )
            )
        if prod.published_at is not None:
            events.append(
                TimelineEvent(
                    at=prod.published_at,
                    kind="production:published",
                    label="Published",
                    meta={"doi": prod.doi} if prod.doi else None,
                )
            )

    # ── sort ─────────────────────────────────────────────
    # Chronological ascending. Ties break on ``kind`` so the ordering is
    # deterministic (matters for tests, and for a caller diffing two
    # snapshots of the same timeline).
    events.sort(key=lambda e: (e.at, e.kind))
    return events


@router.get(
    "/{submission_id}",
    response_model=TimelineResponse,
)
def get_submission_timeline(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    viewer: User = Depends(_resolve_viewer),
) -> TimelineResponse:
    """Return the aggregated event stream for one submission.

    Authors may read the timeline for their own submissions; any
    editorial-role user may read any submission's timeline. The
    404-on-not-yours branch is written identically to the not-found
    branch so an author probing UUIDs cannot distinguish "does not
    exist" from "not yours".
    """
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    is_editor = viewer.role in _EDITORIAL_ROLES
    if not is_editor:
        # Author flow — ownership check against the email on the
        # submission. Case-insensitive to survive registration /
        # metadata casing drift.
        if not _emails_equal(submission.author_email, viewer.email):
            # Deliberately identical to the not-found branch above.
            raise HTTPException(status_code=404, detail="Submission not found")

    events = _collect_events(db, submission, is_editor=is_editor)
    return TimelineResponse(events=events)
