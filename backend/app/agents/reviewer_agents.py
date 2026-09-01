"""
Reviewer-facing agents (spec §24).

Three heuristic-first agents that assist the reviewer inside the
review-form workspace and, after submission, hand the editor a
structured summary. Each function is pure and deterministic — no
network side-effects, no paid LLM calls — so the review form can lean
on them in real time without a budget or a rate limit.

  * :func:`run_review_assistant` — while the reviewer is writing
      ("Review Assistant" agent). Scans the draft for missing
      structure, thin justification, and contradictions between
      the recommendation and the comments. Returns a list of
      actionable hints. Never rewrites the reviewer's prose.

  * :func:`run_review_quality_check` — before submission ("Review
      Quality" agent). Blocks submission when a mandatory question
      is unanswered, the comments-to-authors block is empty, or a
      "reject" verdict lacks a listed concern. Returns
      ``(ok: bool, blockers: list[str], warnings: list[str])``.

  * :func:`run_editor_summary_agent` — post-submission ("Editor
      Summary" agent). Compresses the reviewer's submission into
      the six-slot structure the editor dashboard shows:
      strengths / weaknesses / major concerns / minor concerns /
      recommendation / one-line take.

The wiring pattern is the same as the intake-side agents in
``app/agents/agent{0..5}_*.py`` — a router imports the function,
runs it on demand, persists the result on the Review row.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ── Rubric contract ─────────────────────────────────────
#
# The structured review form (spec §9-13) is fully described by this
# rubric so the reviewer form, the assistant, and the quality check
# share one source of truth. Any change here reflects in the frontend
# via the /reviewer-portal/rubric endpoint.

@dataclass
class RubricOption:
    value: str
    label: str


@dataclass
class RubricQuestion:
    key: str
    prompt: str
    options: List[RubricOption]
    mandatory: bool = True
    kind: str = "single"  # single | text
    section: str = "general"


def _quality_scale() -> List[RubricOption]:
    return [
        RubricOption("excellent", "Excellent"),
        RubricOption("good", "Good"),
        RubricOption("average", "Average"),
        RubricOption("poor", "Poor"),
    ]


def _yesno_scale() -> List[RubricOption]:
    return [
        RubricOption("yes", "Yes"),
        RubricOption("partially", "Partially"),
        RubricOption("no", "No"),
    ]


RUBRIC: List[RubricQuestion] = [
    # Section A — Basic scientific evaluation (yes/partially/no)
    RubricQuestion("in_scope",            "Is the manuscript within the scope of the journal?",  _yesno_scale(), section="scientific"),
    RubricQuestion("research_question",   "Is the research question clearly defined?",           _yesno_scale(), section="scientific"),
    RubricQuestion("novelty_contribution","Is the manuscript sufficiently novel?",               _yesno_scale(), section="scientific"),
    RubricQuestion("method_appropriate",  "Is the methodology appropriate?",                     _yesno_scale(), section="scientific"),
    RubricQuestion("results_supported",   "Are the results adequately supported?",               _yesno_scale(), section="scientific"),
    # Section B — Detailed rating scales
    RubricQuestion("originality",         "Originality",                                         _quality_scale(), section="general"),
    RubricQuestion("methodology",         "Methodology",                                         _quality_scale(), section="general"),
    RubricQuestion("technical_quality",   "Technical Quality",                                   _quality_scale(), section="general"),
    RubricQuestion("clarity",             "Presentation",                                        _quality_scale(), section="general"),
    RubricQuestion("references",          "References",                                          _quality_scale(), section="general"),
]

RUBRIC_BY_KEY: Dict[str, RubricQuestion] = {q.key: q for q in RUBRIC}


RECOMMENDATION_OPTIONS = [
    ("accept",         "Accept"),
    ("minor_revision", "Minor Revision"),
    ("major_revision", "Major Revision"),
    ("reject",         "Reject"),
]

CONFIDENCE_OPTIONS = [
    ("high",   "High"),
    ("medium", "Medium"),
    ("low",    "Low"),
]


# ── Helpers ─────────────────────────────────────────────

_WORD_RE = re.compile(r"[A-Za-z']+")


def _word_count(text: Optional[str]) -> int:
    if not text:
        return 0
    return len(_WORD_RE.findall(text))


def _normalize_answers(payload: Dict[str, Any]) -> Dict[str, str]:
    answers = payload.get("rubric_answers") or {}
    if not isinstance(answers, dict):
        return {}
    out: Dict[str, str] = {}
    for k, v in answers.items():
        if isinstance(v, str):
            out[str(k)] = v.strip().lower()
    return out


def _text_field(payload: Dict[str, Any], field_name: str) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str):
        return ""
    return value.strip()


def _list_field(payload: Dict[str, Any], field_name: str) -> List[str]:
    """Normalise a repeating-comment field to a list of non-empty
    stripped strings. Handles both list and stringly-formatted input
    so the frontend can send either without failing validation."""
    value = payload.get(field_name)
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _structured_comments(payload: Dict[str, Any], field_name: str) -> List[Dict[str, str]]:
    """Normalise a structured Major/Minor comment list.

    The current form sends ``[{page?, section?, line?, comment}]`` per
    spec §3-4. Older drafts may still carry plain strings — accept
    both so the reviewer doesn't lose work on the upgrade."""
    raw = payload.get(field_name)
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for row in raw:
        if isinstance(row, str):
            if row.strip():
                out.append({"page": "", "section": "", "line": "", "comment": row.strip()})
            continue
        if not isinstance(row, dict):
            continue
        comment = str(row.get("comment") or "").strip()
        if not comment:
            continue
        out.append({
            "page": str(row.get("page") or "").strip(),
            "section": str(row.get("section") or "").strip(),
            "line": str(row.get("line") or "").strip(),
            "comment": comment,
        })
    return out


