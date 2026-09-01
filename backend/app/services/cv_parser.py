"""CV parsing for the Add Board Member wizard.

Two stages:

  1. ``extract_text(file_bytes, mime_type)`` — turns an uploaded PDF or
     DOCX into plain text using the libraries already in
     requirements.txt (pdfplumber for PDFs, python-docx for DOCX). Plain
     text uploads pass through untouched.

  2. ``extract_board_profile(text)`` — asks ``gpt-4o-mini`` to pull the
     15-field editorial profile out of the CV text and returns a dict
     matching the ``EditorialBoardMemberCreate`` schema. Field names not
     confidently recovered come back missing so the editor can fill them
     in by hand.

Isolated from the rest of ai_agent.py so a failure here (bad PDF, LLM
outage) can't affect submission classification or reviewer matching.
"""
from __future__ import annotations

import io
import json
import logging
import re
from typing import Any, Optional

from openai import OpenAI

from app.config import settings


logger = logging.getLogger(__name__)


# Small model, deterministic — extraction is a structured-parse task,
# not open-ended generation. Keep temperature at 0 so two upload of the
# same CV produce the same field mapping.
_MODEL = "gpt-4o-mini"
_TEMPERATURE = 0.0
_MAX_TEXT_CHARS = 20_000

# Which columns on ``editorial_board_members`` the LLM is allowed to
# fill. The prompt echoes this list back to the model so it never
# hallucinates fields the schema does not accept.
_ALLOWED_FIELDS = (
    "name",
    "role",
    "category",
    "affiliation",
    "department",
    "country",
    "email",
    "phone",
    "orcid",
    "scholar_url",
    "scopus_id",
    "institutional_profile_url",
    "qualifications",
    "bio",
    "expertise",
    "keywords",
    "years_editorial_experience",
    "max_active_manuscripts",
)

_ALLOWED_CATEGORIES = (
    "editor_in_chief",
    "associate_editor",
    "managing_editor",
    "section_editor",
    "board_member",
    "advisory",
    "technical",
)


class CvParseError(Exception):
    """Raised on unrecoverable extraction / LLM failure."""


# ── Text extraction ─────────────────────────────────────


def _extract_pdf_text(data: bytes) -> str:
    """Extract text with pdfplumber. Silently drops pages that fail to
    parse — a corrupt page shouldn't blow the whole upload away."""
    import pdfplumber  # local import — heavy dependency

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:  # noqa: BLE001
                page_text = ""
            if page_text.strip():
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def _extract_docx_text(data: bytes) -> str:
    import docx  # local import — heavy dependency

    document = docx.Document(io.BytesIO(data))
    paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def extract_text(data: bytes, filename: str, mime_type: Optional[str]) -> str:
    """Turn an uploaded PDF / DOCX / TXT into plain text.

    ``mime_type`` is checked first (browsers send the right thing most of
    the time), with a fallback on the filename extension for the cases
    where the client omits it (some drag-and-drop paths do).
    """
    lower_name = (filename or "").lower()
    mt = (mime_type or "").lower()

    def _looks_pdf() -> bool:
        return "pdf" in mt or lower_name.endswith(".pdf")

    def _looks_docx() -> bool:
        return (
            "word" in mt
            or "officedocument.wordprocessingml.document" in mt
            or lower_name.endswith(".docx")
        )

    def _looks_text() -> bool:
        return mt.startswith("text/") or lower_name.endswith(".txt")

    try:
        if _looks_pdf():
            return _extract_pdf_text(data)
        if _looks_docx():
            return _extract_docx_text(data)
        if _looks_text():
            return data.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        raise CvParseError(f"Could not read the CV file: {exc}") from exc

    raise CvParseError(
        "Unsupported CV format — upload a PDF, DOCX, or plain text file."
    )


# ── LLM extraction ──────────────────────────────────────


def _system_prompt() -> str:
    allowed = ", ".join(_ALLOWED_FIELDS)
    cats = ", ".join(_ALLOWED_CATEGORIES)
    return (
        "You extract editorial-board profile fields from an academic CV. "
        "Return a single JSON object whose keys are drawn ONLY from this "
        f"whitelist: {allowed}. "
        "Omit any key you cannot fill confidently — do not invent values. "
        "'name' is the person's full name with title prefix (e.g. 'Dr. Jane Smith'). "
        "'role' is the editorial role or academic title as it should appear on the board page "
        "(e.g. 'Associate Professor of Computer Science'). "
        f"'category' MUST be one of: {cats}. Choose 'board_member' when unsure. "
        "'expertise' is a short comma-separated list of primary areas. "
        "'keywords' is a comma-separated list of 5–20 more specific keywords. "
        "'years_editorial_experience' and 'max_active_manuscripts' must be integers if given. "
        "'orcid' should be normalised to 0000-0000-0000-0000 form. "
        "'bio' is at most 3 sentences of professional biography derived from the CV. "
        "Respond with JSON only — no prose, no code fences."
    )


def _sanitise(payload: dict[str, Any]) -> dict[str, Any]:
    """Drop fields not on the whitelist, coerce integers, normalise
    obvious sloppiness the model may return. The router hands the
    result to a Pydantic schema which is the last line of defence."""
    out: dict[str, Any] = {}
    for key in _ALLOWED_FIELDS:
        if key not in payload:
            continue
        value = payload[key]
        if value in (None, "", []):
            continue
        if key in ("years_editorial_experience", "max_active_manuscripts"):
            try:
                out[key] = int(value)
            except (TypeError, ValueError):
                continue
        elif key == "category":
            v = str(value).strip().lower().replace("-", "_").replace(" ", "_")
            if v in _ALLOWED_CATEGORIES:
                out[key] = v
        elif key == "orcid":
            digits = re.sub(r"[^0-9Xx]", "", str(value))
            if len(digits) == 16:
                out[key] = f"{digits[0:4]}-{digits[4:8]}-{digits[8:12]}-{digits[12:16]}"
            else:
                out[key] = str(value).strip()
        else:
            out[key] = str(value).strip()
    return out


def extract_board_profile(text: str) -> dict[str, Any]:
    """Ask the LLM to pull structured fields out of CV plain text."""
    if not settings.OPENAI_API_KEY:
        raise CvParseError(
            "OPENAI_API_KEY is not configured on the server — CV extraction is disabled."
        )
    if not text or not text.strip():
        raise CvParseError("The uploaded CV had no readable text.")

    # Trim aggressively — CVs longer than this rarely add extractable
    # signal, and shorter prompts are faster + cheaper.
    trimmed = text[:_MAX_TEXT_CHARS]

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    try:
        response = client.chat.completions.create(
            model=_MODEL,
            temperature=_TEMPERATURE,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _system_prompt()},
                {"role": "user", "content": trimmed},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("OpenAI CV-parse call failed")
        raise CvParseError(f"AI extraction failed: {exc}") from exc

    content = (response.choices[0].message.content or "").strip()
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise CvParseError(
            f"AI returned an unparseable response: {content[:200]}"
        ) from exc

    if not isinstance(payload, dict):
        raise CvParseError("AI response was not a JSON object.")

    return _sanitise(payload)
