"""Bulk import service for editor-facing reference ingestion.

Two pure-Python parsers turn pasted BibTeX / RIS text into the shape the
``article_references`` router already accepts::

    {"text": str, "doi": str | None, "url": str | None, "sequence": int}

Both parsers are defensive by construction — they never ``raise``. A
malformed entry is quietly dropped so an editor pasting a mixed-quality
export from a reference manager doesn't lose the other entries in the
batch. The only side-effect of failure is a shorter output list.

The two entry points are intentionally kept dependency-free (no
``bibtexparser``, no ``rispy``) so the ingestor stays inside the project
without pulling new pip dependencies.

Output ``text`` is a readable citation reconstructed from the parsed
fields (roughly APA-flavoured) so a downstream reader who only ever
looks at the ``text`` column still gets a full citation string.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional


# ─────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────


def _clean(value: Optional[str]) -> str:
    """Trim whitespace and strip any wrapping ``{ }`` BibTeX braces."""
    if value is None:
        return ""
    v = value.strip()
    # BibTeX values often arrive wrapped in ``{ ... }`` (or nested braces
    # for protected capitalisation). Strip a single outer layer and
    # collapse the remaining ones — BibTeX braces are not semantic once
    # we're rendering a plain-text citation.
    while len(v) >= 2 and v[0] == "{" and v[-1] == "}":
        v = v[1:-1].strip()
    v = v.replace("{", "").replace("}", "")
    # Collapse whitespace runs (newlines, tabs) into single spaces so a
    # multi-line BibTeX value renders cleanly in the reader.
    v = re.sub(r"\s+", " ", v).strip()
    return v


def _authors_to_display(raw: str) -> str:
    """Convert a BibTeX / RIS-flavoured author list to a display string.

    Accepts the common BibTeX ``Last, First and Last2, First2`` shape and
    RIS-style single-line ``AU  - Last, First``. Individual names are
    kept as-is (we don't attempt to re-order into ``First Last``); the
    only transformation is joining with ``, `` and collapsing final
    ``and`` to make the string readable outside a citation manager.
    """
    if not raw:
        return ""
    # BibTeX uses ' and ' as the author separator. Split case-insensitively
    # on that with word boundaries so we don't chop names containing "and".
    parts = re.split(r"\s+and\s+", raw, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p and p.strip()]
    return ", ".join(parts)


def _render_citation(fields: Dict[str, str]) -> str:
    """Build a readable citation string from parsed tag values.

    The shape roughly follows APA::

        Doe, J. (2024). Title. Journal, 12(3), 100-110.

    Absent fields collapse cleanly — a preprint with only title + year
    still renders a sensible one-line citation.
    """
    author = fields.get("author") or fields.get("authors") or ""
    year = fields.get("year") or ""
    title = fields.get("title") or ""
    journal = (
        fields.get("journal")
        or fields.get("booktitle")
        or fields.get("publisher")
        or ""
    )
    volume = fields.get("volume") or ""
    number = fields.get("number") or fields.get("issue") or ""
    pages = fields.get("pages") or ""

    pieces: List[str] = []
    if author:
        pieces.append(author)
    if year:
        pieces.append(f"({year})")
    if title:
        pieces.append(f"{title}.")
    tail_bits: List[str] = []
    if journal:
        tail_bits.append(journal)
    if volume:
        vol = volume
        if number:
            vol = f"{volume}({number})"
        tail_bits.append(vol)
    if pages:
        tail_bits.append(pages)
    if tail_bits:
        pieces.append(", ".join(tail_bits) + ".")
    text = " ".join(pieces).strip()
    # Never emit a completely empty citation — the caller uses ``text``
    # to identify the entry, and an empty string is worse than a raw
    # fallback like the DOI or URL.
    if not text:
        text = fields.get("doi") or fields.get("url") or ""
    return text


# ─────────────────────────────────────────────────────────
# BibTeX
# ─────────────────────────────────────────────────────────


# Match an @-entry header: ``@article{key,``. The key is optional so a
# missing citekey still lets the entry parse.
_BIBTEX_ENTRY = re.compile(r"@(\w+)\s*\{\s*([^,\s]*)\s*,", re.MULTILINE)


def _split_bibtex_entries(text: str) -> List[str]:
    """Return the raw body of each ``@entry{ ... }`` block in ``text``.

    Uses a manual brace scan rather than a regex — BibTeX values often
    contain nested braces (protected titles), and a greedy ``.*?\\}``
    regex would happily stop at the first inner ``}``. The scan stays
    O(n) so a very long paste is still fast.
    """
    entries: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        m = _BIBTEX_ENTRY.search(text, i)
        if not m:
            break
        # Move to just after the opening ``{`` of the entry body.
        body_start = m.end()  # already past the comma
        depth = 1
        j = body_start
        while j < n and depth > 0:
            c = text[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = text[body_start:j]
        entries.append(body)
        # Continue after the closing brace (or the end of string if the
        # entry was truncated).
        i = j + 1 if j < n else n
    return entries


# Match a ``tag = value,`` pair inside a BibTeX body. ``value`` may be
# brace-delimited, quoted, or a bare token — we accept all three shapes.
_BIBTEX_FIELD = re.compile(
    r"(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\"[^\"]*\"|[^,\n]+)\s*,?",
    re.MULTILINE,
)


def _parse_bibtex_body(body: str) -> Dict[str, str]:
    """Parse a single BibTeX entry body into a lower-cased field map."""
    out: Dict[str, str] = {}
    for tag, value in _BIBTEX_FIELD.findall(body):
        key = tag.strip().lower()
        # Trim surrounding quotes if the value came in as ``"..."``.
        v = value.strip()
        if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
            v = v[1:-1]
        out[key] = _clean(v)
    return out


def parse_bibtex(text: str) -> List[dict]:
    """Parse pasted BibTeX text into the reference-importer output shape.

    Never raises. Malformed entries (missing braces, no title, etc.) are
    dropped from the output — the count difference is the caller's cue
    that something was skipped.
    """
    if not text or not text.strip():
        return []
    try:
        bodies = _split_bibtex_entries(text)
    except Exception:  # noqa: BLE001 — defensive; never surface parse errors
        return []

    out: List[dict] = []
    seq = 1
    for body in bodies:
        try:
            fields = _parse_bibtex_body(body)
        except Exception:  # noqa: BLE001
            # Skip this entry silently and keep going.
            continue

        # Normalise the author list into a display string before the
        # citation renderer sees it.
        if "author" in fields:
            fields["author"] = _authors_to_display(fields["author"])

        citation = _render_citation(fields)
        if not citation:
            # No usable content — skip so we don't insert an empty row.
            continue

        entry: dict = {
            "sequence": seq,
            "text": citation,
        }
        doi = fields.get("doi")
        if doi:
            entry["doi"] = doi
        url = fields.get("url")
        if url:
            entry["url"] = url
        out.append(entry)
        seq += 1
    return out


# ─────────────────────────────────────────────────────────
# RIS
# ─────────────────────────────────────────────────────────


# RIS tag / value on one line. Values can span multiple lines by
# continuation (leading whitespace) — the block splitter below handles
# concatenation before we hit this regex.
_RIS_LINE = re.compile(r"^([A-Z][A-Z0-9])\s*-\s*(.*?)\s*$")


def _split_ris_records(text: str) -> List[List[str]]:
    """Split a RIS blob into per-record line lists.

    A RIS record starts with ``TY  - <type>`` and ends with ``ER  -``.
    Lines outside a record are ignored (whitespace, blank separators,
    accidental headers). Multi-line values are stitched back onto the
    previous line so the caller sees one logical line per RIS field.
    """
    lines = text.splitlines()
    records: List[List[str]] = []
    current: Optional[List[str]] = None
    for raw in lines:
        line = raw.rstrip("\r")
        # Continuation line — no ``XX  -`` tag at the start. Attach it
        # to the previous line so the value stays whole.
        if current is not None and current and not _RIS_LINE.match(line) and line.strip():
            # Only merge if the previous line already had a tag; otherwise
            # treat as a stray line and skip.
            current[-1] = current[-1] + " " + line.strip()
            continue
        m = _RIS_LINE.match(line)
        if not m:
            continue
        tag, _ = m.group(1), m.group(2)
        if tag == "TY":
            # Start a new record even if the previous one had no ER.
            if current is not None and current:
                records.append(current)
            current = [line]
        elif tag == "ER":
            if current is not None:
                current.append(line)
                records.append(current)
                current = None
        else:
            if current is None:
                # A field outside any TY..ER envelope — start a synthetic
                # record so we still capture it. Malformed files sometimes
                # omit the leading TY.
                current = []
            current.append(line)
    # Trailing record with no ER — accept it rather than lose data.
    if current:
        records.append(current)
    return records


# RIS tag → normalised field name. Multi-valued tags (AU, KW) are
# accumulated in the parser rather than collapsed here.
_RIS_TAG_MAP = {
    "TI": "title",
    "T1": "title",
    "T2": "journal",
    "JF": "journal",
    "JO": "journal",
    "JA": "journal",
    "PY": "year",
    "Y1": "year",
    "VL": "volume",
    "IS": "number",
    "SP": "start_page",
    "EP": "end_page",
    "DO": "doi",
    "UR": "url",
    "PB": "publisher",
    "BT": "booktitle",
}


def _parse_ris_record(record_lines: List[str]) -> Dict[str, str]:
    """Turn one RIS record's lines into a normalised field map."""
    fields: Dict[str, str] = {}
    authors: List[str] = []
    for line in record_lines:
        m = _RIS_LINE.match(line)
        if not m:
            continue
        tag, value = m.group(1), _clean(m.group(2))
        if not value:
            continue
        if tag in ("AU", "A1", "A2", "A3"):
            authors.append(value)
            continue
        mapped = _RIS_TAG_MAP.get(tag)
        if mapped is None:
            continue
        # First occurrence wins — RIS files sometimes repeat T1/TI, and
        # the first is the canonical title.
        fields.setdefault(mapped, value)
    if authors:
        fields["author"] = ", ".join(authors)
    # Collapse SP + EP into a single ``pages`` field for the citation
    # renderer.
    sp = fields.pop("start_page", None)
    ep = fields.pop("end_page", None)
    if sp and ep:
        fields["pages"] = f"{sp}-{ep}"
    elif sp:
        fields["pages"] = sp
    elif ep:
        fields["pages"] = ep
    return fields


def parse_ris(text: str) -> List[dict]:
    """Parse pasted RIS text into the reference-importer output shape.

    Never raises. Records that fail to yield a usable citation string
    are dropped silently.
    """
    if not text or not text.strip():
        return []
    try:
        records = _split_ris_records(text)
    except Exception:  # noqa: BLE001
        return []

    out: List[dict] = []
    seq = 1
    for rec in records:
        try:
            fields = _parse_ris_record(rec)
        except Exception:  # noqa: BLE001
            continue
        citation = _render_citation(fields)
        if not citation:
            continue
        entry: dict = {
            "sequence": seq,
            "text": citation,
        }
        doi = fields.get("doi")
        if doi:
            entry["doi"] = doi
        url = fields.get("url")
        if url:
            entry["url"] = url
        out.append(entry)
        seq += 1
    return out