def _comment_texts(entries: List[Dict[str, str]]) -> List[str]:
    """Flatten a structured comment list to the plain string form
    older code (Editor Summary buckets) still consumes."""
    return [e["comment"] for e in entries if e.get("comment")]


def format_comment(entry: Dict[str, str]) -> str:
    """Render a single structured comment as 'Page X, Section Y — comment'.
    Used by the /report endpoint and the Author Revision Checklist so
    the editor sees the location alongside the reviewer's prose."""
    parts = []
    if entry.get("page"):
        parts.append(f"Page {entry['page']}")
    if entry.get("section"):
        parts.append(entry["section"])
    if entry.get("line"):
        parts.append(f"line {entry['line']}")
    header = ", ".join(parts)
    if header:
        return f"{header} — {entry['comment']}"
    return entry["comment"]


def _annotations(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    ann = payload.get("page_annotations")
    if not isinstance(ann, list):
        return []
    out: List[Dict[str, Any]] = []
    for row in ann:
        if not isinstance(row, dict):
            continue
        page = row.get("page")
        lines = row.get("lines") or ""
        kind = str(row.get("type") or "").strip().lower() or "suggestion"
        text = str(row.get("text") or "").strip()
        if not text or not isinstance(page, int) or page < 1:
            continue
        out.append({"page": page, "lines": str(lines), "type": kind, "text": text})
    return out


# ── Agent 3: Review Assistant ───────────────────────────

@dataclass
class AssistantHint:
    severity: str   # "info" | "warning"
    code: str
    message: str


def run_review_assistant(payload: Dict[str, Any]) -> List[AssistantHint]:
    """Scan a draft for structural gaps and gentle nudges. Never
    rewrites the reviewer's comments — the reviewer's judgement stays
    theirs. Returns an ordered list of hints (info first, warnings
    after) so the frontend can render them as an unobtrusive stack.
    """
    hints: List[AssistantHint] = []
    answers = _normalize_answers(payload)
    overall = _text_field(payload, "overall_assessment")
    comments_authors = _text_field(payload, "comments_to_authors")
    comments_editor = _text_field(payload, "comments_to_editor")
    suggestions_list = _list_field(payload, "suggestions")
    suggestions_legacy = _text_field(payload, "suggestions_to_authors")
    recommendation = _text_field(payload, "recommendation").lower()
    confidence = _text_field(payload, "confidence").lower()
    majors_struct = _structured_comments(payload, "major_comments")
    minors_struct = _structured_comments(payload, "minor_comments")
    majors = _comment_texts(majors_struct)
    minors = _comment_texts(minors_struct)
    ethics_flag = bool(payload.get("ethics_flag"))
    ethics_note = _text_field(payload, "ethics_note")

    # Overall assessment missing but the reviewer has already written
    # comments? Nudge them to summarise at the top so the editor's
    # card is coherent.
    if not overall and (majors or minors or comments_authors):
        hints.append(AssistantHint(
            severity="info",
            code="overall_missing",
            message="Add an Overall Assessment paragraph — one paragraph summarising the paper's contribution and your read of it.",
        ))

    # Structured Major/Minor without a location — the location is what
    # makes the review actionable for the authors.
    def _no_location(entries: List[Dict[str, str]]) -> int:
        return sum(
            1 for e in entries
            if not (e.get("page") or e.get("section") or e.get("line"))
        )
    unlocated_majors = _no_location(majors_struct)
    if unlocated_majors:
        hints.append(AssistantHint(
            severity="info",
            code="major_no_location",
            message=f"{unlocated_majors} major comment(s) are missing a page / section / line reference. Anchoring them helps the authors respond.",
        ))

    # 1. Missing rubric answers
    missing = [q for q in RUBRIC if q.mandatory and not answers.get(q.key)]
    if missing:
        preview = ", ".join(q.prompt for q in missing[:3])
        more = f" (+{len(missing) - 3} more)" if len(missing) > 3 else ""
        hints.append(AssistantHint(
            severity="warning",
            code="rubric_missing",
            message=f"{len(missing)} rubric question(s) not yet answered: {preview}{more}.",
        ))

    # 2. Structural comment sections
    if not majors and not minors and _word_count(comments_authors) == 0:
        hints.append(AssistantHint(
            severity="warning",
            code="no_comments",
            message="No comments recorded yet. Add at least a Major, Minor, or Comments-to-authors entry before submitting.",
        ))
    elif not majors and recommendation in {"major_revision", "reject"}:
        hints.append(AssistantHint(
            severity="warning",
            code="no_major_for_verdict",
            message=f"A '{recommendation.replace('_', ' ')}' verdict usually rests on at least one major comment. Consider itemising the blockers.",
        ))

    # 3. Recommendation ↔ verdict alignment
    if recommendation == "reject":
        # A reject should be justified in the comments.
        total_wc = _word_count(comments_authors) + sum(_word_count(x) for x in majors + minors)
        if total_wc < 80 and _word_count(comments_editor) < 40:
            hints.append(AssistantHint(
                severity="warning",
                code="reject_no_justification",
                message="A Reject recommendation without a substantive rationale is hard for the editor to defend. Please expand your comments.",
            ))
    if recommendation == "accept":
        neg = sum(1 for v in answers.values() if v in {"poor", "no"})
        pos = sum(1 for v in answers.values() if v in {"excellent", "good", "yes"})
        if neg >= 2 and neg > pos:
            hints.append(AssistantHint(
                severity="warning",
                code="accept_vs_rubric",
                message="Several rubric answers are Poor / No, but the recommendation is Accept. Consider whether Minor or Major Revision is a better fit.",
            ))
        if majors:
            hints.append(AssistantHint(
                severity="warning",
                code="accept_with_majors",
                message="Accept usually implies no outstanding major concerns. Reconsider whether Minor Revision better matches your major comments.",
            ))

    # 4. Confidence sanity
    if recommendation and not confidence:
        hints.append(AssistantHint(
            severity="info",
            code="confidence_missing",
            message="Set your overall confidence — it helps the editor weight competing reviewer opinions.",
        ))

    # 5. Ethics flag
    if ethics_flag and not ethics_note:
        hints.append(AssistantHint(
            severity="warning",
            code="ethics_flag_no_note",
            message="Ethics concern is flagged but the confidential note is empty. Please describe the concern for the editor.",
        ))

    # 6. Constructive tone / suggestions
    if comments_authors and re.search(r"\b[A-Z]{6,}\b", comments_authors):
        hints.append(AssistantHint(
            severity="info",
            code="tone",
            message="ALL-CAPS words can read as shouting. Consider softening the phrasing.",
        ))
    if recommendation and not suggestions_list and not suggestions_legacy and not minors:
        hints.append(AssistantHint(
            severity="info",
            code="no_suggestions",
            message="No suggestions to authors yet. Even one constructive suggestion helps the authors act on the review.",
        ))

    hints.sort(key=lambda h: 0 if h.severity == "warning" else 1)
    return hints


# ── Agent 4: Review Quality Check ───────────────────────

@dataclass
class QualityReport:
    ok: bool
    blockers: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def run_review_quality_check(payload: Dict[str, Any]) -> QualityReport:
    """Gate the Submit action ("Review Validation Agent" in spec §20).

    Blockers refuse the submit; warnings show inline but the reviewer
    may proceed. The check is intentionally strict on structure — the
    editor should never receive a review missing the fields their
    decision workflow depends on.
    """
    blockers: List[str] = []
    warnings: List[str] = []

    answers = _normalize_answers(payload)
    for q in RUBRIC:
        if q.mandatory and not answers.get(q.key):
            blockers.append(f"Answer required: “{q.prompt}”.")

    recommendation = _text_field(payload, "recommendation").lower()
    if not recommendation:
        blockers.append("Overall recommendation is required.")
    if not _text_field(payload, "confidence"):
        warnings.append("Overall confidence is not set.")

    comments_authors = _text_field(payload, "comments_to_authors")
    overall = _text_field(payload, "overall_assessment")
    majors = _comment_texts(_structured_comments(payload, "major_comments"))
    minors = _comment_texts(_structured_comments(payload, "minor_comments"))
    total_evidence = (
        _word_count(comments_authors)
        + _word_count(overall)
        + sum(_word_count(x) for x in majors + minors)
    )
    if total_evidence == 0:
        blockers.append("At least one comment is required — add a major, minor, or comments-to-authors entry.")
    elif total_evidence < 30:
        warnings.append("Comments are quite short — consider expanding.")

    if recommendation in {"major_revision", "reject"} and not majors:
        blockers.append(
            "A Major Revision or Reject verdict must be backed by at least one major comment."
        )
    if recommendation == "reject":
        if total_evidence < 80:
            blockers.append("A Reject recommendation must include a substantive rationale.")

    if bool(payload.get("ethics_flag")) and not _text_field(payload, "ethics_note"):
        blockers.append("Ethics concern is flagged — please add a confidential note describing it.")

    coi = payload.get("coi_declared")
    if not coi:
        blockers.append("You must declare your conflict-of-interest status before submitting.")

    return QualityReport(ok=not blockers, blockers=blockers, warnings=warnings)


# ── Agent 6: Editor Summary Agent ───────────────────────

def _split_paragraphs(text: str) -> List[str]:
    if not text:
        return []
    return [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]


def _first_sentence(text: str, cap: int = 220) -> str:
    if not text:
        return ""
    m = re.match(r"[^.!?]{20,}?[.!?](\s|$)", text)
    snippet = (m.group(0) if m else text).strip()
    if len(snippet) > cap:
        snippet = snippet[: cap - 1].rstrip() + "…"
    return snippet


_STRENGTH_MARKERS = (
    "strength", "well written", "well-written", "novel", "clearly",
    "convincing", "sound", "appropriate", "robust", "compelling",
)
_WEAKNESS_MARKERS = (
    "weakness", "however", "unclear", "insufficient", "lacks",
    "missing", "limited", "concern", "issue", "flaw",
)
_MAJOR_MARKERS = (
    "major", "significant", "critical", "fundamental", "reject",
    "invalid", "unsound", "must", "cannot",
)
_MINOR_MARKERS = (
    "minor", "typo", "grammar", "wording", "citation", "figure caption",
    "reference", "small",
)


def _bucket_lines(paragraphs: List[str]) -> Dict[str, List[str]]:
    buckets: Dict[str, List[str]] = {
        "strengths": [], "weaknesses": [],
        "major_concerns": [], "minor_concerns": [],
    }
    for para in paragraphs:
        lower = para.lower()
        placed = False
        if any(m in lower for m in _MAJOR_MARKERS):
            buckets["major_concerns"].append(_first_sentence(para))
            placed = True
        if not placed and any(m in lower for m in _MINOR_MARKERS):
            buckets["minor_concerns"].append(_first_sentence(para))
            placed = True
        if not placed and any(m in lower for m in _STRENGTH_MARKERS):
            buckets["strengths"].append(_first_sentence(para))
            placed = True
        if not placed and any(m in lower for m in _WEAKNESS_MARKERS):
            buckets["weaknesses"].append(_first_sentence(para))
    for k in buckets:
        buckets[k] = buckets[k][:5]  # cap per bucket for the editor's card
    return buckets


def run_editor_summary_agent(
    *,
    overall_assessment: str = "",
    comments_to_authors: str,
    comments_to_editor: str,
    rubric_answers: Dict[str, str],
    recommendation: str,
    confidence: str,
    major_comments: Optional[List[Any]] = None,   # str or {page, section, line, comment}
    minor_comments: Optional[List[Any]] = None,   # str or {page, section, line, comment}
    suggestions: Optional[List[str]] = None,
    suggestions_to_authors: str = "",             # legacy free-text
    ethics_flag: bool = False,
    ethics_note: str = "",
    page_annotations: Optional[List[Dict[str, Any]]] = None,
    round_number: int = 1,
    willing_to_review_revision: Optional[bool] = None,
) -> Tuple[str, Dict[str, Any]]:
    """Compress a completed review into the editor-facing card.

    Prefers structured input (the caller's ``major_comments`` /
    ``minor_comments`` lists) over paragraph-mining the free-text
    comments. Falls back to the paragraph heuristic when the reviewer
    hasn't used the itemised sections. Returns ``(plain_text_summary,
    structured_json)`` — the text is what shows on the editor's
    paper-detail page, the JSON is stored alongside so the editor UI
    can render structured buckets if it wants to.

    Per spec §20: the summary NEVER alters the reviewer's original
    prose. Structured buckets are stored verbatim; free-text mining
    only extracts a first-sentence pointer so the editor knows where
    to look in the reviewer's own comments.
    """
    # Normalise structured comment lists — the caller may hand us
    # either strings (legacy) or {page, section, line, comment} dicts.
    def _norm(items: Optional[List[Any]]) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for row in (items or []):
            if isinstance(row, dict):
                comment = str(row.get("comment") or "").strip()
                if comment:
                    out.append({
                        "page": str(row.get("page") or "").strip(),
                        "section": str(row.get("section") or "").strip(),
                        "line": str(row.get("line") or "").strip(),
                        "comment": comment,
                    })
            elif isinstance(row, str) and row.strip():
                out.append({"page": "", "section": "", "line": "", "comment": row.strip()})
        return out

    majors_struct = _norm(major_comments)
    minors_struct = _norm(minor_comments)
    majors = [format_comment(m) for m in majors_struct]
    minors = [format_comment(m) for m in minors_struct]

    strengths: List[str] = []
    weaknesses: List[str] = []
    if not majors and not minors:
        # Fallback — bucket the free-text paragraphs when the reviewer
        # didn't itemise. The reviewer's own prose is preserved via
        # ``_first_sentence`` (no rewriting), only the categorisation
        # is synthetic.
        paragraphs = _split_paragraphs(comments_to_authors) + _split_paragraphs(comments_to_editor)
        buckets = _bucket_lines(paragraphs)
        majors = buckets["major_concerns"]
        minors = buckets["minor_concerns"]
        strengths = buckets["strengths"]
        weaknesses = buckets["weaknesses"]
    else:
        # When the reviewer used the itemised sections, mine only the
        # free-text for strengths so the editor's card still surfaces
        # them.
        paragraphs = _split_paragraphs(comments_to_authors)
        strengths = _bucket_lines(paragraphs)["strengths"]
        weaknesses = _bucket_lines(paragraphs)["weaknesses"]

    label = dict(RECOMMENDATION_OPTIONS).get(recommendation, recommendation or "unspecified")
    confidence_label = dict(CONFIDENCE_OPTIONS).get(confidence, confidence or "unspecified")

    rubric_summary = ", ".join(
        f"{RUBRIC_BY_KEY[k].prompt}: {v.title()}"
        for k, v in rubric_answers.items()
        if k in RUBRIC_BY_KEY and v
    )

    def _lines(header: str, items: List[str]) -> str:
        if not items:
            return ""
        body = "\n".join(f"  • {i}" for i in items)
        return f"{header}\n{body}\n"

    suggestions_lines: List[str] = []
    if suggestions:
        suggestions_lines.extend(str(s).strip() for s in suggestions if str(s).strip())
    elif suggestions_to_authors and suggestions_to_authors.strip():
        # Legacy free-text — split on newlines/bullets so the summary
        # still renders as a bullet list.
        suggestions_lines.extend(
            s.strip(" •-\t") for s in re.split(r"[\n;]+", suggestions_to_authors)
            if s.strip()
        )

    header = f"Recommendation: {label} (confidence: {confidence_label})"
    if round_number and round_number > 1:
        header += f"  ·  Round {round_number}"
    if willing_to_review_revision is True:
        header += "  ·  Willing to review revised version"
    elif willing_to_review_revision is False:
        header += "  ·  Declined to review revised version"

    text = (
        header + "\n"
        + (f"\n⚠ Ethics concern flagged: {ethics_note or '(reviewer marked but no note)'}\n\n" if ethics_flag else "\n")
        + (f"Overall assessment:\n  {overall_assessment.strip()}\n\n" if overall_assessment and overall_assessment.strip() else "")
        + _lines("Strengths",        strengths)
        + _lines("Weaknesses",       weaknesses)
        + _lines("Major concerns",   majors)
        + _lines("Minor concerns",   minors)
        + _lines("Suggestions",      suggestions_lines)
    ).strip()
    if rubric_summary:
        text += f"\n\nRubric: {rubric_summary}"
    if page_annotations:
        text += f"\n\nPage-anchored comments: {len(page_annotations)} (see the review page for details)"

    payload = {
        "recommendation": recommendation,
        "confidence": confidence,
        "round_number": round_number,
        "willing_to_review_revision": willing_to_review_revision,
        "overall_assessment": overall_assessment or "",
        "strengths": strengths,
        "weaknesses": weaknesses,
        # Include both the formatted display strings and the raw
        # structured records so the editor UI can render either.
        "major_concerns": majors,
        "minor_concerns": minors,
        "major_comments_struct": majors_struct,
        "minor_comments_struct": minors_struct,
        "suggestions": suggestions_lines,
        "ethics_flag": ethics_flag,
        "ethics_note": ethics_note or "",
        "rubric": rubric_answers,
        "annotations_count": len(page_annotations or []),
    }
    return text, payload


# ── Agent: Reviewer Consensus (spec §15) ────────────────
#
# Consolidates every reviewer's structured report on one submission
# into a decision-support card the editor can lean on. Deterministic
# aggregation over already-persisted reports — no LLM cost. Never
# rewrites reviewer prose; the "common concerns" and "positive
# aspects" buckets carry the reviewer's own first-sentence excerpts
# with a citation back to the source review_id.

_RECOMMENDATION_STRENGTH = {
    "reject": 0,
    "major_revision": 1,
    "minor_revision": 2,
    "accept": 3,
}


def _cluster_concerns(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group similar comment strings across reviewers by a lightweight
    normalisation of the first sentence. Two reviewers pointing at
    the same weakness usually phrase it slightly differently — this
    is enough to detect the overlap for a summary without an LLM.
    Each cluster carries the raw excerpts (verbatim) + the reviewer
    display names."""
    clusters: List[Dict[str, Any]] = []
    for item in items:
        text = _first_sentence(item.get("text", ""), cap=160)
        if not text:
            continue
        # Normalisation for clustering — lowercased, stripped of punctuation
        # and common stopwords. Only used for grouping; the display text is
        # the reviewer's own first sentence.
        norm = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        norm = re.sub(r"\s+", " ", norm).strip()
        keywords = tuple(sorted({
            w for w in norm.split()
            if len(w) > 4 and w not in {
                "should", "would", "could", "there", "these", "those",
                "which", "while", "about", "authors", "manuscript",
            }
        })[:6])
        placed = False
        for c in clusters:
            overlap = len(set(keywords) & set(c["_keywords"]))
            if overlap >= 3:
                c["excerpts"].append(item)
                c["_keywords"] = tuple(sorted(set(c["_keywords"]) | set(keywords)))[:12]
                placed = True
                break
        if not placed:
            clusters.append({
                "_keywords": keywords,
                "excerpts": [item],
                "seed": text,
            })
    for c in clusters:
        c["reviewer_count"] = len({e["reviewer"] for e in c["excerpts"]})
        del c["_keywords"]
    # Rank by number of distinct reviewers, then by total mentions.
    clusters.sort(key=lambda c: (-c["reviewer_count"], -len(c["excerpts"])))
    return clusters


def run_reviewer_consensus_agent(reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Cross-reviewer summary. ``reports`` is a list of
    :class:`ReviewerReport` dicts (as returned by
    ``reviewer_portal._report_from_review(...).model_dump()``).

    Returns::

      {
        "recommendation_tally": { "accept": N, "minor_revision": N, ... },
        "consensus_recommendation": "major_revision" | None,
        "consensus_strength": "unanimous" | "majority" | "split",
        "common_concerns":   [ { seed, excerpts:[{reviewer,text,review_id,kind}] }, ... ],
        "positive_aspects":  [ { seed, excerpts:[...] }, ... ],
        "conflicting_signals": [str, ...],
        "text_summary": "…",
      }

    Never rewrites the reviewer's prose — each excerpt is a
    :func:`_first_sentence` snippet of the reviewer's own text with a
    ``review_id`` for the editor to click through and read the full
    comment.
    """
    tally: Dict[str, int] = {v: 0 for v, _ in RECOMMENDATION_OPTIONS}
    ethics_flags = 0
    major_pool: List[Dict[str, Any]] = []
    minor_pool: List[Dict[str, Any]] = []
    positive_pool: List[Dict[str, Any]] = []
    per_reviewer_recs: List[Tuple[str, str]] = []  # (reviewer_display_name, rec)

    for r in reports:
        rec = str(r.get("recommendation") or "").lower()
        if rec in tally:
            tally[rec] += 1
        name = r.get("reviewer_display_name", "Anonymous Reviewer")
        review_id = r.get("review_id", "")
        per_reviewer_recs.append((name, rec))
        if r.get("ethics_flag"):
            ethics_flags += 1
        for m in r.get("major_comments", []) or []:
            text = m.get("comment") if isinstance(m, dict) else str(m)
            if text:
                major_pool.append({
                    "reviewer": name, "review_id": review_id,
                    "text": text, "kind": "major",
                })
        for m in r.get("minor_comments", []) or []:
            text = m.get("comment") if isinstance(m, dict) else str(m)
            if text:
                minor_pool.append({
                    "reviewer": name, "review_id": review_id,
                    "text": text, "kind": "minor",
                })
        # Positive signals — mine the overall_assessment + comments_to_authors
        # for strength markers using the same heuristic the Editor Summary
        # Agent uses. Cheap and stable.
        for source in (r.get("overall_assessment", ""), r.get("comments_to_authors", "")):
            for para in _split_paragraphs(source or ""):
                lower = para.lower()
                if any(m in lower for m in _STRENGTH_MARKERS):
                    positive_pool.append({
                        "reviewer": name, "review_id": review_id,
                        "text": _first_sentence(para),
                        "kind": "strength",
                    })

    # Consensus recommendation: most common. Break ties by "stricter
    # recommendation wins" (reject > major > minor > accept) so a 1-1
    # tie surfaces the more cautious editorial position.
    consensus_recommendation: Optional[str] = None
    consensus_strength = "n/a"
    if reports:
        max_count = max(tally.values())
        if max_count == 0:
            consensus_recommendation = None
        else:
            candidates = [k for k, v in tally.items() if v == max_count]
            # tie-break: prefer the more cautious (lower strength) recommendation
            candidates.sort(key=lambda k: _RECOMMENDATION_STRENGTH.get(k, 99))
            consensus_recommendation = candidates[0]
            if max_count == len(reports):
                consensus_strength = "unanimous"
            elif max_count > len(reports) / 2:
                consensus_strength = "majority"
            else:
                consensus_strength = "split"

    common_concerns = _cluster_concerns(major_pool)
    minor_concerns_clusters = _cluster_concerns(minor_pool)
    positive_aspects = _cluster_concerns(positive_pool)

    # Conflicting signals — surface disagreements the editor should
    # notice explicitly.
    conflicts: List[str] = []
    if consensus_recommendation and consensus_strength == "split":
        parts = [f"{v} {k.replace('_', ' ')}" for k, v in tally.items() if v]
        conflicts.append(
            "No majority recommendation — " + ", ".join(parts) + "."
        )
    if len(reports) >= 2:
        strong = tally.get("accept", 0)
        harsh = tally.get("reject", 0) + tally.get("major_revision", 0)
        if strong and harsh:
            conflicts.append(
                f"{strong} reviewer(s) recommend Accept while {harsh} recommend "
                "Reject or Major Revision — significant divergence."
            )
    if ethics_flags:
        conflicts.append(
            f"Ethics concern flagged by {ethics_flags} reviewer(s) — read the "
            "confidential ethics notes before deciding."
        )

    def _lines_out(header: str, items: List[Dict[str, Any]], cap: int = 5) -> str:
        if not items:
            return ""
        body_lines = []
        for c in items[:cap]:
            reviewers = ", ".join(sorted({e["reviewer"] for e in c["excerpts"]}))
            body_lines.append(f"  • {c['seed']}  [{reviewers}]")
        return f"{header}\n" + "\n".join(body_lines) + "\n"

    per_reviewer_out = "\n".join(
        f"  {name}: {rec.replace('_', ' ').title() if rec else 'unspecified'}"
        for name, rec in per_reviewer_recs
    )

    text_summary = (
        f"Reviewer consensus: "
        f"{(consensus_recommendation or 'no majority').replace('_', ' ').title()}"
        f" ({consensus_strength})\n\n"
        f"Reviewer recommendations:\n{per_reviewer_out}\n\n"
        + _lines_out("Common concerns", common_concerns)
        + _lines_out("Minor concerns", minor_concerns_clusters, cap=3)
        + _lines_out("Positive aspects", positive_aspects)
    ).strip()
    if conflicts:
        text_summary += "\n\nConflicting signals:\n" + "\n".join(f"  • {c}" for c in conflicts)

    return {
        "recommendation_tally": tally,
        "consensus_recommendation": consensus_recommendation,
        "consensus_strength": consensus_strength,
        "per_reviewer": [
            {"reviewer_display_name": name, "recommendation": rec}
            for name, rec in per_reviewer_recs
        ],
        "common_concerns": common_concerns,
        "minor_concerns": minor_concerns_clusters,
        "positive_aspects": positive_aspects,
        "conflicting_signals": conflicts,
        "ethics_flag_count": ethics_flags,
        "text_summary": text_summary,
    }
