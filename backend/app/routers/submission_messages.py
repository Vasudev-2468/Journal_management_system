"""Author ↔ editor message thread router.

Authors can view and post messages on their own submissions only; editors
can view and post on every submission. Reading a message from the other
party stamps the appropriate `read_by_*_at` column.
"""

import logging
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.submission import Submission
from app.models.submission_message import SubmissionMessage
from app.models.user import User, UserRole
from app.schemas.submission_message import (
    SubmissionMessageCreate,
    SubmissionMessageRead,
)
from app.services import pubsub
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


EDITOR_ROLES = {UserRole.editor, UserRole.section_editor, UserRole.admin}


def _is_editor(user: User) -> bool:
    return user.role in EDITOR_ROLES


def _load_submission_or_404(db: Session, submission_id: uuid.UUID) -> Submission:
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub


def _authorise_access(user: User, submission: Submission) -> None:
    """Editors may access every thread; authors only their own submission."""
    if _is_editor(user):
        return
    if (submission.author_email or "").lower() == (user.email or "").lower():
        return
    raise HTTPException(
        status_code=403,
        detail="You do not have access to this submission's messages.",
    )


@router.get(
    "/submission/{submission_id}",
    response_model=List[SubmissionMessageRead],
)
def list_messages(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = _load_submission_or_404(db, submission_id)
    _authorise_access(user, submission)

    rows = (
        db.query(SubmissionMessage)
        .filter(SubmissionMessage.submission_id == submission_id)
        .order_by(SubmissionMessage.created_at.asc())
        .all()
    )

    # Mark the counter-party's messages as seen the moment the current viewer
    # loads the thread. Author reading editor messages → read_by_author_at;
    # editor reading author messages → read_by_editor_at.
    now = datetime.utcnow()
    dirty = False
    if _is_editor(user):
        for row in rows:
            if row.sender_role == "author" and row.read_by_editor_at is None:
                row.read_by_editor_at = now
                dirty = True
    else:
        for row in rows:
            if row.sender_role in ("editor", "system") and row.read_by_author_at is None:
                row.read_by_author_at = now
                dirty = True
    if dirty:
        db.commit()
        for row in rows:
            db.refresh(row)

    return rows


@router.post(
    "/submission/{submission_id}",
    response_model=SubmissionMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def post_message(
    submission_id: uuid.UUID,
    payload: SubmissionMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    submission = _load_submission_or_404(db, submission_id)
    _authorise_access(user, submission)

    is_editor = _is_editor(user)
    row = SubmissionMessage(
        submission_id=submission_id,
        sender_role="editor" if is_editor else "author",
        sender_email=user.email,
        body=payload.body,
        is_from_editor=is_editor,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Best-effort real-time nudge to the counterparty. Editor -> author
    # publishes to that specific author's user_id (looked up by the
    # submission's author_email); author -> editor fans out to every
    # connected editor via the role broadcast topic. Any failure here is
    # swallowed — the message is already persisted and the poll
    # fallback will surface it within 60s.
    try:
        message_payload = {
            "kind": "new_message",
            "submission_id": str(submission_id),
            "message_id": row.id,
        }
        if is_editor:
            recipient = (
                db.query(User)
                .filter(User.email == (submission.author_email or "").lower())
                .first()
            )
            # ``author_email`` casing on submissions isn't guaranteed to
            # match the User row; retry with the raw string if needed.
            if recipient is None and submission.author_email:
                recipient = (
                    db.query(User)
                    .filter(User.email == submission.author_email)
                    .first()
                )
            if recipient is not None:
                pubsub.publish_threadsafe(
                    f"user:{recipient.id}", message_payload
                )
        else:
            # Fan out to every connected editor. Publishers reach the
            # role topic; individual editors are subscribed via the
            # WebSocket router.
            for topic in (
                "broadcast:editor",
                "broadcast:section_editor",
                "broadcast:admin",
                "broadcast:managing_editor",
                "broadcast:super_admin",
            ):
                pubsub.publish_threadsafe(topic, message_payload)
    except Exception:
        logger.debug(
            "submission_messages: pubsub publish failed", exc_info=True
        )

    return row


@router.post(
    "/{message_id}/mark-read",
    response_model=SubmissionMessageRead,
)
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(SubmissionMessage)
        .filter(SubmissionMessage.id == message_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")

    submission = _load_submission_or_404(db, row.submission_id)
    _authorise_access(user, submission)

    now = datetime.utcnow()
    if _is_editor(user):
        if row.read_by_editor_at is None:
            row.read_by_editor_at = now
    else:
        if row.read_by_author_at is None:
            row.read_by_author_at = now

    db.commit()
    db.refresh(row)
    return row
