"""Public cited-by endpoint.

Given an article id, resolve the article's DOI (checking the ``issue_articles``
join first, then falling back to the ``production_records`` row) and hand the
DOI off to ``cited_by_service.fetch_cited_by``. The response is a JSON payload
the frontend renders directly.

Kept public because Crossref citation counts are public knowledge — the moment
a DOI is registered anyone can query ``api.crossref.org/works/{doi}`` for it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.production_stage import ProductionRecord
from app.models.volume import IssueArticle
from app.services.cited_by_service import fetch_cited_by

router = APIRouter()


def _resolve_doi(db: Session, article_id: int) -> str | None:
    """Best-effort DOI lookup for an article.

    Preference order:
      1. ``issue_articles.doi`` — the canonical publication record.
      2. ``production_records.doi`` — set during the DOI-assigned production
         stage, useful for articles that have not yet been slotted into an
         issue.

    Returns ``None`` when neither table has a DOI on record — the router
    turns that into the "no DOI" empty response, not a 404, so the
    frontend can show its empty state without a request failing.
    """
    issue_row = (
        db.query(IssueArticle.doi)
        .filter(IssueArticle.article_id == article_id, IssueArticle.doi.isnot(None))
        .first()
    )
    if issue_row and issue_row[0]:
        return issue_row[0].strip()

    # ProductionRecord is keyed by submission_id — the join is only useful
    # if the article carries a submission linkage. When either the linkage
    # or the column is missing we simply skip the fallback silently.
    submission_id = getattr(Article, "submission_id", None)
    if submission_id is not None:
        row = (
            db.query(ProductionRecord.doi)
            .join(Article, Article.submission_id == ProductionRecord.submission_id)
            .filter(Article.id == article_id, ProductionRecord.doi.isnot(None))
            .first()
        )
        if row and row[0]:
            return row[0].strip()

    return None


@router.get("/article/{article_id}")
def get_cited_by_for_article(article_id: int, db: Session = Depends(get_db)) -> dict:
    """Return ``{count, citing}`` for the article's DOI.

    * 404 when the article itself does not exist.
    * ``{"count": 0, "citing": [], "detail": "no DOI"}`` when the article
      exists but has not yet been assigned a DOI.
    * Otherwise the service response passes through untouched.
    """
    article = db.query(Article.id).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    doi = _resolve_doi(db, article_id)
    if not doi:
        return {"count": 0, "citing": [], "detail": "no DOI"}

    result = fetch_cited_by(doi)
    return {
        "count": int(result.get("count") or 0),
        "citing": result.get("citing") or [],
        "doi": doi,
    }
