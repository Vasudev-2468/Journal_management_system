"""Editorial Decision Agent (spec §12).

Given a manuscript's reviewer reports, produces an editorial briefing:

  * count of recommendations per bucket (accept / minor rev / major rev / reject)
  * common concerns across reviewers (major_comments, ethics flags)
  * common positive points (from ``overall_assessment`` prose)
  * a suggested decision — but this is ADVICE only. The human editor
    clicks the final decision button; nothing here writes state.

The suggested decision is deterministic — not the LLM's opinion —
so the briefing is reproducible and auditable:

  * if any reviewer recommended reject → suggest 'major_revision' or 'reject'
    depending on the split
  * unanimous accept → suggest 'accept'
  * mixed → suggest the modal recommendation, with a note

Downstream:
  * The editor sees this on the Manuscript Workspace page
  * The FINAL_DECISION permission gate on state_machine.transition() is
    what actually moves the manuscript into accepted/rejected
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models.review import Review, OverallRecommendation

logger = logging.getLogger(__name__)


# ── Rec bucketing ───────────────────────────────────────
#
# Reviewer's ``overall_recommendation`` enum values → the buckets we
# report to the editor. Kept small so the briefing card stays scannable.

_BUCKETS: dict[str, str] = {
    "accept": "accept",
    "minor_revision": "minor_revision",
    "minor_revisions": "minor_revision",
    "major_revision": "major_revision",
    "major_revisions": "major_revision",
    "reject": "reject",
}


@dataclass
class DecisionBriefing:
    submission_id: str
    reviews_received: int
    reviews_expected: int
    recommendations: dict         # {'accept': N, 'minor_revision': N, ...}
    consensus: str                # 'unanimous_accept' | 'split' | 'unanimous_reject' | 'no_reviews'
    suggested_decision: str       # one of accept / minor_revision / major_revision / reject
    suggestion_reason: str
    # Confidence in the suggestion. Deterministic — driven by
    # unanimity and completeness, not an LLM's opinion. Values:
    # 'high' (unanimous + all reviews in), 'medium' (majority),
    # 'low' (split or partial).
    confidence: str = "low"
    common_concerns: list = None  # list of {reviewer_email, concern}
    ethics_flags: int = 0
    coi_declared: int = 0

    def __post_init__(self):
        if self.common_concerns is None:
            self.common_concerns = []


# ── Extraction helpers ──────────────────────────────────

def _rec_value(rec: Optional[OverallRecommendation]) -> Optional[str]:
    if rec is None:
        return None
    raw = rec.value if hasattr(rec, "value") else str(rec)
    return _BUCKETS.get(raw.lower())


def _format_structured_comment(entry: dict) -> str:
    """Render one structured major-comment dict as a single readable
    line. Reviewers save each concern as
    ``{page, section, line, comment}`` — anchoring metadata plus the
    prose. The Editorial Decision Agent's ``common_concerns`` needs
    human text (it feeds the Review Room + rejection email + editor
    briefing UI), so we merge the anchor into a short prefix and
    keep the comment as the body.

    Empty/blank fields are dropped from the prefix so we don't get
    ``(Page 1, Section , Line )`` noise. When only the comment is
    populated it renders as the comment on its own.
    """
    comment = str(entry.get("comment") or entry.get("text") or "").strip()
    if not comment:
        return ""
    parts = []
    page = str(entry.get("page") or "").strip()
    section = str(entry.get("section") or "").strip()
    line = str(entry.get("line") or "").strip()
    if page:
        parts.append(f"Page {page}")
    if section and section != "0":
        parts.append(f"Section {section}")
    if line:
        parts.append(f"Line {line}")
    prefix = f"({', '.join(parts)}) " if parts else ""
    return f"{prefix}{comment}"


def _extract_major_comments(review: Review) -> list[str]:
    """Return each major comment as a human-readable string.

    Reviewers save the field as a JSON list of ``StructuredComment``
    dicts (``{page, section, line, comment}``), but older rows may
    hold a free-form string or a list of strings. All three shapes
    round-trip to a clean list of one-liners.
    """
    if not review.major_comments:
        return []
    try:
        parsed = json.loads(review.major_comments)
    except Exception:  # noqa: BLE001
        return [review.major_comments.strip()] if review.major_comments.strip() else []
    if isinstance(parsed, list):
        out: list[str] = []
        for x in parsed:
            if not x:
                continue
            if isinstance(x, dict):
                rendered = _format_structured_comment(x)
                if rendered:
                    out.append(rendered)
            elif isinstance(x, str):
                s = x.strip()
                if s:
                    out.append(s)
            else:
                s = str(x).strip()
                if s:
                    out.append(s)
        return out
    if isinstance(parsed, dict):
        rendered = _format_structured_comment(parsed)
        return [rendered] if rendered else []
    if isinstance(parsed, str):
        return [parsed] if parsed else []
    return []


# ── Public entry point ──────────────────────────────────

def build_briefing(
    db: Session,
    submission_id: str,
    reviews_expected: int = 3,
) -> DecisionBriefing:
    """Summarise all completed reviews on the submission.

    ``submission_id`` accepts either the UUID or the ``paper_id_code``.
    ``reviews_expected`` is the journal's target reviewer count — used
    only in the ``reviews_received/expected`` display.
    """
    from app.models.submission import Submission
    from uuid import UUID

    submission: Optional[Submission] = None
    try:
        as_uuid = UUID(str(submission_id))
        submission = db.query(Submission).filter(Submission.id == as_uuid).first()
    except (ValueError, TypeError):
        submission = (
            db.query(Submission)
            .filter(Submission.paper_id_code == submission_id)
            .first()
        )

    reviews: list[Review] = []
    if submission is not None:
        reviews = [
            r for r in db.query(Review).filter(Review.submission_id == submission.id).all()
            if r.overall_recommendation is not None
        ]

    counter: Counter = Counter()
    concerns: list[dict] = []
    ethics_flags = 0
    coi_declared = 0
    # Anonymised reviewer labels — matches the rest of the editor UI
    # (Review Room comparison table, rejection letter to the author,
    # etc.). Emails are never surfaced here because concerns get
    # rendered into author-facing artefacts.
    for idx, r in enumerate(reviews, start=1):
        bucket = _rec_value(r.overall_recommendation)
        if bucket:
            counter[bucket] += 1
        if r.ethics_flag:
            ethics_flags += 1
        if r.coi_declared_at is not None:
            coi_declared += 1
        reviewer_label = f"Reviewer {idx}"
        for concern in _extract_major_comments(r):
            concerns.append(
                {"reviewer": reviewer_label, "concern": concern[:400]}
            )

    consensus, suggested, reason = _pick_suggestion(counter, len(reviews))
    confidence = _pick_confidence(counter, len(reviews), reviews_expected)

    return DecisionBriefing(
        submission_id=str(submission.paper_id_code if submission is not None else submission_id),
        reviews_received=len(reviews),
        reviews_expected=reviews_expected,
        recommendations={k: counter.get(k, 0) for k in ("accept", "minor_revision", "major_revision", "reject")},
        consensus=consensus,
        suggested_decision=suggested,
        suggestion_reason=reason,
        confidence=confidence,
        common_concerns=concerns[:20],
        ethics_flags=ethics_flags,
        coi_declared=coi_declared,
    )


def _pick_confidence(counter: Counter, received: int, expected: int) -> str:
    """Deterministic confidence signal.

      * ``high``   — all expected reviews are in AND recommendations
                     agree on one bucket.
      * ``medium`` — majority (>50%) of received reviews back the
                     suggested bucket.
      * ``low``    — split reviewers, or the shortlist is incomplete.

    Explicit rather than LLM-derived so two viewings of the same
    submission return the same confidence; useful for audit.
    """
    if received == 0:
        return "low"
    if received >= expected and len(counter) == 1:
        return "high"
    largest = max(counter.values(), default=0)
    if largest > received / 2:
        return "medium"
    return "low"


def _pick_suggestion(counter: Counter, total: int) -> tuple[str, str, str]:
    """Deterministic bucket → suggested-decision logic. See spec §12 —
    the AI does not decide, the editor does; this is a starting point."""
    if total == 0:
        return (
            "no_reviews",
            "under_review",
            "No completed reviews yet — remain under review.",
        )
    if counter["reject"] >= max(1, total // 2 + 1):
        return (
            "majority_reject",
            "rejected",
            f"{counter['reject']} of {total} reviewers recommend rejection.",
        )
    if counter["accept"] == total:
        return (
            "unanimous_accept",
            "accepted",
            f"All {total} reviewers recommend acceptance.",
        )
    if counter["major_revision"] + counter["reject"] >= 1:
        return (
            "split",
            "major_revision",
            "At least one reviewer flags major concerns — a substantive revision cycle is advised.",
        )
    if counter["minor_revision"] >= 1:
        return (
            "split",
            "minor_revision",
            "Minor revisions requested by one or more reviewers.",
        )
    return (
        "split",
        "under_review",
        "Reviewer signal is mixed — human judgement required.",
    )
