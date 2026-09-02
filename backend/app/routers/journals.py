from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.journal import Journal
from ..models.user import User, UserRole
from ..schemas.journal import (
    JournalCreate,
    JournalUpdate,
    Journal as JournalResponse,
    JournalList,
)
from ..services.editor_auth import require_editor_mfa

router = APIRouter()


# JG-101: role gating for identity edits.
# Ticket calls for editor_in_chief + admin. That role doesn't exist yet;
# JG-407 formalises it. Until then, gate to admin + editor (the "editor tier"
# already used by EDITOR_ROLES) so the endpoint is not open to authors.
_IDENTITY_EDIT_ROLES = {UserRole.admin, UserRole.editor}


def _require_identity_editor(user: User = Depends(require_editor_mfa)) -> User:
    if user.role not in _IDENTITY_EDIT_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only editors_in_chief and admins can edit journal identity",
        )
    return user


# ── Multi-journal tenancy (JG-501) ──────────────────────
# The masthead is one row, but the platform is designed to host multiple
# journal tenants side-by-side. These endpoints power the editor
# "Journals Admin" page: list every configured journal, mark one active
# (mutex — the previous active row is cleared), and run a tiny agent
# that flags identity gaps (missing ISSN, no publisher, etc.).

@router.get("/", response_model=JournalList)
def list_journals(db: Session = Depends(get_db)):
    """Return every configured journal, oldest first."""
    rows = db.query(Journal).order_by(Journal.id.asc()).all()
    return {"journals": rows}


@router.post("/{journal_id}/activate", response_model=JournalResponse)
def activate_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_identity_editor),
):
    """Mark ``journal_id`` as the active tenant; clear every other row.

    The masthead only ever renders one journal. To avoid a split-brain
    where two rows both carry ``is_active=True``, we clear the flag on
    all other rows in the same transaction.
    """
    target = db.query(Journal).filter(Journal.id == journal_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Journal not found")

    # Clear every other row's active flag before flipping this one on,
    # so there is never a moment with two active rows.
    db.query(Journal).filter(Journal.id != journal_id).update(
        {Journal.is_active: False}, synchronize_session=False,
    )
    target.is_active = True
    db.commit()
    db.refresh(target)
    return target


@router.get("/agent/tenancy-health")
def tenancy_health_agent(db: Session = Depends(get_db)):
    """Multi-Journal Tenancy Health Agent — deterministic identity audit.

    For each configured journal, checks the masthead-critical fields and
    returns a per-journal readiness score plus tenancy-wide invariants
    (exactly one active row, no duplicate ISSNs). No LLM — pure Python.
    """
    rows = db.query(Journal).order_by(Journal.id.asc()).all()

    # Fields the masthead + DOI metadata + citation export all depend on.
    required = [
        ("title", "Title"),
        ("issn_online", "ISSN (online)"),
        ("publisher_name", "Publisher"),
        ("abbreviation", "Abbreviation"),
        ("subject_area", "Subject area"),
        ("language", "Language"),
        ("doi_prefix", "DOI prefix"),
        ("email_editorial", "Editorial email"),
    ]

    per_journal = []
    active_count = 0
    seen_issn: dict[str, list[int]] = {}
    for j in rows:
        missing = [label for attr, label in required if not getattr(j, attr, None)]
        completeness = round(100 * (len(required) - len(missing)) / len(required))
        if j.is_active:
            active_count += 1
        if j.issn_online:
            seen_issn.setdefault(j.issn_online.strip().upper(), []).append(j.id)
        per_journal.append({
            "id": j.id,
            "title": j.title,
            "is_active": bool(j.is_active),
            "completeness": completeness,
            "missing_fields": missing,
        })

    invariants: list[dict] = []
    if not rows:
        invariants.append({
            "severity": "critical",
            "message": "No journal records configured — masthead falls back to defaults.",
        })
    elif active_count == 0:
        invariants.append({
            "severity": "warning",
            "message": "No journal is marked active. Public pages will use the oldest row as fallback.",
        })
    elif active_count > 1:
        invariants.append({
            "severity": "critical",
            "message": f"{active_count} journals are marked active. Exactly one row must be active.",
        })
    for issn, ids in seen_issn.items():
        if len(ids) > 1:
            invariants.append({
                "severity": "critical",
                "message": f"Duplicate ISSN {issn} appears on journals {ids}. ISSNs must be unique.",
            })

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "invariants": invariants,
        "journals": per_journal,
    }


# ── Current journal (masthead source of truth) ──────────
# Route order matters: /current must be declared BEFORE /{journal_id}
# so FastAPI doesn't attempt to coerce "current" into an int.

@router.get("/current", response_model=JournalResponse)
def get_current_journal(db: Session = Depends(get_db)):
    """Return the currently-active journal record — the masthead source of truth.

    Consumed by the frontend `useJournal()` hook, the Footer, the AboutPage
    Publication Details block, and every metadata-emitting page. Cached client-side.
    """
    journal = (
        db.query(Journal)
        .filter(Journal.is_active.is_(True))
        .order_by(Journal.id.asc())
        .first()
    )
    if journal is None:
        # Fallback: no journal has been marked active. Return the oldest record
        # rather than 404 so a fresh install still renders masthead defaults.
        journal = db.query(Journal).order_by(Journal.id.asc()).first()
    if journal is None:
        raise HTTPException(status_code=404, detail="No journal record configured")
    return journal


@router.patch("/current", response_model=JournalResponse)
def update_current_journal(
    payload: JournalUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_identity_editor),
):
    """Update the active journal record. Gated to editor tier (JG-407 tightens to EIC)."""
    journal = (
        db.query(Journal)
        .filter(Journal.is_active.is_(True))
        .order_by(Journal.id.asc())
        .first()
    )
    if journal is None:
        raise HTTPException(status_code=404, detail="No active journal record to update")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(journal, key, value)

    db.commit()
    db.refresh(journal)
    return journal


# ── Generic CRUD by id (editor-gated) ───────────────────
# Prior to this fix these were fully unauthenticated — a single anonymous
# DELETE could blank the active journal record that drives the masthead.

@router.post("/", response_model=JournalResponse)
def create_journal(
    journal: JournalCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_identity_editor),
):
    db_journal = Journal(**journal.model_dump())
    db.add(db_journal)
    db.commit()
    db.refresh(db_journal)
    return db_journal


@router.get("/{journal_id}", response_model=JournalResponse)
def read_journal(journal_id: int, db: Session = Depends(get_db)):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    return journal


@router.put("/{journal_id}", response_model=JournalResponse)
def update_journal(
    journal_id: int,
    journal: JournalUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_identity_editor),
):
    db_journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if db_journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    for key, value in journal.model_dump(exclude_unset=True).items():
        setattr(db_journal, key, value)
    db.commit()
    db.refresh(db_journal)
    return db_journal


@router.delete("/{journal_id}", response_model=dict)
def delete_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_identity_editor),
):
    db_journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if db_journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    db.delete(db_journal)
    db.commit()
    return {"detail": "Journal deleted successfully"}
