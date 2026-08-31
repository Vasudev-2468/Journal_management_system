"""AI analysis persistence + light-weight NLP helpers used by /ai/*."""

from __future__ import annotations

import json
import logging
import re
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_analysis import AIAnalysis
from app.models.article import Article
from app.schemas.ai_analysis import AIAnalysisCreate, AIAnalysisUpdate

logger = logging.getLogger(__name__)


_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-']+")
_SENT_RE = re.compile(r"(?<=[.!?])\s+")

_STOPWORDS = frozenset(
    """
    a an and are as at be but by for from has have he i if in is it its of on or such
    that the their then there these they this to was were will with we you your our us
    which who whom whose what when where why how all any both each few more most other
    some such no nor not only own same so than too very can just should now
    """.split()
)


def _tokenize(text: str) -> List[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(text or "")]


def _content_tokens(text: str) -> set[str]:
    return {t for t in _tokenize(text) if t not in _STOPWORDS and len(t) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _extractive_summary(text: str, max_sentences: int = 3) -> str:
    """Cheap extractive summary: score each sentence by overlap with the global
    content-word frequency, then keep the top-N in original order.

    Deterministic and dependency-free — the LLM path lives in
    :func:`summarize_with_llm` and is chosen by the router when a key is set.
    """
    text = (text or "").strip()
    if not text:
        return ""
    sentences = [s.strip() for s in _SENT_RE.split(text) if s.strip()]
    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    freq: dict[str, int] = {}
    for tok in _tokenize(text):
        if tok in _STOPWORDS or len(tok) <= 2:
            continue
        freq[tok] = freq.get(tok, 0) + 1

    if not freq:
        return " ".join(sentences[:max_sentences])

    scored = []
    for idx, s in enumerate(sentences):
        toks = [t for t in _tokenize(s) if t not in _STOPWORDS and len(t) > 2]
        if not toks:
            score = 0.0
        else:
            score = sum(freq.get(t, 0) for t in toks) / len(toks)
        scored.append((idx, score, s))

    top = sorted(scored, key=lambda x: x[1], reverse=True)[:max_sentences]
    top.sort(key=lambda x: x[0])
    return " ".join(s for _, _, s in top)


def summarize_with_llm(text: str, max_sentences: int = 3) -> Optional[str]:
    """Ask the configured LLM to summarize the text; return None on any failure
    so the caller can fall back to the extractive summary.
    """
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=300,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize the following academic text in "
                        f"{max_sentences} sentences or fewer. Keep it neutral, "
                        "concrete, and free of marketing language."
                    ),
                },
                {"role": "user", "content": text[:12000]},
            ],
        )
        summary = (response.choices[0].message.content or "").strip()
        return summary or None
    except Exception:  # noqa: BLE001 — fallback path
        logger.exception("LLM summary failed; using extractive fallback")
        return None


def summarize_text(text: str, max_sentences: int = 3) -> str:
    """Public entrypoint: prefer LLM, fall back to extractive."""
    llm = summarize_with_llm(text, max_sentences=max_sentences)
    if llm:
        return llm
    return _extractive_summary(text, max_sentences=max_sentences)


def similarity(a: str, b: str) -> float:
    """0..1 Jaccard similarity between the content words of two texts."""
    return _jaccard(_content_tokens(a), _content_tokens(b))


def score_plagiarism(
    text: str,
    corpus: Iterable[tuple[int, str, str]],
    threshold: float = 0.35,
) -> tuple[int, list[dict]]:
    """Compare *text* against a corpus of ``(article_id, title, body)`` and
    return ``(percent_score, matches)``.

    ``percent_score`` is ``round(max_similarity * 100)`` — a fast baseline
    good enough to flag obvious copy-paste for editorial follow-up.
    Only entries above ``threshold`` are surfaced as matches.
    """
    text_tokens = _content_tokens(text)
    matches: list[dict] = []
    top = 0.0
    for article_id, title, body in corpus:
        sim = _jaccard(text_tokens, _content_tokens(f"{title} {body}"))
        if sim > top:
            top = sim
        if sim >= threshold:
            matches.append(
                {"article_id": article_id, "title": title, "similarity": round(sim, 4)}
            )
    matches.sort(key=lambda m: m["similarity"], reverse=True)
    return int(round(top * 100)), matches


class AIService:
    """Persistence layer for AIAnalysis rows."""

    def __init__(self, db: Session):
        self.db = db

    def create_analysis(self, analysis_data: AIAnalysisCreate) -> AIAnalysis:
        row = AIAnalysis(
            article_id=analysis_data.article_id,
            summary=analysis_data.summary,
            plagiarism_score=analysis_data.plagiarism_score,
            recommendations=analysis_data.recommendations,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def get_analysis(self, analysis_id: int) -> Optional[AIAnalysis]:
        return self.db.query(AIAnalysis).filter(AIAnalysis.id == analysis_id).first()

    def get_analysis_by_article(self, article_id: int) -> Optional[AIAnalysis]:
        return (
            self.db.query(AIAnalysis)
            .filter(AIAnalysis.article_id == article_id)
            .first()
        )

    def update_analysis(
        self, analysis_id: int, analysis_data: AIAnalysisUpdate
    ) -> Optional[AIAnalysis]:
        row = self.get_analysis(analysis_id)
        if row is None:
            return None
        for field, value in analysis_data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        self.db.commit()
        self.db.refresh(row)
        return row

    def delete_analysis(self, analysis_id: int) -> bool:
        row = self.get_analysis(analysis_id)
        if row is None:
            return False
        self.db.delete(row)
        self.db.commit()
        return True

    def upsert_for_article(
        self,
        article_id: int,
        summary: str,
        plagiarism_score: int,
        recommendations: Optional[List[dict]] = None,
    ) -> AIAnalysis:
        """Create or update the single AIAnalysis row for an article."""
        row = self.get_analysis_by_article(article_id)
        rec_json = json.dumps(recommendations) if recommendations else None
        if row is None:
            row = AIAnalysis(
                article_id=article_id,
                summary=summary,
                plagiarism_score=plagiarism_score,
                recommendations=rec_json,
            )
            self.db.add(row)
        else:
            row.summary = summary
            row.plagiarism_score = plagiarism_score
            row.recommendations = rec_json
        self.db.commit()
        self.db.refresh(row)
        return row

    def related_articles(
        self, article_id: int, top_k: int = 5
    ) -> List[dict]:
        """Content-similarity recommendations across the article corpus."""
        target = (
            self.db.query(Article).filter(Article.id == article_id).first()
        )
        if target is None:
            return []
        target_text = f"{target.title or ''} {target.abstract or ''} {target.content or ''}"
        target_tokens = _content_tokens(target_text)
        if not target_tokens:
            return []

        others = (
            self.db.query(Article).filter(Article.id != article_id).all()
        )
        scored = []
        for a in others:
            body = f"{a.title or ''} {a.abstract or ''} {a.content or ''}"
            sim = _jaccard(target_tokens, _content_tokens(body))
            if sim > 0:
                scored.append(
                    {
                        "article_id": a.id,
                        "title": a.title,
                        "similarity": round(sim, 4),
                    }
                )
        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:top_k]
