"""
AI agent service: paper classification, text embeddings, and reviewer matching.

Both classification and embeddings run through the OpenAI Python SDK:
  * classify_paper()          → chat completions on ``gpt-4o-mini``
  * compute_text_embedding()  → embeddings on ``text-embedding-3-small``

Set ``OPENAI_API_KEY`` in the environment (or .env) to enable either.  When
the key is unset ``compute_text_embedding()`` returns None and reviewer
matching gracefully falls back to Jaccard keyword overlap.
"""

import json
import logging
import math
import time
import uuid
from typing import List, Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.models.reviewer import Reviewer
from app.models.submission import Submission

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────

JOURNAL_SCOPE_CATEGORIES = [
    "Artificial Intelligence — Machine Learning",
    "Artificial Intelligence — Natural Language Processing",
    "Generative AI — Large Language Models",
    "Generative AI — Diffusion Models and Image Generation",
    "Generative AI — Multimodal Systems",
    "Deep Learning — Convolutional Neural Networks",
    "Deep Learning — Transformers and Attention Mechanisms",
    "Deep Learning — Reinforcement Learning",
    "Deep Learning — Federated Learning",
    "AI for Healthcare and Bioinformatics",
    "AI for Robotics and Autonomous Systems",
    "AI Ethics, Fairness and Explainability",
    "Computer Vision and Image Processing",
    "Quantum Computing and AI",
    "Edge AI and IoT Intelligence",
    "Multidisciplinary AI Research",
]

CLASSIFY_SYSTEM_PROMPT = (
    "You are an expert academic journal editor specializing in AI research. "
    "Classify the paper into exactly one category from the provided list. "
    "Respond in JSON only: "
    '{"classified_field": "<string>", "confidence": <float 0-1>, '
    '"reasoning": "<string, max 2 sentences>"}'
)

OPENAI_CHAT_MODEL = "gpt-4o-mini"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
MAX_RETRIES = 3


def _get_openai_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured — cannot call OpenAI."
        )
    return OpenAI(api_key=settings.OPENAI_API_KEY)


# ── Retry helper ─────────────────────────────────────────

def _retry_with_backoff(fn, max_retries: int = MAX_RETRIES):
    """Call *fn* up to *max_retries* times with exponential back-off."""
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            wait = 2 ** attempt  # 1 s, 2 s, 4 s
            logger.warning(
                "Attempt %d/%d failed (%s). Retrying in %ds…",
                attempt + 1,
                max_retries,
                exc,
                wait,
            )
            time.sleep(wait)
    raise last_exc  # type: ignore[misc]


# ── Function 1: classify_paper ───────────────────────────

def classify_paper(abstract: str, title: str) -> dict:
    """
    Ask OpenAI to classify a paper into one of JOURNAL_SCOPE_CATEGORIES.

    Returns:
        {"classified_field": str, "confidence": float, "reasoning": str}

    If confidence < 0.6 the classified_field is overridden to
    ``NEEDS_MANUAL_REVIEW``.
    """
    client = _get_openai_client()

    user_message = (
        f"Title: {title}\n\n"
        f"Abstract: {abstract}\n\n"
        f"Categories: {json.dumps(JOURNAL_SCOPE_CATEGORIES)}"
    )

    def _call() -> str:
        response = client.chat.completions.create(
            model=OPENAI_CHAT_MODEL,
            max_tokens=500,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        return response.choices[0].message.content or ""

    raw_text = _retry_with_backoff(_call)

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("OpenAI returned non-JSON: %s", raw_text[:200])
        return {
            "classified_field": "NEEDS_MANUAL_REVIEW",
            "confidence": 0.0,
            "reasoning": "Failed to parse classification response.",
        }

    confidence = float(result.get("confidence", 0.0))
    classified_field = result.get("classified_field", "NEEDS_MANUAL_REVIEW")

    if confidence < 0.6:
        classified_field = "NEEDS_MANUAL_REVIEW"

    return {
        "classified_field": classified_field,
        "confidence": confidence,
        "reasoning": result.get("reasoning", ""),
    }


# ── Function 2: compute_text_embedding ───────────────────

def compute_text_embedding(text: str) -> Optional[list[float]]:
    """
    Generate a 1536-dim embedding for *text* via OpenAI.

    Returns None when ``OPENAI_API_KEY`` is not configured or the input is
    empty.  Callers must treat None as "embedding unavailable" and fall back
    accordingly (see :func:`match_reviewers`).
    """
    if not settings.OPENAI_API_KEY:
        return None
    if not text or not text.strip():
        return None

    client = _get_openai_client()

    def _call() -> list[float]:
        response = client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=text[:8000],
        )
        return response.data[0].embedding

    try:
        return _retry_with_backoff(_call)
    except Exception:
        logger.exception("OpenAI embedding request failed; returning None")
        return None


# ── Function 3: match_reviewers ──────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _jaccard(submission: Submission, reviewer: Reviewer) -> float:
    """Keyword-overlap fallback when embeddings are unavailable."""
    kw = set(kw.lower() for kw in (submission.keywords or []))
    tags = set(t.lower() for t in (reviewer.expertise_tags or []))
    total = len(kw | tags) or 1
    return len(kw & tags) / total


def match_reviewers(
    db: Session, submission_id: uuid.UUID, top_k: int = 5
) -> List[dict]:
    """
    Return the top-k reviewers best matching a submission using cosine
    similarity between the submission embedding and stored reviewer
    embeddings.  Falls back to keyword-overlap scoring when either
    the paper embedding or the reviewer embedding is unavailable
    (e.g. no OPENAI_API_KEY configured).

    Each result dict contains:
        reviewer_id, name, email, expertise_tags, current_load,
        max_assignments, similarity_score
    """
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise ValueError("Submission not found.")

    reviewers = (
        db.query(Reviewer)
        .filter(
            Reviewer.is_active == True,
            Reviewer.current_load < Reviewer.max_assignments,
        )
        .all()
    )

    paper_text = f"{submission.classified_field or ''} {submission.abstract or ''}"
    paper_embedding = compute_text_embedding(paper_text)

    scored: List[dict] = []
    for r in reviewers:
        if (
            paper_embedding is not None
            and r.embedding_vector
            and isinstance(r.embedding_vector, list)
        ):
            score = _cosine_similarity(paper_embedding, r.embedding_vector)
        else:
            score = _jaccard(submission, r)

        scored.append(
            {
                "reviewer_id": r.id,
                "name": r.name,
                "email": r.email,
                "expertise_tags": r.expertise_tags or [],
                "current_load": r.current_load,
                "max_assignments": r.max_assignments,
                "similarity_score": round(score, 4),
            }
        )

    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored[:top_k]
