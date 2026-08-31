"""Editor-facing bulk importer for ``article_references``.

The single ``POST /reference-import/{article_id}`` endpoint accepts a
pasted BibTeX or RIS blob and turns each entry into one row on the
``article_references`` table, ordered by ``sequence``. Malformed
entries are silently dropped by the parser service so an editor pasting
a mixed-quality export doesn't lose the whole batch.

Gated behind ``require_editor_mfa`` — the same gate the existing
``POST /references/article/{id}`` and ``DELETE /references/{id}``
endpoints use. Any editor / section_editor / admin / super_admin /
managing_editor is allowed through; production_editor and reviewers
are not.

The response mirrors what the editor UI needs: how many rows landed
plus the full ``ArticleReferenceRead`` list of the newly created rows,
so the frontend can append them to its current view without a second
``GET /references/article/{id}`` round-trip.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.platform import ArticleReferenceRead
from app.services.editor_auth import require_editor_mfa
from app.services.reference_importer import parse_bibtex, parse_ris

router = APIRouter()


class ReferenceImportRequest(BaseModel):
    """Request body for the bulk importer.

    ``format`` selects the parser: ``"bibtex"`` for pasted @-entries or
    ``"ris"`` for tag-line RIS records. Anything else is rejected with
    400 rather than silently mis-parsed.
    """

    format: Literal["bibtex", "ris"] = Field(
        description="Source format of the pasted text.",
    )
    text: str = Field(
        min_length=1,
        description="Raw BibTeX or RIS blob to import.",
    )


class ReferenceImportResponse(BaseModel):
    inserted: int
    entries: List[ArticleReferenceRead]


def _log(
    db: Session,
    action: str,
    *,
    actor: Optional[User],
    target_type: str,
    target_id: str,
    ip: Optional[str],
    meta: Optional[dict] = None,
) -> None:
    """Append one audit-trail row without failing the parent transaction."""
    try:
        row = AuditLog(
            actor_id=actor.id if actor else None,
            actor_email=actor.email if actor else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip,
            meta=meta,
        )
        db.add(row)
        db.commit()
    except Exception:  # noqa: BLE001 — audit must never break the request
        db.rollback()


@router.post(
    "/{article_id}",
    response_model=ReferenceImportResponse,
    status_code=201,
)
def import_references(
    article_id: int,
    body: ReferenceImportRequest,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> ReferenceImportResponse:
    """Parse ``body.text`` and append one reference row per entry.

    The importer starts each batch's ``sequence`` numbering AFTER the
    highest ``sequence`` already stored on the article, so pasting a
    second batch on top of an existing list does not collide with the
    hand-added rows. Within the batch, sequences follow the parser's
    order — the same order the user pasted.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    if body.format == "bibtex":
        parsed = parse_bibtex(body.text)
    else:  # "ris" — enum guaranteed by the pydantic Literal
        parsed = parse_ris(body.text)

    if not parsed:
        # Nothing usable in the paste. Return an empty successful
        # response rather than a 4xx — the editor's paste was accepted,
        # just contained no complete entries.
        return ReferenceImportResponse(inserted=0, entries=[])

    # Find the current max sequence so we append rather than renumber
    # the existing rows.
    current_max = (
        db.query(ArticleReference)
        .filter(ArticleReference.article_id == article_id)
        .order_by(ArticleReference.sequence.desc())
        .first()
    )
    base_seq = (current_max.sequence if current_max else 0)

    created: List[ArticleReference] = []
    # Preserve the parser's order — that IS the "ordered by sequence"
    # the caller asked for. We rewrite the sequence field with the
    # offset above so the batch slots after any existing rows.
    for offset, entry in enumerate(parsed, start=1):
        row = ArticleReference(
            article_id=article_id,
            sequence=base_seq + offset,
            text=entry.get("text") or "",
            doi=entry.get("doi"),
            url=entry.get("url"),
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)

    _log(
        db,
        action="reference.imported",
        actor=editor,
        target_type="article",
        target_id=str(article_id),
        ip=request.client.host if request.client else None,
        meta={"format": body.format, "count": len(created)},
    )

    return ReferenceImportResponse(
        inserted=len(created),
        entries=[ArticleReferenceRead.model_validate(r) for r in created],
    )
