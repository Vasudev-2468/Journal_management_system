"""Public tenancy endpoints.

Exposes the "primary journal" — the row every operationally-scoped table
falls back to when its ``journal_id`` is NULL. This is the read-time
counterpart to :mod:`app.services.tenancy`; it lets the frontend continue
rendering when ``/journals/current`` has nothing marked active (fresh
install, ``is_active`` accidentally cleared, or a deployment that has
never explicitly set an "active" journal).

The route is public — no auth. It returns only the same masthead-shaped
fields the public ``GET /journals/current`` endpoint already exposes, so
there is no additional surface being widened here.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.journal import Journal as JournalResponse
from ..services.tenancy import get_primary_journal


router = APIRouter()


@router.get("/primary-journal", response_model=JournalResponse)
def get_primary_journal_endpoint(db: Session = Depends(get_db)):
    """Return the primary Journal — oldest row by ``created_at``.

    Consumed by the frontend ``JournalContext`` as a silent fallback when
    ``/journals/current`` has no active row. Returns 404 only when the
    database has no Journal row at all.
    """
    journal = get_primary_journal(db)
    if journal is None:
        raise HTTPException(status_code=404, detail="No journal record configured")
    return journal
