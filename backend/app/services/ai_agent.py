"""
AI agent service: paper classification, text embeddings, and reviewer matching.

Uses the Anthropic Python SDK for classification and sentence-transformers
for cost-efficient embedding generation.
"""

import json
import logging
import math
import time
import uuid
from typing import List, Optional

import anthropic
from sentence_transformers import SentenceTransformer
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

CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAX_RETRIES = 3
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# Lazy-loaded singleton so the model is only downloaded once per process.
_embedding_model: Optional[SentenceTransformer] = None


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedding_model


def _get_anthropic_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


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
    Call Claude to classify a paper into one of JOURNAL_SCOPE_CATEGORIES.

    Returns:
        {"classified_field": str, "confidence": float, "reasoning": str}

    If confidence < 0.6 the classified_field is overridden to
    ``NEEDS_MANUAL_REVIEW``.
    """
    client = _get_anthropic_client()

    user_message = (
        f"Title: {title}\n\n"
        f"Abstract: {abstract}\n\n"
        f"Categories: {json.dumps(JOURNAL_SCOPE_CATEGORIES)}"
    )

    def _call():
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=500,
            system=CLASSIFY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    raw_text = _retry_with_backoff(_call)

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Claude returned non-JSON: %s", raw_text[:200])
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

def compute_text_embedding(text: str) -> list[float]:
    """
    Generate a normalised embedding vector for *text* using
    sentence-transformers (all-MiniLM-L6-v2).

    Returns a list of floats (384 dimensions).
    """
    model = _get_embedding_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


# ── Function 3: match_reviewers ──────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def match_reviewers(
    db: Session, submission_id: uuid.UUID, top_k: int = 5
) -> List[dict]:
    """
    Return the top-k reviewers best matching a submission using cosine
    similarity between the submission embedding and stored reviewer
    embeddings.  Falls back to keyword-overlap scoring if embeddings are
    not yet available.

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

    # Build a paper embedding from abstract + classified_field
    paper_text = f"{submission.classified_field or ''} {submission.abstract or ''}"
    paper_embedding = compute_text_embedding(paper_text)

    scored: List[dict] = []
    for r in reviewers:
        if r.embedding_vector and isinstance(r.embedding_vector, list):
            score = _cosine_similarity(paper_embedding, r.embedding_vector)
        else:
            # Fallback: keyword overlap (Jaccard)
            kw = set(kw.lower() for kw in (submission.keywords or []))
            tags = set(t.lower() for t in (r.expertise_tags or []))
            total = len(kw | tags) or 1
            score = len(kw & tags) / total

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
