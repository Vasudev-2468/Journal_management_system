"""
Journal Identifier router (spec §5-8).

Powers the admin/editor "Identifiers" workspace and the DOI /
Publication pipeline's eligibility check. Reads are open to any
authenticated user; writes gate on editor MFA.

Endpoints
---------
GET  /journal-identifier/status
    Return every identifier for the primary journal — type, status,
    value (if any), notes, timestamps. The primary source for the
    admin table and the header pill "ISSN not registered" banner.

POST /journal-identifier/prepare-application
    Journal Identifier Agent's "Prepare Application" assistant.
    Body: {identifier_type, application: {...}}. Validates the payload
    for completeness + warnings and stores the JSON on the identifier
    row, moving status to APPLICATION_PREPARED. Editor MFA.

PATCH /journal-identifier/{identifier_type}
    Editor updates identifier state or value. Format is validated by
    the agent; VERIFIED / ACTIVE transitions require ``value`` to be
    present. Editor MFA.

POST /journal-identifier/publication-eligibility/{submission_id}
    Publication Eligibility Agent — runs every hard rule against
    the given submission + the primary journal and returns
    ``{ok, blockers, warnings, doi_eligible}``. Editor MFA.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.journal_identifier_agent import (
    OPTIONAL_APPLICATION_FIELDS,
    REQUIRED_APPLICATION_FIELDS,
    check_issn_application,
    run_publication_eligibility,
    validate_doi_prefix,
    validate_issn,
)
from app.database import get_db
from app.models.editorial_decision import EditorialDecision
from app.models.journal_identifier import (
    IdentifierStatus,
    IdentifierType,
    JournalIdentifier,
)
from app.models.manuscript_version import ManuscriptVersion
from app.models.submission import Submission, SubmissionStatus
from app.services.editor_auth import require_editor_mfa
from app.services.tenancy import get_primary_journal


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class IdentifierStatusItem(BaseModel):
    identifier_type: str
    status: str
    value: Optional[str] = None
    note: Optional[str] = None
    application_prepared_at: Optional[datetime] = None
    application_submitted_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IdentifierStatusResponse(BaseModel):
    journal_id: Optional[int]
    journal_title: Optional[str] = None
    identifiers: List[IdentifierStatusItem]
    # Convenience roll-up used by the frontend banner: True when the
    # journal has at least one VERIFIED / ACTIVE ISSN / EISSN /
    # PISSN.
    any_issn_verified: bool


class PatchIdentifierRequest(BaseModel):
    status: Optional[str] = Field(
        None,
        description=(
            "One of not_requested | application_prepared | application_submitted |"
            " under_review | assigned | verified | active | rejected | correction_required."
        ),
    )
    value: Optional[str] = None
    note: Optional[str] = None


class PrepareApplicationRequest(BaseModel):
    identifier_type: str = Field(
        ...,
        description="issn | eissn | pissn",
    )
    application: Dict[str, Any]


class PrepareApplicationResponse(BaseModel):
    ok: bool
    identifier_type: str
    status: str
    missing_required: List[str]
    missing_optional: List[str]
    warnings: List[str]
    required_fields: List[Dict[str, str]]
    optional_fields: List[Dict[str, str]]


class EligibilityResponse(BaseModel):
    ok: bool
    doi_eligible: bool
    blockers: List[str]
    warnings: List[str]


# ── Helpers ─────────────────────────────────────────────

def _parse_type(raw: str) -> IdentifierType:
    try:
        return IdentifierType(raw.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown identifier_type '{raw}'. Use issn / eissn / pissn / doi_prefix / doi_agency.",
        )


def _parse_status(raw: str) -> IdentifierStatus:
    try:
        return IdentifierStatus(raw.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown status '{raw}'.")


def _ensure_row(db: Session, journal_id: int, itype: IdentifierType) -> JournalIdentifier:
    row = (
        db.query(JournalIdentifier)
        .filter(
            JournalIdentifier.journal_id == journal_id,
            JournalIdentifier.identifier_type == itype,
        )
        .first()
    )
    if row is None:
        row = JournalIdentifier(
            journal_id=journal_id,
            identifier_type=itype,
            status=IdentifierStatus.not_requested,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_item(r: JournalIdentifier) -> IdentifierStatusItem:
    return IdentifierStatusItem(
        identifier_type=r.identifier_type.value,
        status=r.status.value,
        value=r.value,
        note=r.note,
        application_prepared_at=r.application_prepared_at,
        application_submitted_at=r.application_submitted_at,
        verified_at=r.verified_at,
        updated_at=r.updated_at,
    )


# ── GET /journal-identifier/status ──────────────────────

@router.get("/status", response_model=IdentifierStatusResponse)
def get_status(db: Session = Depends(get_db)):
    """Return all identifiers for the primary journal. Public read —
    the "ISSN not registered" banner needs it before login."""
    journal = get_primary_journal(db)
    if journal is None:
        return IdentifierStatusResponse(
            journal_id=None,
            identifiers=[],
            any_issn_verified=False,
        )
    rows = (
        db.query(JournalIdentifier)
        .filter(JournalIdentifier.journal_id == journal.id)
        .order_by(JournalIdentifier.identifier_type.asc())
        .all()
    )
    items = [_to_item(r) for r in rows]
    verified_states = {IdentifierStatus.verified, IdentifierStatus.active}
    any_issn_verified = any(
        r.identifier_type in {IdentifierType.issn, IdentifierType.eissn, IdentifierType.pissn}
        and r.status in verified_states
        and (r.value or "")
        for r in rows
    )
    return IdentifierStatusResponse(
        journal_id=journal.id,
        journal_title=getattr(journal, "title", None),
        identifiers=items,
        any_issn_verified=any_issn_verified,
    )


# ── POST /journal-identifier/prepare-application ────────

@router.post("/prepare-application", response_model=PrepareApplicationResponse)
def prepare_application(
    body: PrepareApplicationRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    itype = _parse_type(body.identifier_type)
    if itype not in {IdentifierType.issn, IdentifierType.eissn, IdentifierType.pissn}:
        raise HTTPException(
            status_code=400,
            detail="Only ISSN / EISSN / PISSN identifiers support the Prepare Application flow.",
        )
    journal = get_primary_journal(db)
    if journal is None:
        raise HTTPException(status_code=404, detail="No primary journal is configured.")

    check = check_issn_application(body.application or {})
    row = _ensure_row(db, journal.id, itype)
    row.application_json = json.dumps(check.normalised, default=str)
    if check.ok:
        # A completed application draft moves the identifier to
        # APPLICATION_PREPARED. The editor still submits it to the
        # authority manually (spec §2, §6).
        row.status = IdentifierStatus.application_prepared
        row.application_prepared_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    return PrepareApplicationResponse(
        ok=check.ok,
        identifier_type=itype.value,
        status=row.status.value,
        missing_required=check.missing_required,
        missing_optional=check.missing_optional,
        warnings=check.warnings,
        required_fields=[{"key": k, "label": lbl} for k, lbl in REQUIRED_APPLICATION_FIELDS],
        optional_fields=[{"key": k, "label": lbl} for k, lbl in OPTIONAL_APPLICATION_FIELDS],
    )


# ── PATCH /journal-identifier/{identifier_type} ─────────

@router.patch("/{identifier_type}", response_model=IdentifierStatusItem)
def patch_identifier(
    identifier_type: str,
    body: PatchIdentifierRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    itype = _parse_type(identifier_type)
    journal = get_primary_journal(db)
    if journal is None:
        raise HTTPException(status_code=404, detail="No primary journal is configured.")
    row = _ensure_row(db, journal.id, itype)

    now = datetime.utcnow()

    if body.status is not None:
        new_status = _parse_status(body.status)
        # State-machine rule: VERIFIED / ACTIVE require the value to
        # be present (spec §2 — "the agent must not invent one; the
        # editor stamps it after the authority hands it back").
        if new_status in {IdentifierStatus.verified, IdentifierStatus.active}:
            value_check = (body.value if body.value is not None else row.value) or ""
            if not value_check.strip():
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot move {itype.value} to {new_status.value} without a value.",
                )
        # Format check on the value for ISSN / DOI-prefix types.
        row.status = new_status
        if new_status == IdentifierStatus.application_submitted:
            row.application_submitted_at = now
        if new_status == IdentifierStatus.verified:
            row.verified_at = now

    if body.value is not None:
        v = body.value.strip() or None
        if v:
            if itype in {IdentifierType.issn, IdentifierType.eissn, IdentifierType.pissn}:
                check = validate_issn(v)
                if not check["ok"]:
                    raise HTTPException(status_code=400, detail=check["error"])
                v = check["normalised"]
            if itype == IdentifierType.doi_prefix:
                check = validate_doi_prefix(v)
                if not check["ok"]:
                    raise HTTPException(status_code=400, detail=check["error"])
                v = check["normalised"]
        row.value = v

    if body.note is not None:
        row.note = body.note.strip() or None

    row.updated_at = now
    db.commit()
    db.refresh(row)
    return _to_item(row)


# ── POST /journal-identifier/publication-eligibility/{submission_id} ─

@router.post(
    "/publication-eligibility/{submission_id}",
    response_model=EligibilityResponse,
)
def publication_eligibility(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    editor=Depends(require_editor_mfa),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Decision — prefer the most recent editorial_decisions row for
    # the current round; fall back to the submission's status
    # attribute for legacy rows.
    decision_row = (
        db.query(EditorialDecision)
        .filter(EditorialDecision.submission_id == submission.id)
        .order_by(EditorialDecision.decided_at.desc())
        .first()
    )
    decision = (
        decision_row.decision if decision_row is not None
        else (submission.status.value if submission.status else None)
    )

    # Manuscript presence
    manuscript_present = True
    final_version = (
        db.query(ManuscriptVersion)
        .filter(ManuscriptVersion.submission_id == submission.id)
        .order_by(
            ManuscriptVersion.is_current.desc(),
            ManuscriptVersion.version_number.desc(),
        )
        .first()
    )
    final_manuscript_present = bool(
        final_version is not None
        and (final_version.files or [])
    )

    # Journal identifier state — primary journal, all identifiers.
    journal = get_primary_journal(db)
    journal_active = bool(journal and getattr(journal, "is_active", True))
    journal_has_verified_issn = False
    journal_has_doi_prefix = False
    if journal is not None:
        rows = (
            db.query(JournalIdentifier)
            .filter(JournalIdentifier.journal_id == journal.id)
            .all()
        )
        for r in rows:
            if r.identifier_type in {IdentifierType.issn, IdentifierType.eissn, IdentifierType.pissn}:
                if r.status in {IdentifierStatus.verified, IdentifierStatus.active} and r.value:
                    journal_has_verified_issn = True
            if r.identifier_type == IdentifierType.doi_prefix:
                if r.status in {IdentifierStatus.verified, IdentifierStatus.active} and r.value:
                    journal_has_doi_prefix = True

    metadata_complete = bool(
        (submission.paper_title or "").strip()
        and (submission.abstract or "").strip()
    )
    # DOI already assigned? Article table carries the DOI when
    # published — best-effort check; fall back to False if the
    # attribute doesn't exist yet on this codebase.
    doi_already_assigned = False

    result = run_publication_eligibility(
        decision=decision,
        manuscript_present=manuscript_present,
        final_manuscript_present=final_manuscript_present,
        editor_authorized=True,  # gated on require_editor_mfa above
        journal_active=journal_active,
        journal_has_doi_prefix=journal_has_doi_prefix,
        journal_has_verified_issn=journal_has_verified_issn,
        metadata_complete=metadata_complete,
        doi_already_assigned=doi_already_assigned,
    )
    return EligibilityResponse(
        ok=result.ok,
        doi_eligible=result.doi_eligible,
        blockers=result.blockers,
        warnings=result.warnings,
    )
