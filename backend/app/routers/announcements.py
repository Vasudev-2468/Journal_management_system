"""Announcements / news / call-for-papers CMS."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.announcement import Announcement
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
)
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


@router.get("/", response_model=List[AnnouncementRead])
def list_announcements(
    include_unpublished: bool = Query(False),
    kind: Optional[str] = Query(None, pattern="^(news|cfp|update)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Announcement)
    if not include_unpublished:
        now = datetime.utcnow()
        q = q.filter(Announcement.is_published.is_(True))
        q = q.filter(or_(Announcement.expires_at.is_(None), Announcement.expires_at > now))
    if kind:
        q = q.filter(Announcement.kind == kind)
    return q.order_by(Announcement.published_at.desc()).limit(limit).all()


@router.get("/{announcement_id}", response_model=AnnouncementRead)
def get_announcement(announcement_id: int, db: Session = Depends(get_db)):
    row = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return row


@router.post("/", response_model=AnnouncementRead, status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = Announcement(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{announcement_id}", response_model=AnnouncementRead)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.delete(row)
    db.commit()
    return None
