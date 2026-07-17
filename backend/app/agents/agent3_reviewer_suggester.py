"""
Agent 3: Reviewer Suggester Bot

Two scenarios:
  A) Consult Party provides reviewer names → validate & pass to Agent 4
  B) No/insufficient reviewers → auto-suggest from:
     1. Internal database (expertise match)
     2. OpenAlex API (find authors of similar papers)
     3. References extraction (authors of cited papers)

Ranks suggestions by relevance and stores them for editor review.
Communicates with Agent 4 via orchestrator.
"""

import logging
import re
from typing import List, Optional

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models.reviewer import Reviewer
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.services.ai_agent import rerank_reviewer_candidates

logger = logging.getLogger(__name__)

MIN_REVIEWERS = 2


class ReviewerSuggesterAgent:
    """System Agent 3: Auto-Reviewer Suggester."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        submission: Submission,
        provided_reviewers: Optional[List[dict]] = None,
        agent2_result: dict = None,
    ) -> dict:
        """
        Suggest or validate reviewers.

        provided_reviewers: list of dicts from consult party
          [{name, email, orcid, affiliation, expertise}]
        """
        paper_id = submission.paper_id_code
        results = {
            "agent": "ReviewerSuggesterAgent",
            "paper_id_code": paper_id,
            "submission_id": str(submission.id),
        }

        validated = []
        if provided_reviewers:
            validated = self._validate_provided_reviewers(provided_reviewers, submission)
            results["provided_validated"] = len(validated)

        # If insufficient, auto-suggest
        needed = max(0, MIN_REVIEWERS - len(validated))
        auto_suggested = []
        if needed > 0:
            auto_suggested = self._auto_suggest(submission, exclude_emails=[r["email"] for r in validated])
            results["auto_suggested"] = len(auto_suggested)

        all_suggestions = validated + auto_suggested

        # Store on submission
        submission.suggested_reviewers_data = all_suggestions
        if not provided_reviewers or len(validated) < MIN_REVIEWERS:
            submission.status = SubmissionStatus.awaiting_reviewer_suggestions
        else:
            submission.status = SubmissionStatus.pending_assignment
        self.db.commit()

        results["total_suggestions"] = len(all_suggestions)
        results["suggestions"] = all_suggestions
        results["next_agent"] = "ReviewLinkGeneratorAgent"
        logger.info("Agent 3 completed for %s — %d suggestions", paper_id, len(all_suggestions))
        return results

    def _validate_provided_reviewers(self, reviewers: List[dict], submission: Submission) -> List[dict]:
        """Validate reviewer details and check for conflicts of interest."""
        validated = []
        author_email = (submission.author_email or "").lower()
        author_name = (submission.author_name or "").lower()

        for r in reviewers:
            email = (r.get("email") or "").strip().lower()
            name = (r.get("name") or "").strip()

            if not email or not name:
                logger.warning("Skipping reviewer with missing name/email: %s", r)
                continue

            # Conflict check: same email as author
            if email == author_email:
                logger.warning("Conflict: reviewer %s has same email as author", email)
                continue

            # Conflict check: same institution (basic)
            reviewer_affiliation = (r.get("affiliation") or "").lower()
            # We allow this as a warning, not a block

            validated.append({
                "name": name,
                "email": email,
                "orcid": r.get("orcid", ""),
                "affiliation": r.get("affiliation", ""),
                "expertise": r.get("expertise", ""),
                "match_score": 1.0,  # manually provided = highest confidence
                "source": "consult_party",
            })

        return validated

    def _auto_suggest(self, submission: Submission, exclude_emails: List[str] = None) -> List[dict]:
        """Find matching reviewers from internal DB + external APIs."""
        suggestions = []
        exclude = set(e.lower() for e in (exclude_emails or []))
        exclude.add((submission.author_email or "").lower())

        # Method 1: Internal database match by expertise tags
        keywords = submission.keywords or []
        title_words = [w.lower() for w in (submission.paper_title or "").split() if len(w) > 3]
        search_terms = keywords + title_words

        if search_terms:
            internal = self._search_internal_reviewers(search_terms, exclude)
            suggestions.extend(internal)

        # Method 2: OpenAlex API (find authors of similar papers)
        try:
            openalex = self._search_openalex(submission.paper_title, exclude)
            suggestions.extend(openalex)
        except Exception as exc:
            logger.warning("OpenAlex search failed: %s", exc)

        # Deduplicate by email. OpenAlex entries have no email, so we
        # dedupe those by (name, affiliation) instead so we don't collapse
        # multiple distinct people into one.
        seen_emails = set()
        seen_nameaffs = set()
        unique = []
        for s in suggestions:
            email = (s.get("email") or "").lower()
            if email:
                if email in seen_emails or email in exclude:
                    continue
                seen_emails.add(email)
            else:
                key = ((s.get("name") or "").lower(), (s.get("affiliation") or "").lower())
                if key in seen_nameaffs:
                    continue
                seen_nameaffs.add(key)
            unique.append(s)

        # LLM reranker: reorder by topical fit and attach a per-candidate
        # reason the editor can read. rerank_reviewer_candidates() returns []
        # when the API key is missing or the call fails — in that case we
        # keep the original heuristic ordering.
        self._apply_llm_rerank(submission, unique)

        # Sort by rerank score when present, otherwise fall back to the
        # heuristic match_score.
        unique.sort(
            key=lambda x: (x.get("rerank_score") if x.get("rerank_score") is not None else x.get("match_score", 0)),
            reverse=True,
        )
        return unique[:10]

    def _apply_llm_rerank(self, submission: Submission, candidates: List[dict]) -> None:
        """Mutate *candidates* in place, adding rerank_score / rerank_reason."""
        if not candidates:
            return
        try:
            ranked = rerank_reviewer_candidates(
                submission_meta={
                    "title": submission.paper_title,
                    "abstract": submission.abstract,
                    "keywords": list(submission.keywords or []),
                    "classified_field": submission.classified_field or "",
                },
                candidates=candidates,
            )
        except Exception:
            logger.exception("Agent 3: rerank_reviewer_candidates raised unexpectedly")
            return

        if not ranked:
            return

        for entry in ranked:
            idx = entry.get("index")
            if not isinstance(idx, int) or idx < 0 or idx >= len(candidates):
                continue
            candidates[idx]["rerank_score"] = round(float(entry.get("score", 0.0)), 3)
            candidates[idx]["rerank_reason"] = entry.get("reason", "")

    def _search_internal_reviewers(self, search_terms: List[str], exclude_emails: set) -> List[dict]:
        """Search internal reviewer database by expertise tags."""
        reviewers = (
            self.db.query(Reviewer)
            .filter(
                Reviewer.is_active == True,
                Reviewer.current_load < Reviewer.max_assignments,
            )
            .all()
        )

        scored = []
        for reviewer in reviewers:
            if reviewer.email.lower() in exclude_emails:
                continue

            tags = [t.lower() for t in (reviewer.expertise_tags or [])]
            # Simple keyword overlap score
            matches = sum(1 for term in search_terms if any(term.lower() in tag for tag in tags))
            if matches == 0:
                continue

            score = min(matches / max(len(search_terms), 1), 1.0)
            scored.append({
                "name": reviewer.name,
                "email": reviewer.email,
                "orcid": "",
                "affiliation": reviewer.institution or "",
                "expertise": ", ".join(reviewer.expertise_tags or []),
                "match_score": round(score, 2),
                "source": "internal_database",
                "reviewer_id": str(reviewer.id),
            })

        scored.sort(key=lambda x: x["match_score"], reverse=True)
        return scored[:5]

    def _search_openalex(self, title: str, exclude_emails: set) -> List[dict]:
        """Search OpenAlex for authors of similar papers."""
        if not title:
            return []

        # Clean title for search
        clean_title = re.sub(r'[^\w\s]', '', title)[:200]

        try:
            resp = httpx.get(
                "https://api.openalex.org/works",
                params={
                    "search": clean_title,
                    "per_page": 5,
                    "select": "id,title,authorships",
                },
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("OpenAlex API call failed: %s", exc)
            return []

        suggestions = []
        for work in data.get("results", []):
            for authorship in work.get("authorships", [])[:2]:  # Top 2 authors per paper
                author = authorship.get("author", {})
                name = author.get("display_name", "")
                orcid = (author.get("orcid") or "").replace("https://orcid.org/", "")

                institutions = authorship.get("institutions", [])
                affiliation = institutions[0].get("display_name", "") if institutions else ""

                if not name:
                    continue

                # We don't have email from OpenAlex, so mark it as needing manual entry
                suggestions.append({
                    "name": name,
                    "email": "",  # Not available from OpenAlex
                    "orcid": orcid,
                    "affiliation": affiliation,
                    "expertise": work.get("title", ""),
                    "match_score": 0.7,
                    "source": "openalex",
                })

        return suggestions[:5]
