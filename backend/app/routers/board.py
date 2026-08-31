"""Editorial board roster CRUD.

Public list + read; editor-gated create/update/delete.
Distinct from /editorial (the existing CV-access-request router).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.editorial_board_member import EditorialBoardMember
from app.schemas.editorial_board_member import (
    EditorialBoardMemberCreate,
    EditorialBoardMemberRead,
    EditorialBoardMemberUpdate,
)
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


@router.get("/", response_model=List[EditorialBoardMemberRead])
def list_members(
    include_inactive: bool = Query(False),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(EditorialBoardMember)
    if not include_inactive:
        q = q.filter(EditorialBoardMember.is_active.is_(True))
    if category:
        q = q.filter(EditorialBoardMember.category == category)
    return q.order_by(
        EditorialBoardMember.sort_order, EditorialBoardMember.name
    ).all()


@router.get("/{member_id}", response_model=EditorialBoardMemberRead)
def get_member(member_id: int, db: Session = Depends(get_db)):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    return row


@router.post("/", response_model=EditorialBoardMemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: EditorialBoardMemberCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = EditorialBoardMember(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{member_id}", response_model=EditorialBoardMemberRead)
def update_member(
    member_id: int,
    payload: EditorialBoardMemberUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    db.delete(row)
    db.commit()
    return None
