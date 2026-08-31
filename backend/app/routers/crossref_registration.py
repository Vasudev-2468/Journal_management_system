"""Editor-gated Crossref DOI registration.

The read-only Crossref XML view lives under discovery.py (GET /discovery/
crossref/{id}). This router adds the write-side counterpart — an editor
clicks "Register with Crossref", we regenerate the deposit XML, post it,
and store the outcome in the audit log so we know what happened even if
we never look at the endpoint's response body.

We never surface Crossref credentials to the caller. When the environment
does not have them configured the service returns "Not configured" and the
audit log records that too — a valuable trail when tracing why a batch
never appeared in the Crossref submission log.
"""

from datetime import datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.crossref_service import register_article_via_crossref
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


@router.post("/{article_id}/register")
def register_article_with_crossref(
    article_id: int,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> dict:
    """Post the article's deposit XML to Crossref.

    Returns the service's ``{ok, detail, batch_id}`` payload untouched. Every
    call — including "not configured" fallbacks — leaves an ``AuditLog`` row
    with the outcome, keyed by the acting editor.
    """
    article = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

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
        },
    )
    db.add(audit)
    db.commit()

    return result
