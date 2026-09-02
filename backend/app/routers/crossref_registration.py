"""Editor-gated Crossref DOI registration and status polling.

The read-only Crossref XML view lives under discovery.py (GET /discovery/
crossref/{id}). This router adds the write-side counterpart — an editor
clicks "Register with Crossref", we regenerate the deposit XML, post it,
and store the outcome (including Crossref's raw response and batch_id) in
the audit log so we know what happened even if we never look at the
endpoint's response body.

A second endpoint (``GET /crossref/status/{batch_id}``) lets the same
editor UI poll for the deposit's downstream outcome — success, pending or
failed — and each poll is recorded in ``audit_logs`` as well.

We never surface Crossref credentials to the caller. When the environment
does not have them configured the service returns "Not configured" and the
audit log records that too — a valuable trail when tracing why a batch
never appeared in the Crossref submission log.
"""

from datetime import datetime
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.crossref_service import (
    poll_crossref_status,
    register_article_via_crossref,
)
from app.services.doi_service import (
    DoiConflictError,
    DoiIneligibleError,
    DoiPermissionError,
    assign_doi,
    check_doi_eligibility,
    has_doi_assign_permission,
    list_audit as list_doi_audit,
    record_registration_attempt,
)
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


def _build_deposit_xml(article: Article) -> str:
    """Build the Crossref deposit XML for ``article``.

    Kept in-router (rather than imported from discovery.py) so the read-only
    XML view and the write-side registration stay independent — a future
    editor-portal-only change to the deposit payload does not perturb the
    public discovery output.
    """
    author = getattr(article, "author", None)
    display = (
        getattr(author, "full_name", None)
        or getattr(author, "username", None)
        or "Anonymous"
    )
    given_name, _, surname = display.partition(" ")
    ts = int(datetime.utcnow().timestamp())
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<doi_batch xmlns=\"http://www.crossref.org/schema/5.3.1\" version=\"5.3.1\">"
        "<head>"
        f"<doi_batch_id>{article.id}-{ts}</doi_batch_id>"
        f"<timestamp>{ts}</timestamp>"
        "<depositor>"
        "<depositor_name>Editorial Office</depositor_name>"
        "<email_address>editorial@example.com</email_address>"
        "</depositor>"
        "<registrant>Editorial Office</registrant>"
        "</head>"
        "<body>"
        "<journal>"
        "<journal_metadata><full_title>Journal</full_title></journal_metadata>"
        "<journal_article publication_type=\"full_text\">"
        f"<titles><title>{escape(article.title or '')}</title></titles>"
        "<contributors>"
        "<person_name sequence=\"first\" contributor_role=\"author\">"
        f"<given_name>{escape(given_name or display)}</given_name>"
        f"<surname>{escape(surname)}</surname>"
        "</person_name>"
        "</contributors>"
        "<jats:abstract xmlns:jats=\"http://www.ncbi.nlm.nih.gov/JATS1\">"
        f"<jats:p>{escape(article.abstract or '')}</jats:p>"
        "</jats:abstract>"
        "<doi_data>"
        f"<doi>10.xxxxx/article.{article.id}</doi>"
        f"<resource>https://example.com/articles/{article.id}</resource>"
        "</doi_data>"
        "</journal_article>"
        "</journal>"
        "</body>"
        "</doi_batch>"
    )


# ── DOI eligibility, assignment, audit (spec §5, §16, §17) ─

class DoiEligibilityResponse(BaseModel):
    eligible: bool
    reason: str
    missing_checks: list
    can_assign: bool
    current_status: str
    current_doi: Optional[str] = None
    proposed_doi: Optional[str] = None


class DoiAssignRequest(BaseModel):
    submission_id: Optional[str] = None
    # Editor confirmation — the frontend confirmation dialog sends
    # ``confirmed=true`` so accidental double-clicks on the button
    # don't skip past the "This DOI will permanently identify this
    # article" warning.
    confirmed: bool = False


class DoiStateResponse(BaseModel):
    doi: Optional[str] = None
    doi_status: str
    doi_assigned_by: Optional[int] = None
    doi_assigned_at: Optional[datetime] = None
    doi_registered_at: Optional[datetime] = None


class DoiAuditEntryResponse(BaseModel):
    id: int
    action: str
    performed_by_email: Optional[str] = None
    performed_at: datetime
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    proposed_doi: Optional[str] = None
    reason: Optional[str] = None


def _load_article(db: Session, article_id: int) -> Article:
    article = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.get("/{article_id}/eligibility", response_model=DoiEligibilityResponse)
