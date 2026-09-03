"""Revision Analysis Agent — deterministic per-comment scoring.

Given a submission's current revision round, compares every reviewer
comment against the author's stored ``RevisionResponse`` row and
classifies the pair as ``addressed`` / ``partial`` / ``unresolved``.
No LLM, no network — purely heuristic Python so the same inputs always
produce the same output (auditable).

Heuristics per comment
    unresolved: no response row, or response_text is empty / whitespace.
    partial:    response_text is short (< 40 chars) OR change_location
                is missing OR the response mentions "will" / "future"
                without evidence of a concrete edit.
    addressed:  response_text >= 40 chars AND change_location present.

The classification is deliberately blunt — the agent is a triage aid,
not an oracle. The editor still owns the final call on every comment
and on the manuscript as a whole (Handling Editor / EIC responsibility
model in the spec).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.review import Review, ReviewState
from ..models.revision_response import RevisionResponse
from ..models.submission import Submission


Verdict = str  # 'addressed' | 'partial' | 'unresolved'


@dataclass
class CommentAssessment:
    review_id: str
    reviewer_display_name: str
    comment_kind: str          # 'major' | 'minor'
    comment_index: int
    comment_text: str
    response_text: str
    change_location: str
    ai_verdict: Verdict
    verdict_reason: str


@dataclass
class ReviewerRollup:
    review_id: str
    reviewer_display_name: str
    addressed: int = 0
    partial: int = 0
    unresolved: int = 0
    total: int = 0
    comments: List[CommentAssessment] = field(default_factory=list)


@dataclass
class RevisionAnalysis:
    round_number: int
    totals: Dict[str, int]                 # {'addressed': N, 'partial': N, 'unresolved': N}
    per_reviewer: List[ReviewerRollup]
    flags: List[str]                       # narrative bullet flags for the editor

    def to_dict(self) -> Dict[str, Any]:
        return {
            "round_number": self.round_number,
            "totals": self.totals,
            "per_reviewer": [
                {
                    "review_id": r.review_id,
                    "reviewer_display_name": r.reviewer_display_name,
                    "addressed": r.addressed,
                    "partial": r.partial,
                    "unresolved": r.unresolved,
                    "total": r.total,
                    "comments": [c.__dict__ for c in r.comments],
                }
                for r in self.per_reviewer
            ],
            "flags": self.flags,
        }


# ── Verdict heuristics ──────────────────────────────────

_WEASEL_RE = re.compile(r"\b(will|future|later|to be done|to be added|planned)\b", re.IGNORECASE)
_MIN_ADDRESSED_LEN = 40


def _classify(comment_text: str, response_text: str, change_location: str) -> tuple[Verdict, str]:
    resp = (response_text or "").strip()
    loc = (change_location or "").strip()

    if not resp:
        return "unresolved", "No response was recorded for this comment."

    # Very short responses are triaged as partial regardless of location.
    if len(resp) < _MIN_ADDRESSED_LEN:
        return "partial", f"Response is short ({len(resp)} characters) — may not fully address the concern."

    weasel_hit = _WEASEL_RE.search(resp)
    if weasel_hit and not loc:
        return "partial", (
            f"Response mentions '{weasel_hit.group(0)}' but no specific manuscript "
            "change location was cited — reads as intent rather than a completed edit."
        )

    if not loc:
        return "partial", "Response is present but no manuscript change location was cited."

    return "addressed", "Response is substantive and cites a specific change location."


# ── Comment loader ──────────────────────────────────────

def _load_list(raw: Optional[str]) -> List[dict]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:  # noqa: BLE001
        return []


def _extract_comment_text(item: Any) -> str:
    """Reviewer JSON entries are either strings or ``{page, section, comment}``
    dicts. Return the visible comment string in either case."""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("comment") or item.get("text") or "")
    return ""


# ── Entry point ─────────────────────────────────────────

def analyze_revision(db: Session, submission_id) -> RevisionAnalysis:
    """Run the per-comment classification for the submission's current round."""
    submission: Optional[Submission] = db.query(Submission).filter(
        Submission.id == submission_id,
    ).first()
    if submission is None:
        return RevisionAnalysis(round_number=0, totals={"addressed": 0, "partial": 0, "unresolved": 0}, per_reviewer=[], flags=[])

    reviews = sorted(
        [r for r in (submission.reviews or []) if r.state == ReviewState.submitted],
        key=lambda r: r.assigned_at or 0,
    )
    if not reviews:
        return RevisionAnalysis(round_number=0, totals={"addressed": 0, "partial": 0, "unresolved": 0}, per_reviewer=[], flags=["No submitted reviews on record — nothing to compare against."])

    target_round = max((r.round_number or 1 for r in reviews), default=1)
    current_reviews = [r for r in reviews if (r.round_number or 1) == target_round]

    # All responses for this submission, keyed by (review_id, kind, idx).
    responses = (
        db.query(RevisionResponse)
        .filter(RevisionResponse.submission_id == submission.id)
        .all()
    )
    resp_map: Dict[tuple, RevisionResponse] = {
        (str(r.review_id), r.comment_kind, r.comment_index): r for r in responses
    }

    per_reviewer: List[ReviewerRollup] = []
    total_addr = total_partial = total_unres = 0

    for idx, r in enumerate(current_reviews, start=1):
        display = f"Reviewer #{idx}"
        rollup = ReviewerRollup(review_id=str(r.id), reviewer_display_name=display)

        for kind, raw in (("major", r.major_comments), ("minor", r.minor_comments)):
            for i, item in enumerate(_load_list(raw)):
                comment_text = _extract_comment_text(item)
                if not comment_text.strip():
                    continue
                key = (str(r.id), kind, i)
                resp_row = resp_map.get(key)
                resp_text = resp_row.response_text if resp_row else ""
                loc = resp_row.change_location if resp_row else ""
                verdict, reason = _classify(comment_text, resp_text, loc)
                rollup.comments.append(CommentAssessment(
                    review_id=str(r.id),
                    reviewer_display_name=display,
                    comment_kind=kind,
                    comment_index=i,
                    comment_text=comment_text,
                    response_text=resp_text,
                    change_location=loc,
                    ai_verdict=verdict,
                    verdict_reason=reason,
                ))
                if verdict == "addressed":
                    rollup.addressed += 1
                    total_addr += 1
                elif verdict == "partial":
                    rollup.partial += 1
                    total_partial += 1
                else:
                    rollup.unresolved += 1
                    total_unres += 1

        rollup.total = rollup.addressed + rollup.partial + rollup.unresolved
        per_reviewer.append(rollup)

    # Narrative flags for the editor.
    flags: List[str] = []
    total_all = total_addr + total_partial + total_unres
    if total_unres:
        flags.append(
            f"{total_unres} comment{'s' if total_unres != 1 else ''} appear unresolved — no response recorded.",
        )
    if total_partial:
        flags.append(
            f"{total_partial} comment{'s' if total_partial != 1 else ''} may be only partially addressed — short response or no change location.",
        )
    for rollup in per_reviewer:
        if rollup.total and (rollup.unresolved / rollup.total) >= 0.5:
            flags.append(
                f"{rollup.reviewer_display_name}: {rollup.unresolved}/{rollup.total} comments unresolved — consider requesting further revision or re-review.",
            )
    if total_all == 0:
        flags.append(
            "No structured reviewer comments found for the current round — the AI cannot compute an assessment.",
        )

    return RevisionAnalysis(
        round_number=target_round,
        totals={"addressed": total_addr, "partial": total_partial, "unresolved": total_unres},
        per_reviewer=per_reviewer,
        flags=flags,
    )
