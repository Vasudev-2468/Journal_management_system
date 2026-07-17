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

RERANK_SYSTEM_PROMPT = (
    "You are a peer-review editor selecting the best-matched reviewers for a submitted paper. "
    "You are given the paper's title, abstract, keywords, and classified subfield, plus a list "
    "of candidate reviewers (each with a name, affiliation, and declared expertise). "
    "Rank the candidates from best to worst topical fit for reviewing THIS paper.\n\n"
    "Judge on:\n"
    "- Overlap between the paper's topic and the candidate's declared expertise.\n"
    "- Whether the candidate's affiliation suggests active work in a related area.\n"
    "- A short but on-topic expertise beats a long but off-topic one — don't reward verbosity.\n\n"
    "Respond in JSON only with this exact schema:\n"
    "{\n"
    '  "ranked": [\n'
    '    {"index": <int>, "score": <float 0-1>, "reason": "<one short sentence>"},\n'
    "    ...\n"
    "  ]\n"
    "}\n\n"
    "Rules:\n"
    "- Include EVERY candidate exactly once in `ranked`, using the 0-based index from the input list.\n"
    "- `score` is your assessment of topical fit only (1.0 = perfect fit, 0.0 = unrelated).\n"
    "- `reason` is one short sentence naming the specific overlap or gap. No lists.\n"
    "- Do not add, remove, rename, or invent candidates."
)

