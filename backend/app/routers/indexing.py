"""Indexing status tracker endpoints.

CRUD-ish operations on ``indexing_status`` — editors record every push
to DOAJ / OpenAlex / Google Scholar / etc. against a specific article
and update the state as the service acknowledges.

Endpoints
---------
GET  /indexing/articles/{article_id}
    List every indexing record for one article, service-grouped.

POST /indexing/articles/{article_id}
    Create a new indexing record. Requires MANAGE_USERS-equivalent
    editor gate — actual RBAC action is generic editor MFA + view-audit.

PATCH /indexing/{id}
    Update state / notes / external_id / external_url. Stamps
    submitted_at when state flips to submitted, indexed_at when it
    flips to indexed.

GET /indexing/summary
    Journal-wide roll-up: for each service, count of articles per
    state. Drives the Indexing Status Dashboard.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.indexing_status import IndexingService, IndexingState, IndexingStatus
from app.models.article import Article
from app.models.user import User
from app.services.editor_auth import require_editor_mfa


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class IndexingRecord(BaseModel):
    id: int
    article_id: int
    service: str
    state: str
    notes: Optional[str] = None
    external_id: Optional[str] = None
    external_url: Optional[str] = None
    submitted_at: Optional[datetime] = None
    indexed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CreateIndexingRequest(BaseModel):
    service: str = Field(..., description="One of IndexingService enum values")
    state: str = "pending"
    notes: Optional[str] = None
    external_id: Optional[str] = Field(None, max_length=200)
    external_url: Optional[str] = Field(None, max_length=500)


class UpdateIndexingRequest(BaseModel):
    state: Optional[str] = None
    notes: Optional[str] = None
    external_id: Optional[str] = Field(None, max_length=200)
    external_url: Optional[str] = Field(None, max_length=500)


class ServiceRollup(BaseModel):
    service: str
    pending: int = 0
    submitted: int = 0
    indexed: int = 0
    rejected: int = 0
    skipped: int = 0
    total: int = 0


class IndexingSummary(BaseModel):
    services: List[ServiceRollup]
    total_articles: int


# ── Helpers ─────────────────────────────────────────────

def _to_service(v: str) -> IndexingService:
    try:
        return IndexingService(v)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown service '{v}'. Expected one of {[s.value for s in IndexingService]}.",
        ) from exc


def _to_state(v: str) -> IndexingState:
    try:
        return IndexingState(v)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown state '{v}'. Expected one of {[s.value for s in IndexingState]}.",
        ) from exc


def _serialize(row: IndexingStatus) -> IndexingRecord:
    return IndexingRecord(
        id=row.id,
        article_id=row.article_id,
        service=row.service.value if row.service else "",
        state=row.state.value if row.state else "",
        notes=row.notes,
        external_id=row.external_id,
        external_url=row.external_url,
        submitted_at=row.submitted_at,
        indexed_at=row.indexed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ── Endpoints ───────────────────────────────────────────

@router.get("/articles/{article_id}", response_model=List[IndexingRecord])
def list_article_indexing(
    article_id: int,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> List[IndexingRecord]:
    """All indexing records for one article, newest first."""
    if db.query(Article).filter(Article.id == article_id).first() is None:
        raise HTTPException(status_code=404, detail="Article not found.")
    rows = (
        db.query(IndexingStatus)
        .filter(IndexingStatus.article_id == article_id)
        .order_by(IndexingStatus.created_at.desc())
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("/articles/{article_id}", response_model=IndexingRecord, status_code=201)
def create_indexing_record(
    article_id: int,
    body: CreateIndexingRequest,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> IndexingRecord:
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")

    service = _to_service(body.service)
    state = _to_state(body.state)

    now = datetime.utcnow()
    row = IndexingStatus(
        article_id=article_id,
        service=service,
        state=state,
        notes=body.notes,
        external_id=body.external_id,
        external_url=body.external_url,
        submitted_at=now if state == IndexingState.submitted else None,
        indexed_at=now if state == IndexingState.indexed else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.patch("/{record_id}", response_model=IndexingRecord)
def update_indexing_record(
    record_id: int,
    body: UpdateIndexingRequest,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> IndexingRecord:
    row = db.query(IndexingStatus).filter(IndexingStatus.id == record_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Indexing record not found.")

    if body.state is not None:
        new_state = _to_state(body.state)
        # Stamp transition dates on the way through.
        if new_state == IndexingState.submitted and row.submitted_at is None:
            row.submitted_at = datetime.utcnow()
        if new_state == IndexingState.indexed and row.indexed_at is None:
            row.indexed_at = datetime.utcnow()
        row.state = new_state
    if body.notes is not None:
        row.notes = body.notes
    if body.external_id is not None:
        row.external_id = body.external_id
    if body.external_url is not None:
        row.external_url = body.external_url

    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.get("/summary", response_model=IndexingSummary)
def indexing_summary(
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> IndexingSummary:
    """Journal-wide roll-up per service. Drives the dashboard card."""
    rows = (
        db.query(
            IndexingStatus.service,
            IndexingStatus.state,
            func.count(IndexingStatus.id),
        )
        .group_by(IndexingStatus.service, IndexingStatus.state)
        .all()
    )
    by_service: dict[str, ServiceRollup] = {}
    for svc, state, count in rows:
        svc_key = svc.value if svc else "other"
        state_key = state.value if state else "pending"
        r = by_service.setdefault(svc_key, ServiceRollup(service=svc_key))
        setattr(r, state_key, count)
        r.total += count

    # Ensure every known service surfaces even with zero rows so the
    # UI can render placeholders without extra client logic.
    for known in IndexingService:
        by_service.setdefault(known.value, ServiceRollup(service=known.value))

    total_articles = (
        db.query(func.count(func.distinct(IndexingStatus.article_id))).scalar() or 0
    )
    ordered = sorted(by_service.values(), key=lambda x: x.service)
    return IndexingSummary(services=ordered, total_articles=total_articles)
