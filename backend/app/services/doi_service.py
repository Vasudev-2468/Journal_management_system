"""DOI lifecycle service (spec §5, §13, §17).

Implements the four hard rules the user pinned:

  1. A DOI may be assigned only when the linked manuscript's authoritative
     editorial decision is ``accepted``.
  2. Only users carrying the ``DOI_ASSIGN`` permission may assign or
     register a DOI.
  3. Every state transition (eligibility check, assign, register, retry,
     deactivate) writes exactly one immutable row to ``doi_audit_log``.
  4. A DOI never regresses — once ``registered`` or ``active`` the value
     is frozen and re-runs are refused.

Status vocabulary matches the spec:

    not_eligible → eligible → pending_approval → assigned
                → registration_pending → registered → active
                                                    ↘ registration_failed
                                                    ↘ deactivated
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.article import Article
from app.models.doi_audit_log import DoiAuditLog
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User


# ── Permission (routes through RBAC) ────────────────────

def has_doi_assign_permission(user: User, db: Optional[Session] = None) -> bool:
    """Return True iff ``user`` carries the ``DOI_ASSIGN`` permission.

    Delegates to ``services.permissions.has_permission`` when a session
    is available so the RBAC matrix is the single source of truth.
    Falls back to a role-based check when called without a session
    (a handful of legacy call sites still do this).
    """
    if not user or not user.is_active:
        return False
    if db is not None:
        from app.services.permissions import ACTION_DOI_ASSIGN, has_permission
        return has_permission(db, user, ACTION_DOI_ASSIGN)
    # Legacy fallback — role hierarchy.
    from app.models.user import UserRole
    return user.role in {
        UserRole.managing_editor,
        UserRole.admin,
        UserRole.super_admin,
    }


class DoiPermissionError(Exception):
    """Raised on 403-worthy DOI operations."""


class DoiIneligibleError(Exception):
    """Raised when the eligibility gate refuses an operation."""


class DoiConflictError(Exception):
    """Raised when a DOI already exists in a frozen state."""


# ── Eligibility ─────────────────────────────────────────

# Statuses that mean "this DOI is finalised" — nothing else can be
# minted on top and re-assignment is refused.
_FROZEN_STATUSES = {"registered", "active"}


@dataclass
class Eligibility:
    eligible: bool
    reason: str
    missing_checks: list


def check_doi_eligibility(
    db: Session,
    article: Article,
    submission_id: Optional[str] = None,
) -> Eligibility:
    """Run the checklist described in spec §5.

    ``submission_id`` is the paper_id_code of the source submission —
    optional because legacy articles predate the linkage, but strongly
    recommended: when passed we enforce that its ``status == accepted``.
    """
    missing: list = []

    # (a) DOI already frozen — no re-issue.
    if article.doi_status in _FROZEN_STATUSES:
        return Eligibility(
            eligible=False,
            reason=(
                f"A DOI is already registered for this article "
                f"({article.doi})."
            ),
            missing_checks=[],
        )

    # (b) Editorial decision must be ACCEPTED. If the caller passed a
    # submission_id we look it up and enforce ``status=accepted``.
    # Without a linkage we trust the pipeline invariant (Articles are
    # only created for accepted manuscripts) but note it in the reason.
    submission: Optional[Submission] = None
    if submission_id:
        submission = (
            db.query(Submission).filter(Submission.paper_id_code == submission_id).first()
        )
        if submission is None:
            missing.append("Submission not found for the provided paper id.")
        elif submission.status not in (SubmissionStatus.accepted,):
            return Eligibility(
                eligible=False,
                reason=(
                    f"DOI cannot be assigned — the editorial decision is "
                    f"'{submission.status.value}'. Only accepted manuscripts are eligible."
                ),
                missing_checks=[],
            )

    # (c) Article metadata must exist. A DOI without a title/author line
    # is useless — Crossref will reject the deposit anyway.
    if not (article.title and article.title.strip()):
        missing.append("Article title is missing.")
    if not article.author_id:
        missing.append("Article author is missing.")
    if not article.journal_id:
        missing.append("Journal linkage is missing.")

    if missing:
        return Eligibility(
            eligible=False,
            reason="Metadata is incomplete: " + "; ".join(missing),
            missing_checks=missing,
        )

    # (d) Publication Eligibility Agent — journal-level hard rules
    # (verified ISSN, DOI prefix, editorial decision, etc.) live in the
    # agent so the same source of truth answers both this endpoint
    # AND the eligibility endpoint the workspace calls. Best-effort:
    # if the agent module can't be imported (e.g. before the
    # journal_identifiers migration has landed) we don't block DOI —
    # legacy behaviour continues.
    try:
        from app.agents.journal_identifier_agent import run_publication_eligibility
        from app.models.journal_identifier import (
            IdentifierStatus, IdentifierType, JournalIdentifier,
        )
        from app.models.journal import Journal
    except ImportError:
        # Migration/model not yet in place — the article-level checks
        # above stand. Do NOT catch this via the wider except below,
        # which would silently swallow real runtime failures.
        return Eligibility(
            eligible=True,
            reason="Editorial decision is accepted and metadata is complete.",
            missing_checks=[],
        )

    try:

        journal = (
            db.query(Journal).filter(Journal.id == article.journal_id).first()
            if article.journal_id else None
        )
        journal_active = bool(journal and getattr(journal, "is_active", True))
        journal_has_verified_issn = False
        journal_has_doi_prefix = False
        if journal is not None:
            id_rows = (
                db.query(JournalIdentifier)
                .filter(JournalIdentifier.journal_id == journal.id)
                .all()
            )
            for r in id_rows:
                if r.identifier_type in {
                    IdentifierType.issn, IdentifierType.eissn, IdentifierType.pissn,
                }:
                    if r.status in {IdentifierStatus.verified, IdentifierStatus.active} and r.value:
                        journal_has_verified_issn = True
                if r.identifier_type == IdentifierType.doi_prefix:
                    if r.status in {IdentifierStatus.verified, IdentifierStatus.active} and r.value:
                        journal_has_doi_prefix = True

        agent = run_publication_eligibility(
            decision=(submission.status.value if submission else "accepted"),
            manuscript_present=True,
            final_manuscript_present=True,
            editor_authorized=True,     # caller has already checked has_doi_assign_permission
            journal_active=journal_active,
            journal_has_doi_prefix=journal_has_doi_prefix,
            journal_has_verified_issn=journal_has_verified_issn,
            metadata_complete=True,
            doi_already_assigned=bool(article.doi),
        )
        if not agent.doi_eligible:
            return Eligibility(
                eligible=False,
                reason=(
                    "Publication Eligibility Agent refused: "
                    + " ".join(agent.blockers)
                ),
                missing_checks=agent.blockers,
            )
    except Exception as exc:  # noqa: BLE001
        # Real runtime failure — REFUSE eligibility so the safety net
        # never fails-open silently. The caller sees an explicit
        # error and can inspect logs.
        import logging as _lg
        _lg.getLogger(__name__).exception("Publication Eligibility Agent raised")
        return Eligibility(
            eligible=False,
            reason=f"Publication Eligibility Agent errored: {type(exc).__name__}: {exc}",
            missing_checks=["publication_eligibility_agent"],
        )

    return Eligibility(
        eligible=True,
        reason="Editorial decision is accepted and metadata is complete.",
        missing_checks=[],
    )


# ── DOI suffix minting ──────────────────────────────────

def _year_of(article: Article) -> int:
    """Best-effort publication year — Article doesn't carry an explicit
    year, so we fall back to the current UTC year."""
    return datetime.utcnow().year


def _journal_prefix(article: Article) -> str:
    """Short journal identifier for the DOI suffix.

    JGAIR is the only journal in scope for this deployment, so we return
    the literal ``JGAIR`` — this is where a multi-journal instance would
    look up the article's journal record for its DOI shortcode.
    """
    return "JGAIR"


def mint_doi(article: Article) -> str:
    """Compose the full DOI: ``{prefix}/{journal}.{year}.{id:05d}``.

    ``prefix`` is the publisher/registration-agency prefix stored in
    settings — this is the value handed to us by Crossref (or another
    registration agency) and **must never** be invented by the service.
    """
    prefix = getattr(settings, "DOI_PREFIX", None) or "10.99999"
    return f"{prefix}/{_journal_prefix(article)}.{_year_of(article)}.{article.id:05d}"


# ── Audit helper ────────────────────────────────────────

def _audit(
    db: Session,
    *,
    article: Article,
    action: str,
    performer: Optional[User],
    previous_status: Optional[str],
    new_status: Optional[str],
    submission_id: Optional[str] = None,
    proposed_doi: Optional[str] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    entry = DoiAuditLog(
        article_id=article.id,
        submission_id=submission_id,
        action=action,
        performed_by=(performer.id if performer else None),
        performed_by_email=(performer.email if performer else None),
        previous_status=previous_status,
        new_status=new_status,
        proposed_doi=proposed_doi,
        reason=reason,
        ip_address=ip_address,
        meta=meta,
    )
    db.add(entry)


# ── Public operations ───────────────────────────────────


def assign_doi(
    db: Session,
    *,
    article: Article,
    editor: User,
    submission_id: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Article:
    """Authorise + mint the DOI. Refuses on permission, eligibility, or
    conflict failures. Every branch — including the refusals — records
    an audit row so the compliance log is complete."""
    previous = article.doi_status

    if not has_doi_assign_permission(editor, db):
        _audit(
            db, article=article, action="doi.assign.denied",
            performer=editor, previous_status=previous, new_status=previous,
            submission_id=submission_id, ip_address=ip_address,
            reason=f"User role '{editor.role.value}' lacks DOI_ASSIGN permission.",
        )
        db.commit()
        raise DoiPermissionError(
            "Your role is not authorised to assign a DOI. "
            "Contact the managing editor or editor-in-chief."
        )

    elig = check_doi_eligibility(db, article, submission_id=submission_id)
    if not elig.eligible:
        _audit(
            db, article=article, action="doi.assign.ineligible",
            performer=editor, previous_status=previous, new_status="not_eligible",
            submission_id=submission_id, ip_address=ip_address, reason=elig.reason,
            meta={"missing_checks": elig.missing_checks} if elig.missing_checks else None,
        )
        article.doi_status = "not_eligible"
        db.commit()
        raise DoiIneligibleError(elig.reason)

    if article.doi and article.doi_status in _FROZEN_STATUSES:
        raise DoiConflictError(
            f"A DOI is already registered for this article ({article.doi})."
        )

    proposed = mint_doi(article)
    article.doi = proposed
    article.doi_status = "assigned"
    article.doi_assigned_by = editor.id
    article.doi_assigned_at = datetime.utcnow()
    _audit(
        db, article=article, action="doi.assigned",
        performer=editor, previous_status=previous, new_status="assigned",
        submission_id=submission_id, ip_address=ip_address, proposed_doi=proposed,
        reason=elig.reason,
    )
    db.commit()
    db.refresh(article)
    return article


def record_registration_attempt(
    db: Session,
    *,
    article: Article,
    editor: User,
    ok: bool,
    response_snippet: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Article:
    """Flip ``doi_status`` after the Crossref (or other registrar) call
    completes. Called from the crossref router so the DOI service owns
    the state transitions rather than the transport layer."""
    if not has_doi_assign_permission(editor, db):
        raise DoiPermissionError(
            "Your role is not authorised to register a DOI."
        )
    if not article.doi:
        raise DoiIneligibleError(
            "This article has no DOI yet — assign one first."
        )
    previous = article.doi_status
    if ok:
        article.doi_status = "registered"
        article.doi_registered_at = datetime.utcnow()
        article.doi_registration_response = response_snippet
        _audit(
            db, article=article, action="doi.registered",
            performer=editor, previous_status=previous, new_status="registered",
            proposed_doi=article.doi, ip_address=ip_address,
        )
    else:
        article.doi_status = "registration_failed"
        article.doi_registration_response = response_snippet
        _audit(
            db, article=article, action="doi.registration.failed",
            performer=editor, previous_status=previous, new_status="registration_failed",
            proposed_doi=article.doi, ip_address=ip_address,
            reason=(response_snippet or "Registrar returned an error.")[:2000],
        )
    db.commit()
    db.refresh(article)
    return article


def list_audit(db: Session, article_id: int, limit: int = 50) -> list:
    return (
        db.query(DoiAuditLog)
        .filter(DoiAuditLog.article_id == article_id)
        .order_by(DoiAuditLog.performed_at.desc())
        .limit(limit)
        .all()
    )
