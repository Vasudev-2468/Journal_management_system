"""Public contact-form endpoint + editor-gated inbox."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contact_message import ContactMessage
from app.schemas.contact_message import (
    ContactMessageCreate,
    ContactMessageRead,
    ContactMessageUpdate,
)
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


@router.post("/", response_model=ContactMessageRead, status_code=status.HTTP_201_CREATED)
def submit_contact_message(payload: ContactMessageCreate, db: Session = Depends(get_db)):
    row = ContactMessage(
        name=payload.name.strip(),
        email=payload.email.lower().strip(),
        subject=payload.subject.strip(),
        message=payload.message.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=List[ContactMessageRead])
def list_messages(
    unread_only: bool = Query(False),
    resolved: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    q = db.query(ContactMessage)
    if unread_only:
        q = q.filter(ContactMessage.is_read.is_(False))
    if resolved is not None:
        q = q.filter(ContactMessage.resolved.is_(resolved))
    return q.order_by(ContactMessage.created_at.desc()).limit(limit).all()


@router.get("/{message_id}", response_model=ContactMessageRead)
def get_message(
    message_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return row


@router.patch("/{message_id}", response_model=ContactMessageRead)
def update_message(
    message_id: int,
    payload: ContactMessageUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(row)
    db.commit()
    return None
