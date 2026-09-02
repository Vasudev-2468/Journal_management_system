"""Corrections + retractions router (spec §29, §30).

Three endpoints:
  * ``GET  /articles/{id}/corrections``  (public)   — all notices attached to an article
  * ``POST /articles/{id}/correction``   (RBAC)     — publish a correction / EoC
  * ``POST /articles/{id}/retraction``   (RBAC)     — publish a retraction

The write endpoints route through ``services.permissions.require_permission``
so a caller without the right grant is 403'd server-side — the frontend
guard is a courtesy, not a security boundary.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.article_correction import ArticleCorrection
from app.models.user import User
from app.services.permissions import (
    ACTION_CORRECT_ARTICLE,
    ACTION_RETRACT_ARTICLE,
    require_permission,
)


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

_NOTICE_PATTERN = "^(correction|retraction|expression_of_concern)$"


class CorrectionRead(BaseModel):
    id: int
    article_id: int
    notice_type: str
    title: str
    description: str
    reason: Optional[str] = None
    published_at: datetime
    published_by_email: Optional[str] = None
    doi_of_notice: Optional[str] = None


class CorrectionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str = Field(min_length=10)
    doi_of_notice: Optional[str] = None


class RetractionCreate(CorrectionCreate):
    reason: str = Field(
        min_length=3,
        description=(
            "COPE-aligned code: 'fabrication', 'plagiarism', 'redundant_publication', "
            "'ethical_violation', 'incorrect_data', 'authorship_dispute', or free text."
        ),
    )


# ── GET (public) ────────────────────────────────────────

# ── Bulk badge summary for article lists ────────────────

class ArticleNoticeSummary(BaseModel):
    article_id: int
    is_retracted: bool
    correction_count: int
    expression_of_concern_count: int


@router.get("/articles/notices/summary", response_model=list[ArticleNoticeSummary])
def notice_summaries(
    ids: str,
    db: Session = Depends(get_db),
) -> list[ArticleNoticeSummary]:
    """Batch endpoint powering the ``⚠️ Retracted`` / ``📝 Correction``
    badges on the public article list. Pass ``ids=1,2,3`` — returns one
    entry per article that carries at least one notice. Public, cheap."""
    from sqlalchemy import func

    try:
        int_ids = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be a comma-separated list of integers.")
    if not int_ids or len(int_ids) > 500:
        return []
    rows = (
        db.query(
            ArticleCorrection.article_id,
            ArticleCorrection.notice_type,
            func.count(ArticleCorrection.id).label("cnt"),
        )
        .filter(ArticleCorrection.article_id.in_(int_ids))
        .group_by(ArticleCorrection.article_id, ArticleCorrection.notice_type)
        .all()
    )
    agg: dict[int, dict] = {}
    for article_id, notice_type, cnt in rows:
        entry = agg.setdefault(article_id, {"correction": 0, "retraction": 0, "expression_of_concern": 0})
        entry[notice_type] = cnt
    return [
        ArticleNoticeSummary(
            article_id=aid,
            is_retracted=data.get("retraction", 0) > 0,
            correction_count=data.get("correction", 0),
            expression_of_concern_count=data.get("expression_of_concern", 0),
        )
        for aid, data in agg.items()
    ]


@router.get("/articles/{article_id}/corrections", response_model=list[CorrectionRead])
def list_notices(article_id: int, db: Session = Depends(get_db)) -> list[CorrectionRead]:
    """Return every correction / retraction / EoC published on an article,
    newest first. Public — the notices are meant to be seen."""
    rows = (
        db.query(ArticleCorrection)
        .filter(ArticleCorrection.article_id == article_id)
        .order_by(ArticleCorrection.published_at.desc())
        .all()
    )
    return [
        CorrectionRead(
            id=r.id, article_id=r.article_id, notice_type=r.notice_type,
            title=r.title, description=r.description, reason=r.reason,
            published_at=r.published_at, published_by_email=r.published_by_email,
            doi_of_notice=r.doi_of_notice,
        )
        for r in rows
    ]


# ── Publish a correction ────────────────────────────────

@router.post("/articles/{article_id}/correction", response_model=CorrectionRead, status_code=201)
def publish_correction(
    article_id: int,
    body: CorrectionCreate,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission(ACTION_CORRECT_ARTICLE)),
) -> CorrectionRead:
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")
    notice = ArticleCorrection(
        article_id=article.id,
        notice_type="correction",
        title=body.title,
        description=body.description,
        doi_of_notice=body.doi_of_notice,
        published_by=editor.id,
        published_by_email=editor.email,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    _notify_corresponding_author(db, article, notice)
    return CorrectionRead(
        id=notice.id, article_id=notice.article_id, notice_type=notice.notice_type,
        title=notice.title, description=notice.description, reason=notice.reason,
        published_at=notice.published_at, published_by_email=notice.published_by_email,
        doi_of_notice=notice.doi_of_notice,
    )


# ── Publish a retraction ────────────────────────────────

def _notify_corresponding_author(
    db: Session,
    article: Article,
    notice: ArticleCorrection,
) -> None:
    """Email the corresponding author when a retraction or major
    correction is published. COPE guidance calls for prompt notice
    to authors before public discovery. Best-effort — a delivery
    failure does not break the notice publish."""
    from app.services.email_service import _send_and_log, _wrap

    to_email = None
    if getattr(article, "author", None) is not None:
        to_email = getattr(article.author, "email", None)
    if not to_email:
        return

    banner_colour = "#dc2626" if notice.notice_type == "retraction" else "#1e40af"
    heading = "Retraction notice" if notice.notice_type == "retraction" else "Correction notice"
    body = _wrap(
        f"""
        <p>Dear author,</p>
        <p>A <strong style="color:{banner_colour}">{heading.lower()}</strong> has been published on
           your article <strong>{article.title}</strong>.</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:12px 16px;
                    border-left:4px solid {banner_colour};border-radius:6px;margin:16px 0;">
          <p style="margin:0;font-weight:600;">{notice.title}</p>
          <p style="margin:8px 0 0;white-space:pre-line;">{notice.description}</p>
          {f'<p style="margin:8px 0 0;color:{banner_colour};font-size:13px;">Reason: {notice.reason}</p>' if notice.reason else ''}
        </div>
        <p style="font-size:13px;color:#6b7280;">The original article remains accessible; the
           notice is displayed alongside it. If you have questions about this decision, please
           reply to this email or contact the editorial office.</p>
        <p>Regards,<br><strong>Editorial Office</strong></p>
        """
    )
    subject = (
        f"{heading}: {article.title}"[:200]
    )
    try:
        _send_and_log(to_email, subject, body, f"article_{notice.notice_type}")
    except Exception:  # noqa: BLE001
        pass


@router.post("/articles/{article_id}/retraction", response_model=CorrectionRead, status_code=201)
def publish_retraction(
    article_id: int,
    body: RetractionCreate,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission(ACTION_RETRACT_ARTICLE)),
) -> CorrectionRead:
    """Publishing a retraction does NOT delete or hide the original —
    spec §30 requires the article to remain accessible with the
    retraction notice prominently displayed. That rendering lives on
    the public article page; this endpoint only records the notice."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")
    # Refuse a second retraction — once retracted, further retractions are
    # nonsensical. Corrections and EoCs may still be published.
    existing = (
        db.query(ArticleCorrection)
        .filter(ArticleCorrection.article_id == article_id)
        .filter(ArticleCorrection.notice_type == "retraction")
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Article is already retracted (notice #{existing.id}).",
        )
    notice = ArticleCorrection(
        article_id=article.id,
        notice_type="retraction",
        title=body.title,
        description=body.description,
        reason=body.reason,
        doi_of_notice=body.doi_of_notice,
        published_by=editor.id,
        published_by_email=editor.email,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    _notify_corresponding_author(db, article, notice)
    return CorrectionRead(
        id=notice.id, article_id=notice.article_id, notice_type=notice.notice_type,
        title=notice.title, description=notice.description, reason=notice.reason,
        published_at=notice.published_at, published_by_email=notice.published_by_email,
        doi_of_notice=notice.doi_of_notice,
    )