SEMANTIC_CHECK_SYSTEM_PROMPT = (
    "You are an expert peer-review editor screening a submitted paper before it goes to reviewers. "
    "You are given the paper's title, abstract, and declared keywords. "
    "Judge three things and respond in JSON only with this exact schema:\n"
    "{\n"
    '  "abstract_title_alignment": {"status": "pass|warning|fail", "detail": "<one sentence>"},\n'
    '  "keyword_coverage":         {"status": "pass|warning|fail", "detail": "<one sentence>", '
    '"unsupported_keywords": ["<kw>", ...]},\n'
    '  "abstract_structure":       {"status": "pass|warning|fail", "detail": "<one sentence>", '
    '"missing_elements": ["background|method|result|contribution", ...]}\n'
    "}\n"
    "Rules:\n"
    "- alignment: pass if the abstract clearly describes what the title promises; warning if partial; fail if unrelated.\n"
    "- keyword_coverage: pass if every declared keyword is discussed or plainly implied by the abstract. "
    "List any keywords that are NOT supported by the abstract in `unsupported_keywords`. "
    "Empty array means all keywords are covered.\n"
    "- abstract_structure: pass if the abstract contains background/motivation, method, and result/contribution. "
    "warning if one is thin, fail if two or more are missing. "
    "List which of {background, method, result, contribution} are missing in `missing_elements`.\n"
    "Be strict but fair. Do not invent issues. Detail fields must be one short sentence, no lists inside."
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


# ── Function 1b: semantic_format_check ───────────────────

_SEMANTIC_CHECK_KEYS = ("abstract_title_alignment", "keyword_coverage", "abstract_structure")
_SEMANTIC_STATUSES = {"pass", "warning", "fail"}


def _skipped_semantic_result(reason: str) -> dict:
    skipped = {"status": "skipped", "detail": reason}
    return {
        "abstract_title_alignment": dict(skipped),
        "keyword_coverage": {**skipped, "unsupported_keywords": []},
        "abstract_structure": {**skipped, "missing_elements": []},
        "skipped_reason": reason,
    }


def semantic_format_check(title: str, abstract: str, keywords: list[str]) -> dict:
    """
    LLM-backed complement to the mechanical checks in Agent 2.

    Judges alignment between title and abstract, whether declared keywords are
    actually supported by the abstract, and whether the abstract has the usual
    background/method/result structure.

    Returns a dict shaped like SEMANTIC_CHECK_SYSTEM_PROMPT's schema. When the
    API key is missing, the input is too thin to judge, or the LLM call fails,
    returns a "skipped" result so the caller can render a neutral row instead
    of failing the whole pipeline.
    """
    if not settings.OPENAI_API_KEY:
        return _skipped_semantic_result("OPENAI_API_KEY not configured")
    if not (title and title.strip()) or not (abstract and abstract.strip()):
        return _skipped_semantic_result("Title or abstract missing")

    client = _get_openai_client()
    user_message = (
        f"Title: {title}\n\n"
        f"Abstract: {abstract}\n\n"
        f"Declared keywords: {json.dumps(keywords or [])}"
    )

    def _call() -> str:
        response = client.chat.completions.create(
            model=OPENAI_CHAT_MODEL,
            max_tokens=500,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SEMANTIC_CHECK_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        return response.choices[0].message.content or ""

    try:
        raw_text = _retry_with_backoff(_call)
    except Exception:
        logger.exception("Semantic format check: OpenAI call failed")
        return _skipped_semantic_result("LLM call failed")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Semantic format check returned non-JSON: %s", raw_text[:200])
        return _skipped_semantic_result("LLM returned invalid JSON")

    result: dict = {}
    for key in _SEMANTIC_CHECK_KEYS:
        node = parsed.get(key) or {}
        status = node.get("status") if isinstance(node, dict) else None
        if status not in _SEMANTIC_STATUSES:
            status = "warning"
        detail = (node.get("detail") if isinstance(node, dict) else None) or ""
        entry = {"status": status, "detail": str(detail)[:300]}
        if key == "keyword_coverage":
            unsupported = node.get("unsupported_keywords") if isinstance(node, dict) else None
            entry["unsupported_keywords"] = [
                str(k) for k in (unsupported or []) if isinstance(k, (str, int))
            ]
        elif key == "abstract_structure":
            missing = node.get("missing_elements") if isinstance(node, dict) else None
            entry["missing_elements"] = [
                str(m) for m in (missing or []) if isinstance(m, (str, int))
            ]
        result[key] = entry
    return result


# ── Function 1c: rerank_reviewer_candidates ──────────────

# Cap how many candidates we send to the LLM in one call. Above this, the
# prompt gets large and rerank quality drops off — the caller should
# prefilter (e.g. by internal keyword match) if it needs to.
MAX_RERANK_CANDIDATES = 20


def rerank_reviewer_candidates(
    submission_meta: dict,
    candidates: list[dict],
) -> list[dict]:
    """
    LLM-backed reranking of reviewer candidates for a submission.

    ``submission_meta`` should contain at least ``title`` and ``abstract``;
    ``keywords`` (list) and ``classified_field`` (str) are used when present.
    ``candidates`` is a list of dicts. Each candidate must have ``name`` and
    should have ``affiliation`` and ``expertise`` when available.

    Returns a list of dicts:
        [{"index": <int>, "score": <float 0-1>, "reason": "<sentence>"}, ...]
    covering every input candidate in ranked order (best first).

    When the API key is missing, the candidate list is empty or ≤1, the LLM
    call fails, or the response is malformed, returns an empty list. Callers
    must treat an empty result as "reranking unavailable — use the incoming
    order".
    """
    if not settings.OPENAI_API_KEY:
        return []
    if not candidates or len(candidates) <= 1:
        return []

    trimmed = candidates[:MAX_RERANK_CANDIDATES]
    title = (submission_meta.get("title") or "").strip()
    abstract = (submission_meta.get("abstract") or "").strip()
    if not title and not abstract:
        return []

    keywords = submission_meta.get("keywords") or []
    classified_field = submission_meta.get("classified_field") or ""

    candidate_lines = []
    for i, c in enumerate(trimmed):
        candidate_lines.append({
            "index": i,
            "name": (c.get("name") or "").strip(),
            "affiliation": (c.get("affiliation") or "").strip(),
            "expertise": (c.get("expertise") or "").strip(),
        })

    user_message = (
        f"Paper title: {title}\n\n"
        f"Abstract: {abstract}\n\n"
        f"Declared keywords: {json.dumps(keywords)}\n"
        f"Classified subfield: {classified_field}\n\n"
        f"Candidates:\n{json.dumps(candidate_lines, ensure_ascii=False)}"
    )

    client = _get_openai_client()

    def _call() -> str:
        response = client.chat.completions.create(
            model=OPENAI_CHAT_MODEL,
            max_tokens=800,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": RERANK_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        return response.choices[0].message.content or ""

    try:
        raw_text = _retry_with_backoff(_call)
    except Exception:
        logger.exception("Reviewer reranker: OpenAI call failed")
        return []

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Reviewer reranker returned non-JSON: %s", raw_text[:200])
        return []

    ranked_raw = parsed.get("ranked")
    if not isinstance(ranked_raw, list):
        return []

    n = len(trimmed)
    seen = set()
    cleaned: list[dict] = []
    for entry in ranked_raw:
        if not isinstance(entry, dict):
            continue
        try:
            idx = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= n or idx in seen:
            continue
        try:
            score = float(entry.get("score", 0.0))
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(1.0, score))
        reason = str(entry.get("reason") or "")[:300]
        seen.add(idx)
        cleaned.append({"index": idx, "score": score, "reason": reason})

    # Append any candidates the LLM forgot, at the end with score 0, so the
    # caller can still surface them.
    for i in range(n):
        if i not in seen:
            cleaned.append({"index": i, "score": 0.0, "reason": "Not ranked by LLM"})

    return cleaned


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
