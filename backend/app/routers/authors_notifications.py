"""Author-scoped notification feed.

Powers the bell in the author dashboard. Combines two live streams into a
single ordered feed:

* ``kind='decision'`` — the author's submissions that transitioned to a
  terminal-ish editorial status (``accepted``, ``rejected``,
  ``revision_requested``) recently. Recency is derived from
  ``submission.updated_at``. The ``User`` row has no
  ``notifications_last_read_at`` column today, so the read cursor falls
  back to *the last 7 days*. When such a column is added later this
  helper starts using it automatically.

* ``kind='message'`` — every unread editor-to-author message on the
  author's submissions (``is_from_editor=True`` and
  ``read_by_author_at IS NULL``).

The endpoint returns ``{count, items: [...]}``. ``count`` is the number
of items in ``items``; it drives the red badge on the bell. Items are
sorted newest first so the dropdown reads like a timeline.

``POST /authors-notifications/mark-all-read`` flips
``read_by_author_at`` on every unread editor message for the caller.
Decisions do not need marking — the client suppresses seen ones with
``localStorage`` (matches the editor bell's pattern).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.submission import Submission, SubmissionStatus
from app.models.submission_message import SubmissionMessage
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


# ── Response shapes ──────────────────────────────────────────────


class AuthorNotificationItem(BaseModel):
    id: str
    kind: Literal["decision", "message"]
    title: str
    submission_id: str
    created_at: datetime
    unread: bool


class AuthorNotificationFeed(BaseModel):
    count: int
    items: List[AuthorNotificationItem]


class MarkAllReadResult(BaseModel):
    marked: int


# ── Helpers ──────────────────────────────────────────────────────


# Statuses that count as "editorial decisions" for the author feed.
# Kept as a plain tuple of enum members (not string values) so that a
# rename of the enum's ``value`` doesn't silently drop a status from the
# feed — the identity comparison stays sound.
_DECISION_STATUSES = (
    SubmissionStatus.accepted,
    SubmissionStatus.rejected,
    SubmissionStatus.revision_requested,
)


def _decision_since_cutoff(user: User) -> datetime:
    """Where the "recent decisions" window starts.

    If a ``notifications_last_read_at`` column is added to ``User`` we
    honour it; otherwise we fall back to seven days ago. Coded as a
    getattr so the router keeps working with either schema.
    """
    stored = getattr(user, "notifications_last_read_at", None)
    if isinstance(stored, datetime):
        return stored
    return datetime.utcnow() - timedelta(days=7)


def _decision_title(sub: Submission) -> str:
    status = sub.status
    # Human-readable phrasing per status — the bell UI shows this string
    # directly as the item's headline.
    if status == SubmissionStatus.accepted:
        verb = "Accepted"
    elif status == SubmissionStatus.rejected:
        verb = "Decision issued"
    elif status == SubmissionStatus.revision_requested:
        verb = "Revision requested"
    else:  # pragma: no cover — filtered upstream
        verb = "Update"
    title = (sub.paper_title or "your submission").strip()
    return f"{verb}: {title}"


def _message_title(msg: SubmissionMessage, sub: Optional[Submission]) -> str:
    paper = (sub.paper_title if sub else "").strip() if sub else ""
    if paper:
        return f"New message from editor · {paper}"
    return "New message from the editorial office"


# ── Routes ───────────────────────────────────────────────────────


@router.get("/mine", response_model=AuthorNotificationFeed)
def my_author_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AuthorNotificationFeed:
    """Return the caller's decision + editor-message feed."""
    email = (user.email or "").lower()

    # All submissions belonging to the author. Matched by lower(email)
    # so a typo in registration casing doesn't silence the bell.
    my_subs: List[Submission] = (
        db.query(Submission)
        .filter(Submission.author_email.ilike(email))
        .all()
    )
    sub_by_id = {sub.id: sub for sub in my_subs}

    items: List[AuthorNotificationItem] = []

    # ── Decisions ───────────────────────────────────────────────
    since = _decision_since_cutoff(user)
    for sub in my_subs:
        if sub.status not in _DECISION_STATUSES:
            continue
        stamp = sub.updated_at or sub.submitted_at
        if stamp is None or stamp < since:
            continue
        items.append(
            AuthorNotificationItem(
                id=f"decision-{sub.id}",
                kind="decision",
                title=_decision_title(sub),
                submission_id=str(sub.id),
                created_at=stamp,
                unread=True,
            )
        )

    # ── Editor messages ─────────────────────────────────────────
    if sub_by_id:
        msg_rows: List[SubmissionMessage] = (
            db.query(SubmissionMessage)
            .filter(
                and_(
                    SubmissionMessage.submission_id.in_(list(sub_by_id.keys())),
                    SubmissionMessage.is_from_editor.is_(True),
                    SubmissionMessage.read_by_author_at.is_(None),
                )
            )
            .order_by(SubmissionMessage.created_at.desc())
            .all()
        )
        for msg in msg_rows:
            sub = sub_by_id.get(msg.submission_id)
            items.append(
                AuthorNotificationItem(
                    id=f"message-{msg.id}",
                    kind="message",
                    title=_message_title(msg, sub),
                    submission_id=str(msg.submission_id),
                    created_at=msg.created_at,
                    unread=True,
                )
            )

    items.sort(key=lambda item: item.created_at, reverse=True)
    return AuthorNotificationFeed(count=len(items), items=items)


@router.post("/mark-all-read", response_model=MarkAllReadResult)
def mark_all_author_messages_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarkAllReadResult:
    """Stamp ``read_by_author_at`` on every unread editor message.

    Decisions have no per-row read column, so this endpoint only touches
    the message rows. The bell's client-side dismissal (localStorage)
    takes care of the decision half.
    """
    email = (user.email or "").lower()
    my_sub_ids = [
        row[0]
        for row in db.query(Submission.id)
        .filter(Submission.author_email.ilike(email))
        .all()
    ]
    if not my_sub_ids:
        return MarkAllReadResult(marked=0)

    now = datetime.utcnow()
    marked = (
        db.query(SubmissionMessage)
        .filter(
            and_(
                SubmissionMessage.submission_id.in_(my_sub_ids),
                SubmissionMessage.is_from_editor.is_(True),
                SubmissionMessage.read_by_author_at.is_(None),
            )
        )
        .update(
            {SubmissionMessage.read_by_author_at: now},
            synchronize_session=False,
        )
    )
    db.commit()
    return MarkAllReadResult(marked=int(marked or 0))
