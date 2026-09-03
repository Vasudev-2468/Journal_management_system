"""Editorial Comment Moderation Agent.

Deterministic Python — no LLM. Reads reviewer comments and returns
per-comment suggestions the editor sees inside the moderation
workspace. It NEVER decides — the editor stays authoritative.

What it flags (spec §31):
    - inappropriate language (small hand-curated word list)
    - reveals-reviewer-identity signals (first person + name-like tokens)
    - potential duplicates across reviewers (token-set jaccard)
    - very short / low-signal comments

Output shape — one entry per input comment, keyed by
(review_id, comment_kind, comment_index), so the frontend can render
the suggestion next to the "Edit / Approve / Confidential / Remove"
buttons without an extra join.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.review import Review, ReviewState


# ── Word lists — small and boring. Editors can override in review. ──

_HARSH_TERMS = {
    "wrong", "terrible", "useless", "stupid", "idiotic", "garbage",
    "nonsense", "bullshit", "clueless", "worthless", "trivial",
    "amateur", "childish", "incompetent",
}
_IDENTITY_LEAKERS = {
    # "I" alone is fine in a review — but combined with reviewer-only
    # markers ("as a reviewer", "in my lab") it can leak identity.
    "as a reviewer", "in my lab", "in our lab", "my group",
    "my paper", "our paper", "i am the reviewer",
}


@dataclass
class ModerationSuggestion:
    review_id: str
    comment_kind: str          # 'major' | 'minor'
    comment_index: int
    flags: List[str] = field(default_factory=list)     # short slug list
    reasons: List[str] = field(default_factory=list)   # human sentence per flag
    duplicate_of: List[Dict[str, Any]] = field(default_factory=list)
    suggested_edit: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────

def _load_list(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:  # noqa: BLE001
        return []


def _extract_text(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("comment") or item.get("text") or "")
    return ""


_WORD_RE = re.compile(r"[A-Za-z]{3,}")


def _tokens(text: str) -> set:
    return {t.lower() for t in _WORD_RE.findall(text or "")}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


# ── Per-comment scoring ─────────────────────────────────

def _score_one(text: str) -> Tuple[List[str], List[str]]:
    flags: List[str] = []
    reasons: List[str] = []
    if not text or not text.strip():
        flags.append("empty")
        reasons.append("Comment body is empty or whitespace-only.")
        return flags, reasons

    lower = text.lower()

    hit_terms = sorted({t for t in _HARSH_TERMS if re.search(rf"\b{re.escape(t)}\b", lower)})
    if hit_terms:
        flags.append("harsh_language")
        reasons.append(f"Contains potentially harsh terms: {', '.join(hit_terms[:5])}.")

    hit_leakers = sorted({p for p in _IDENTITY_LEAKERS if p in lower})
    if hit_leakers:
        flags.append("identity_leak")
        reasons.append(f"Phrases may reveal reviewer identity: {', '.join(hit_leakers[:3])}.")

    if len(text.strip()) < 25:
        flags.append("low_signal")
        reasons.append("Comment is very short — may not be actionable for the author.")

    return flags, reasons


def _softened_suggestion(text: str) -> Optional[str]:
    """Cheapest possible "softer wording" — never used silently, only
    surfaced to the editor as a suggestion. Replaces the harshest terms
    with neutral asks. Returns None when no substitutions apply."""
    lower = text.lower()
    substitutions = [
        (r"\bcompletely wrong\b",        "requires substantial clarification"),
        (r"\bwrong\b",                    "requires clarification"),
        (r"\bterrible\b",                 "in need of significant improvement"),
        (r"\buseless\b",                  "does not appear to add value"),
        (r"\bstupid\b",                   "unclear"),
        (r"\bnonsense\b",                 "difficult to follow"),
        (r"\bworthless\b",                "of unclear value"),
        (r"\bincompetent(ly)?\b",         "in need of methodological review"),
        (r"\bclueless\b",                 "unclear"),
        (r"\bamateur(ish)?\b",            "unpolished"),
        (r"\bchildish\b",                 "not sufficiently rigorous"),
    ]
    changed = False
    out = text
    for pat, repl in substitutions:
        new = re.sub(pat, repl, out, flags=re.IGNORECASE)
        if new != out:
            out = new
            changed = True
    return out if changed else None


# ── Entry point ─────────────────────────────────────────

def analyze_comments(db: Session, submission_id) -> Dict[str, ModerationSuggestion]:
    """Return a dict keyed by ``"{review_id}:{kind}:{index}"`` mapping
    to the moderation suggestion for that comment. The frontend uses
    the same key to align suggestions with the moderation form rows."""

    from ..models.submission import Submission

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        return {}

    reviews = [r for r in (submission.reviews or []) if r.state == ReviewState.submitted]
    if not reviews:
        return {}

    target_round = max((r.round_number or 1 for r in reviews), default=1)
    current = [r for r in reviews if (r.round_number or 1) == target_round]

    # Build the per-comment table + tokens for duplicate detection.
    entries: List[Tuple[str, str, int, str, set]] = []
    for r in current:
        for kind, raw in (("major", r.major_comments), ("minor", r.minor_comments)):
            for i, item in enumerate(_load_list(raw)):
                text = _extract_text(item)
                entries.append((str(r.id), kind, i, text, _tokens(text)))

    # Cross-reviewer duplicate detection (jaccard > 0.55). Skip same
    # reviewer + same comment.
    duplicates_map: Dict[str, List[Dict[str, Any]]] = {}
    DUP_THRESHOLD = 0.55
    for a in range(len(entries)):
        rid_a, kind_a, idx_a, text_a, tok_a = entries[a]
        for b in range(a + 1, len(entries)):
            rid_b, kind_b, idx_b, text_b, tok_b = entries[b]
            if rid_a == rid_b:
                continue
            score = _jaccard(tok_a, tok_b)
            if score >= DUP_THRESHOLD:
                key_a = f"{rid_a}:{kind_a}:{idx_a}"
                key_b = f"{rid_b}:{kind_b}:{idx_b}"
                duplicates_map.setdefault(key_a, []).append({
                    "review_id": rid_b, "comment_kind": kind_b, "comment_index": idx_b,
                    "similarity": round(score, 2),
                })
                duplicates_map.setdefault(key_b, []).append({
                    "review_id": rid_a, "comment_kind": kind_a, "comment_index": idx_a,
                    "similarity": round(score, 2),
                })

    result: Dict[str, ModerationSuggestion] = {}
    for rid, kind, idx, text, _tok in entries:
        key = f"{rid}:{kind}:{idx}"
        flags, reasons = _score_one(text)
        dups = duplicates_map.get(key, [])
        if dups:
            flags.append("possible_duplicate")
            reasons.append(
                f"Similar in wording to {len(dups)} other reviewer comment"
                f"{'s' if len(dups) != 1 else ''} — consider consolidating."
            )
        result[key] = ModerationSuggestion(
            review_id=rid,
            comment_kind=kind,
            comment_index=idx,
            flags=flags,
            reasons=reasons,
            duplicate_of=dups,
            suggested_edit=_softened_suggestion(text),
        )
    return result
