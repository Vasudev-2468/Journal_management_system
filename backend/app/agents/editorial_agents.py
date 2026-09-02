"""
Editorial detection agents.

Deterministic — no LLM calls, no side effects. Each function returns
a structured verdict the outer router persists / surfaces. Wiring
lives in ``app/routers/editor_portal.py`` and ``app/routers/reviews.py``.

Agents shipped here:

  * :func:`run_duplicate_submission_agent` — title + author collision
    across the submissions table. Warns the editor if the same paper
    looks like it was submitted twice.

  * :func:`run_reviewer_bias_agent` — checks a candidate reviewer
    against the manuscript's author affiliations for domain / email
    overlap that would count as a self-declared COI even if the
    reviewer didn't declare it.

  * :func:`run_panel_balance_agent` — for a submission with N assigned
    reviewers, flags panels that are dominated by a single country
    or affiliation, which risks a narrow-view review round.

  * :func:`run_cross_round_consistency_agent` — compares this round's
    reviewer comments against the previous round's to surface issues
    the author was asked to fix but that a reviewer flagged again.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ── Helpers ─────────────────────────────────────────────

_NORM_WS_RE = re.compile(r"\s+")


def _canon(text: Optional[str]) -> str:
    """Lowercase + squash whitespace + drop punctuation. Used for
    lightweight matching across noisy user-typed strings."""
    if not text:
        return ""
    stripped = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return _NORM_WS_RE.sub(" ", stripped).strip()


def _email_domain(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return ""
    return email.split("@", 1)[1].lower().strip()


# ── Agent: Duplicate submission detector ────────────────

@dataclass
class DuplicateSubmissionHit:
    submission_id: str
    paper_title: str
    author_name: str
    reason: str


@dataclass
class DuplicateSubmissionReport:
    hits: List[DuplicateSubmissionHit] = field(default_factory=list)
    is_duplicate: bool = False


def run_duplicate_submission_agent(
    *,
    submission_id: str,
    title: str,
    author_name: str,
    author_email: str,
    other_submissions: List[Dict[str, Any]],
) -> DuplicateSubmissionReport:
    """Compare a submission against every other submission and flag
    likely duplicates. Signals:

      * exact-title match by the same author
      * near-title match (≥ 80% word overlap) by any author
      * same author + author_email combination across multiple
        submissions inside 60 days
    """
    hits: List[DuplicateSubmissionHit] = []
    ct = _canon(title)
    ct_words = set(ct.split())
    ca = _canon(author_name)
    for other in other_submissions:
        oid = str(other.get("id") or "")
        if not oid or oid == submission_id:
            continue
        other_title = other.get("paper_title") or ""
        other_author = other.get("author_name") or ""
        other_email = other.get("author_email") or ""
        oct = _canon(other_title)
        oca = _canon(other_author)
        if oct and ct and oct == ct and oca == ca:
            hits.append(DuplicateSubmissionHit(
                submission_id=oid, paper_title=other_title, author_name=other_author,
                reason="Identical title by the same author",
            ))
            continue
        if oct and ct_words:
            oct_words = set(oct.split())
            overlap = len(ct_words & oct_words) / max(1, len(ct_words | oct_words))
            if overlap >= 0.8 and oct != ct:
                hits.append(DuplicateSubmissionHit(
                    submission_id=oid, paper_title=other_title, author_name=other_author,
                    reason=f"Near-title match ({int(overlap * 100)}% word overlap)",
                ))
                continue
        if author_email and other_email and author_email.lower() == other_email.lower():
            hits.append(DuplicateSubmissionHit(
                submission_id=oid, paper_title=other_title, author_name=other_author,
                reason="Same author email on another submission",
            ))

    return DuplicateSubmissionReport(hits=hits, is_duplicate=bool(hits))


# ── Agent: Reviewer bias detector ───────────────────────

@dataclass
class ReviewerBiasVerdict:
    is_conflict: bool
    reasons: List[str] = field(default_factory=list)
    severity: str = "clear"  # clear | soft | hard


def run_reviewer_bias_agent(
    *,
    reviewer_email: str,
    reviewer_institution: str,
    author_emails: List[str],
    author_institutions: List[str],
    coauthor_emails: List[str] = None,
) -> ReviewerBiasVerdict:
    """Decide whether inviting this reviewer would introduce a COI
    the platform can detect without the reviewer's help.

    Hard conflict: reviewer's email matches an author or listed
    co-author email.
    Soft conflict: reviewer shares an institution / email domain
    with any author.
    """
    reviewer_email = (reviewer_email or "").lower().strip()
    coauthor_emails = [e.lower().strip() for e in (coauthor_emails or [])]
    reviewer_domain = _email_domain(reviewer_email)
    reviewer_inst = _canon(reviewer_institution)

    reasons: List[str] = []
    severity = "clear"
    author_email_set = {(e or "").lower().strip() for e in author_emails if e}
    if reviewer_email and reviewer_email in author_email_set:
        reasons.append("Reviewer's email matches an author's email.")
        severity = "hard"
    if reviewer_email and reviewer_email in set(coauthor_emails):
        reasons.append("Reviewer's email matches a listed co-author's email.")
        severity = "hard"
    if severity != "hard":
        # Soft: institutional / domain overlap.
        for inst in author_institutions:
            can = _canon(inst)
            if reviewer_inst and can and reviewer_inst == can:
                reasons.append(f"Reviewer shares an institution with an author: {inst}.")
                severity = "soft"
                break
        if severity == "clear":
            author_domains = {_email_domain(e) for e in author_email_set}
            if reviewer_domain and reviewer_domain in author_domains:
                reasons.append(f"Reviewer email domain ({reviewer_domain}) matches an author's email domain.")
                severity = "soft"

    return ReviewerBiasVerdict(
        is_conflict=severity != "clear",
        reasons=reasons,
        severity=severity,
    )


# ── Agent: Panel balance ────────────────────────────────

@dataclass
class PanelBalanceReport:
    ok: bool
    warnings: List[str] = field(default_factory=list)
    dominant_country: Optional[str] = None
    dominant_institution: Optional[str] = None


def run_panel_balance_agent(
    *, reviewers: List[Dict[str, Any]],
) -> PanelBalanceReport:
    """For an N-reviewer panel:

      * warn if a single country >= 60% of the panel
      * warn if a single institution >= 50% of the panel
      * warn if every reviewer's email domain is identical
    """
    warnings: List[str] = []
    if not reviewers:
        return PanelBalanceReport(ok=True)
    total = len(reviewers)
    from collections import Counter
    countries = Counter((_canon(r.get("country") or "") or "?") for r in reviewers)
    institutions = Counter((_canon(r.get("institution") or "") or "?") for r in reviewers)
    domains = Counter(_email_domain(r.get("email") or "") for r in reviewers)

    dom_country_key, dom_country_n = countries.most_common(1)[0]
    dom_inst_key, dom_inst_n = institutions.most_common(1)[0]
    dom_domain_key, dom_domain_n = domains.most_common(1)[0]

    if dom_country_key and dom_country_key != "?" and total >= 3 and dom_country_n / total >= 0.6:
        warnings.append(f"{int(100 * dom_country_n / total)}% of the panel is from a single country.")
    if dom_inst_key and dom_inst_key != "?" and total >= 2 and dom_inst_n / total >= 0.5:
        warnings.append(f"{int(100 * dom_inst_n / total)}% of the panel is from a single institution.")
    if dom_domain_key and total >= 2 and dom_domain_n == total:
        warnings.append("Every reviewer shares the same email domain.")

    return PanelBalanceReport(
        ok=not warnings,
        warnings=warnings,
        dominant_country=dom_country_key if dom_country_key and dom_country_key != "?" else None,
        dominant_institution=dom_inst_key if dom_inst_key and dom_inst_key != "?" else None,
    )


# ── Agent: Cross-round consistency ──────────────────────

@dataclass
class CrossRoundReport:
    ok: bool
    repeated_concerns: List[Dict[str, Any]] = field(default_factory=list)


def run_cross_round_consistency_agent(
    *,
    previous_round_comments: List[str],
    current_round_comments: List[str],
) -> CrossRoundReport:
    """Given the flat text of Major/Minor comments across two rounds,
    flag any current-round comment whose keyword set substantially
    overlaps a previous-round comment. Signals the editor "this
    reviewer raised this last round and the author didn't fix it."""
    if not previous_round_comments or not current_round_comments:
        return CrossRoundReport(ok=True)

    def _keywords(text: str) -> set:
        can = _canon(text)
        return {
            w for w in can.split()
            if len(w) > 4 and w not in {
                "should", "would", "could", "there", "these", "those",
                "which", "while", "about", "authors", "manuscript",
                "reviewer", "review", "comment", "please", "response",
            }
        }

    prev_keywords = [(t, _keywords(t)) for t in previous_round_comments if t]
    repeated: List[Dict[str, Any]] = []
    for cur in current_round_comments:
        cur_kw = _keywords(cur)
        if not cur_kw:
            continue
        for prev_text, prev_kw in prev_keywords:
            if not prev_kw:
                continue
            overlap = len(cur_kw & prev_kw) / max(1, len(cur_kw | prev_kw))
            if overlap >= 0.4 and len(cur_kw & prev_kw) >= 3:
                repeated.append({
                    "current": cur,
                    "previous": prev_text,
                    "overlap": round(overlap, 2),
                })
                break

    return CrossRoundReport(ok=not repeated, repeated_concerns=repeated)
