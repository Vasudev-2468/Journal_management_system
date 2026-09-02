"""
Journal Identifier Agent (spec §1-8) + Publication Eligibility Agent (spec §7-11).

Deterministic, pure-function agents. No LLM cost, no side effects
inside the agent — the caller decides whether to persist a state
transition. Every rule the platform enforces at publication time
lives here so the DOI / Publication pipeline shares one source of
truth (spec §11 — "critical publication rules should be enforced by
your backend").

Design rules (spec §2):
  * The agent NEVER invents an ISSN. It reads, validates format, or
    reports a NOT_REQUESTED / NOT_YET_VERIFIED status.
  * The agent NEVER moves an identifier to VERIFIED on its own —
    that transition is authorised by the editor after receiving the
    official assignment from the ISSN authority.
  * Publication rules are hard checks. The agent's role is to
    surface what's missing; the outer router either blocks or lets
    the editor override with explicit permission.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ── ISSN format + checksum ──────────────────────────────

_ISSN_RE = re.compile(r"^\d{4}-\d{3}[\dxX]$")


def validate_issn(value: str) -> Dict[str, Any]:
    """ISSN check per ISO 3297.

    Format: NNNN-NNNC where C is a mod-11 checksum ('X' means 10).
    Returns ``{ok, normalised, error?}`` — never raises. Editors paste
    ISSNs in messy shapes; this normalises to the canonical form and
    verifies the checksum before letting the agent stamp VERIFIED.
    """
    if not isinstance(value, str) or not value:
        return {"ok": False, "normalised": None, "error": "ISSN value is empty."}
    cleaned = value.strip().upper().replace(" ", "")
    # Accept both hyphenated and unhyphenated input.
    if "-" not in cleaned and len(cleaned) == 8:
        cleaned = cleaned[:4] + "-" + cleaned[4:]
    if not _ISSN_RE.match(cleaned):
        return {
            "ok": False,
            "normalised": cleaned,
            "error": "ISSN must be NNNN-NNNC (four digits, hyphen, three digits, one digit or X).",
        }
    digits = cleaned.replace("-", "")
    total = 0
    for i, ch in enumerate(digits[:7]):
        total += int(ch) * (8 - i)
    check_digit = digits[7]
    check_value = 10 if check_digit == "X" else int(check_digit)
    expected = (11 - (total % 11)) % 11
    if expected != check_value:
        return {
            "ok": False,
            "normalised": cleaned,
            "error": f"ISSN checksum failed (expected {'X' if expected == 10 else expected}, got {check_digit}).",
        }
    return {"ok": True, "normalised": cleaned, "error": None}


# ── DOI prefix ──────────────────────────────────────────

_DOI_PREFIX_RE = re.compile(r"^10\.\d{4,9}$")


def validate_doi_prefix(value: str) -> Dict[str, Any]:
    """DOI prefix format check.

    Per Handle System conventions the prefix is ``10.`` followed by
    4-9 digits. The registration agency (Crossref / DataCite / etc.)
    hands the prefix to the publisher; this only checks the shape."""
    if not isinstance(value, str) or not value:
        return {"ok": False, "normalised": None, "error": "DOI prefix is empty."}
    cleaned = value.strip()
    if not _DOI_PREFIX_RE.match(cleaned):
        return {
            "ok": False,
            "normalised": cleaned,
            "error": "DOI prefix must be '10.' followed by 4-9 digits (e.g. 10.12345).",
        }
    return {"ok": True, "normalised": cleaned, "error": None}


# ── ISSN Application Assistant ──────────────────────────
#
# The agent's Prepare Application step gathers the fields most ISSN
# national centres ask for. Completeness is a hard blocker on
# submission (spec §6 — "Agent can validate that the information is
# complete"); optional fields are surfaced separately so the editor
# can decide whether they need them.

REQUIRED_APPLICATION_FIELDS = [
    ("journal_title",     "Journal title"),
    ("journal_type",      "Journal type (Electronic / Print / Both)"),
    ("publisher",         "Publisher name"),
    ("country",           "Country of publication"),
    ("website",           "Journal website URL"),
    ("frequency",         "Publication frequency"),
    ("language",          "Primary language(s)"),
    ("editorial_contact", "Editorial contact email"),
]

OPTIONAL_APPLICATION_FIELDS = [
    ("subject_areas",     "Subject areas / discipline(s)"),
    ("first_issue_date",  "Date of first issue"),
    ("issue_numbering",   "Volume/issue numbering scheme"),
    ("archival_policy",   "Long-term archival policy"),
]


@dataclass
class ApplicationCheck:
    ok: bool
    missing_required: List[str] = field(default_factory=list)
    missing_optional: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    normalised: Dict[str, str] = field(default_factory=dict)


def check_issn_application(payload: Dict[str, Any]) -> ApplicationCheck:
    """Validate an ISSN application draft.

    Never submits anything — the human editor handles the official
    submission with the national centre (spec §6). This function
    exists to guarantee the paperwork is complete before the editor
    walks it over."""
    missing_required: List[str] = []
    missing_optional: List[str] = []
    warnings: List[str] = []
    normalised: Dict[str, str] = {}

    for key, label in REQUIRED_APPLICATION_FIELDS:
        v = str((payload.get(key) or "")).strip()
        if not v:
            missing_required.append(label)
        else:
            normalised[key] = v
    for key, label in OPTIONAL_APPLICATION_FIELDS:
        v = str((payload.get(key) or "")).strip()
        if not v:
            missing_optional.append(label)
        else:
            normalised[key] = v

    website = normalised.get("website", "")
    if website and not (website.startswith("http://") or website.startswith("https://")):
        warnings.append("Website should include the http(s):// scheme.")
    email = normalised.get("editorial_contact", "")
    if email and "@" not in email:
        warnings.append("Editorial contact does not look like an email address.")
    journal_type = (normalised.get("journal_type") or "").lower()
    if journal_type and journal_type not in {"electronic", "print", "both", "electronic and print"}:
        warnings.append("Journal type should be Electronic, Print, or Both.")

    return ApplicationCheck(
        ok=not missing_required,
        missing_required=missing_required,
        missing_optional=missing_optional,
        warnings=warnings,
        normalised=normalised,
    )


# ── Publication Eligibility Agent (spec §7-8, §11) ─────

@dataclass
class EligibilityCheck:
    ok: bool
    blockers: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    doi_eligible: bool = False


def run_publication_eligibility(
    *,
    decision: Optional[str],
    manuscript_present: bool,
    final_manuscript_present: bool,
    editor_authorized: bool,
    journal_active: bool,
    journal_has_doi_prefix: bool,
    journal_has_verified_issn: bool,
    metadata_complete: bool,
    doi_already_assigned: bool,
) -> EligibilityCheck:
    """Deterministic gate for the DOI / Publication pipeline.

    Each rule is a hard check the outer router enforces before minting
    a DOI (spec §11). ``ok`` reflects publish-eligibility; ``doi_eligible``
    is the tighter subset that also requires a verified journal
    identifier and no prior DOI on this manuscript.
    """
    blockers: List[str] = []
    warnings: List[str] = []

    dec = (decision or "").lower()
    if dec != "accepted":
        blockers.append(
            f"Editorial decision is '{decision or 'none'}' — must be ACCEPTED before publication."
        )
    if not manuscript_present:
        blockers.append("No manuscript found for this submission.")
    if not final_manuscript_present:
        blockers.append("Final (accepted) manuscript file is missing.")
    if not editor_authorized:
        blockers.append("The current user is not authorised to publish this manuscript.")
    if not journal_active:
        blockers.append("Journal is not marked active.")
    if not metadata_complete:
        warnings.append("Manuscript metadata is not complete — publication will use whatever is present.")

    # DOI-specific rules: prefix + verified journal identifier + no
    # prior DOI. Failing any of these blocks DOI assignment but not
    # necessarily the underlying publication event (spec §11).
    doi_blockers: List[str] = []
    if not journal_has_doi_prefix:
        doi_blockers.append("Journal has no DOI prefix configured.")
    if not journal_has_verified_issn:
        doi_blockers.append("Journal has no VERIFIED ISSN — DOI cannot be minted without one.")
    if doi_already_assigned:
        doi_blockers.append("A DOI is already assigned to this manuscript.")

    doi_eligible = not blockers and not doi_blockers

    return EligibilityCheck(
        ok=not blockers,
        blockers=blockers + doi_blockers,
        warnings=warnings,
        doi_eligible=doi_eligible,
    )
