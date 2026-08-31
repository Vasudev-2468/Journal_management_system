"""AI-facing endpoints: summary, plagiarism, recommendations, full analysis.

The heavy lifting lives in :mod:`app.services.ai_service`. This router only
sequences DB reads, calls the service, and shapes responses.
"""

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.plagiarism_check import PlagiarismCheck
from app.schemas.ai_analysis import (
    AIAnalysisRead,
    AnalysisRunResponse,
    PlagiarismMatch,
    PlagiarismRequest,
    PlagiarismResponse,
    RecommendationsResponse,
    SummarizeRequest,
    SummarizeResponse,
)
from app.services.ai_service import AIService, score_plagiarism, summarize_text

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/status")
def ai_status():
    return {"status": "AI service available"}


@router.post("/summary", response_model=SummarizeResponse)
def summarize(payload: SummarizeRequest):
    """Summarize an arbitrary block of text (article body, abstract, etc.)."""
    summary = summarize_text(payload.text, max_sentences=payload.max_sentences or 3)
    return SummarizeResponse(summary=summary)


@router.get("/summary/{article_id}", response_model=SummarizeResponse)
def summarize_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    source = article.abstract or article.content or article.title or ""
    return SummarizeResponse(summary=summarize_text(source))


@router.post("/plagiarism", response_model=PlagiarismResponse)
def check_plagiarism(
    payload: PlagiarismRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Score a piece of text against the article corpus (optionally scoped).

    Every call persists a ``PlagiarismCheck`` row so editors can review the
    screening history for a manuscript. The response shape is unchanged.
    """
    q = db.query(Article)
    if payload.corpus_article_ids:
        q = q.filter(Article.id.in_(payload.corpus_article_ids))
    corpus = [
        (a.id, a.title or "", f"{a.abstract or ''} {a.content or ''}")
        for a in q.all()
    ]
    score, matches = score_plagiarism(payload.text, corpus)

    # Persist an auditable record of the run. Isolated in try/except so a
    # storage failure never breaks the actual plagiarism-check response.
    try:
        top_match_id = matches[0].get("article_id") if matches else None
        submission_id = getattr(payload, "submission_id", None)
        actor_user_id = getattr(getattr(request.state, "user", None), "id", None)
        text_hash = hashlib.sha256(payload.text.encode("utf-8")).hexdigest()
        db.add(
            PlagiarismCheck(
                submission_id=str(submission_id) if submission_id else None,
                text_hash=text_hash,
                score=int(score),
                top_match_id=top_match_id,
                created_by_user_id=actor_user_id,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 — logging only, do not break the response
        db.rollback()
        logger.exception("Failed to persist PlagiarismCheck row")

    return PlagiarismResponse(
        score=score,
        matches=[PlagiarismMatch(**m) for m in matches],
    )


@router.get("/recommendations/{article_id}", response_model=RecommendationsResponse)
def recommendations(article_id: int, db: Session = Depends(get_db)):
    """Return the top related articles based on shared content vocabulary."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    related = AIService(db).related_articles(article_id)
    return RecommendationsResponse(article_id=article_id, related=related)


@router.post("/analyze/{article_id}", response_model=AnalysisRunResponse)
def analyze_article(article_id: int, db: Session = Depends(get_db)):
    """Run summary + plagiarism + recommendations and persist the result."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    body = f"{article.abstract or ''} {article.content or ''}".strip()
    summary = summarize_text(body or article.title or "")

    corpus = [
        (a.id, a.title or "", f"{a.abstract or ''} {a.content or ''}")
        for a in db.query(Article).filter(Article.id != article_id).all()
    ]
    score, matches = score_plagiarism(body, corpus)

    service = AIService(db)
    related = service.related_articles(article_id)

    row = service.upsert_for_article(
        article_id=article_id,
        summary=summary,
        plagiarism_score=score,
        recommendations=related,
    )
    return AnalysisRunResponse.model_validate(row)


@router.get("/analysis/{analysis_id}", response_model=AIAnalysisRead)
def get_analysis(analysis_id: int, db: Session = Depends(get_db)):
    row = AIService(db).get_analysis(analysis_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row