def check_doi_eligibility_endpoint(
    article_id: int,
    submission_id: Optional[str] = None,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> DoiEligibilityResponse:
    """Return the eligibility snapshot the editor UI renders on the
    DOI Management card. The service is careful never to state that
    a rejected manuscript is eligible — the eligibility check consults
    the linked submission's status when a ``submission_id`` is passed."""
    from app.services.doi_service import mint_doi

    article = _load_article(db, article_id)
    elig = check_doi_eligibility(db, article, submission_id=submission_id)
    return DoiEligibilityResponse(
        eligible=elig.eligible,
        reason=elig.reason,
        missing_checks=elig.missing_checks,
        can_assign=has_doi_assign_permission(editor),
        current_status=article.doi_status,
        current_doi=article.doi,
        proposed_doi=mint_doi(article) if elig.eligible else None,
    )


@router.post("/{article_id}/assign", response_model=DoiStateResponse)
def assign_doi_endpoint(
    article_id: int,
    body: DoiAssignRequest,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> DoiStateResponse:
    """Authorise the DOI. Blocks on permission, eligibility, and prior
    frozen DOI. Every branch — including the refusals — writes an audit
    row so the compliance log stays complete."""
    if not body.confirmed:
        raise HTTPException(
            status_code=400,
            detail=(
                "DOI assignment requires explicit confirmation. Re-submit "
                "with confirmed=true after the editor accepts the "
                "confirmation dialog."
            ),
        )
    article = _load_article(db, article_id)
    ip = request.client.host if request.client else None
    try:
        article = assign_doi(
            db, article=article, editor=editor,
            submission_id=body.submission_id, ip_address=ip,
        )
    except DoiPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except DoiIneligibleError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except DoiConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return DoiStateResponse(
        doi=article.doi,
        doi_status=article.doi_status,
        doi_assigned_by=article.doi_assigned_by,
        doi_assigned_at=article.doi_assigned_at,
        doi_registered_at=article.doi_registered_at,
    )


@router.get("/{article_id}/audit", response_model=list[DoiAuditEntryResponse])
def doi_audit_endpoint(
    article_id: int,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> list[DoiAuditEntryResponse]:
    """Full DOI audit trail for an article. Read-only — the log is
    immutable at write time (append-only in ``doi_service``)."""
    entries = list_doi_audit(db, article_id)
    return [
        DoiAuditEntryResponse(
            id=e.id,
            action=e.action,
            performed_by_email=e.performed_by_email,
            performed_at=e.performed_at,
            previous_status=e.previous_status,
            new_status=e.new_status,
            proposed_doi=e.proposed_doi,
            reason=e.reason,
        )
        for e in entries
    ]


@router.post("/{article_id}/register")
def register_article_with_crossref(
    article_id: int,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> dict:
    """Post the article's deposit XML to Crossref.

    Returns the service's ``{ok, detail, batch_id}`` payload. Every call —
    including "not configured" fallbacks — leaves an ``AuditLog`` row with
    the outcome, keyed by the acting editor. The full Crossref response
    body (first 4 kB) is persisted into ``meta.raw`` so we can diagnose
    schema drift after the fact without having to replay the request.

    Now hard-gated on DOI eligibility + DOI_ASSIGN permission: a rejected
    or unassigned article can no longer be registered.
    """
    article = _load_article(db, article_id)

    # (1) Permission — reviewers/authors/section editors never reach
    # this branch even if they somehow authenticated with the wrong role.
    if not has_doi_assign_permission(editor):
        raise HTTPException(
            status_code=403,
            detail=(
                "Your role is not authorised to register a DOI. "
                "Contact the managing editor or editor-in-chief."
            ),
        )

    # (2) Article must carry an already-assigned DOI. Assignment is a
    # distinct action (POST /crossref/{id}/assign) — enforcing the split
    # makes the authorisation moment explicit in the audit log.
    if not article.doi:
        raise HTTPException(
            status_code=409,
            detail=(
                "No DOI has been assigned yet. Call POST /crossref/{id}/assign "
                "first and then register."
            ),
        )
    if article.doi_status in ("registered", "active"):
        raise HTTPException(
            status_code=409,
            detail=f"A DOI is already registered for this article ({article.doi}).",
        )

    xml = _build_deposit_xml(article)
    result = register_article_via_crossref(article, xml)

    client_host = request.client.host if request.client else None
    audit = AuditLog(
        actor_id=getattr(editor, "id", None),
        actor_email=getattr(editor, "email", None),
        action="crossref.register",
        target_type="article",
        target_id=str(article.id),
        ip_address=client_host,
        meta={
            "ok": bool(result.get("ok")),
            "detail": result.get("detail"),
            "batch_id": result.get("batch_id"),
            "raw": (result.get("raw") or "")[:4000],
        },
    )
    db.add(audit)
    db.commit()

    # Flip doi_status → registered / registration_failed and write the
    # DOI-scoped audit row so the DOI Management card can render a
    # correct state without re-parsing the generic audit_logs table.
    record_registration_attempt(
        db,
        article=article,
        editor=editor,
        ok=bool(result.get("ok")),
        response_snippet=(result.get("detail") or "")[:2000],
        ip_address=client_host,
    )

    # Trim ``raw`` from the API payload — it is only useful in the audit log.
    return {
        "ok": bool(result.get("ok")),
        "detail": result.get("detail"),
        "batch_id": result.get("batch_id"),
    }


@router.get("/status/{batch_id}")
def get_crossref_batch_status(
    batch_id: str,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> dict:
    """Poll Crossref for the outcome of a previously-submitted batch.

    Returns ``{status, detail}`` where ``status`` is one of ``success``,
    ``pending`` or ``failed``. Every poll is captured in the audit log —
    editors can see the timeline of "pending → success" for a batch even
    if the UI was closed between polls.
    """
    if not batch_id or len(batch_id) > 200:
        raise HTTPException(status_code=400, detail="Invalid batch_id")

    result = poll_crossref_status(batch_id)

    client_host = request.client.host if request.client else None
    audit = AuditLog(
        actor_id=getattr(editor, "id", None),
        actor_email=getattr(editor, "email", None),
        action="crossref.status",
        target_type="crossref_batch",
        target_id=batch_id,
        ip_address=client_host,
        meta={
            "status": result.get("status"),
            "detail": result.get("detail"),
        },
    )
    db.add(audit)
    db.commit()

    return result
