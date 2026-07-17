"""
PDF processing service: intelligent metadata extraction + author-information redaction.

IDP pipeline extracts: title, abstract, keywords, and full author list
(first author, corresponding author, co-authors with emails / ORCIDs).
"""

import logging
import os
import re
import tempfile
from typing import Optional

import boto3
import fitz  # PyMuPDF
import pdfplumber

from app.config import settings

logger = logging.getLogger(__name__)


# ── S3 helpers ───────────────────────────────────────────

def _s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def _download_from_s3(s3_key: str, dest_path: str) -> None:
    _s3_client().download_file(settings.AWS_S3_BUCKET_NAME, s3_key, dest_path)


def _upload_to_s3(local_path: str, s3_key: str) -> None:
    _s3_client().upload_file(
        local_path,
        settings.AWS_S3_BUCKET_NAME,
        s3_key,
        ExtraArgs={"ContentType": "application/pdf"},
    )


# ── Regex patterns ───────────────────────────────────────

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[A-Za-z]{2,}"
)
ORCID_RE = re.compile(
    r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]"
)
ABSTRACT_START_RE = re.compile(
    r"(?:^|\n)\s*(Abstract|ABSTRACT|Summary|SUMMARY)\s*[:\-—]?\s*\n?",
    re.IGNORECASE,
)
ABSTRACT_END_RE = re.compile(
    r"(?:^|\n)\s*(?:Introduction|INTRODUCTION|Keywords|KEYWORDS|Index\s+[Tt]erms?|1\.\s)",
    re.IGNORECASE,
)
KEYWORDS_RE = re.compile(
    r"(?:^|\n)\s*(?:Keywords?|KEYWORDS?|Index\s+[Tt]erms?)\s*[:\-—]\s*(.*?)(?:\n\n|\n[A-Z1-9])",
    re.DOTALL | re.IGNORECASE,
)
CORRESPONDING_RE = re.compile(
    r"[Cc]orresponding\s+[Aa]uthor.*",
)
# Detect corresponding author name near the marker
CORRESPONDING_NAME_RE = re.compile(
    r"[Cc]orresponding\s+[Aa]uthor[s]?\s*[:\-]?\s*"
    r"([A-Z][a-z]+(?:[\s\-][A-Z][a-z]+)+)",
)
# Detect corresponding author email
CORRESPONDING_EMAIL_RE = re.compile(
    r"[Cc]orresponding\s+[Aa]uthor.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[A-Za-z]{2,})",
    re.DOTALL,
)
AUTHOR_SEPARATOR_RE = re.compile(
    r",\s*(?:and\s+)?|\s+and\s+|;\s*",
    re.IGNORECASE,
)
ACKNOWLEDGMENT_HEADER_RE = re.compile(
    r"(?:^|\n)\s*(Acknowledg(?:e?ment|ments)|ACKNOWLEDG(?:E?MENT|MENTS))\s*\n?",
    re.IGNORECASE,
)
# Superscript Unicode characters + common affiliation markers
SUPERSCRIPT_CLEAN_RE = re.compile(r"[¹²³⁴⁵⁶⁷⁸⁹⁰ᵃᵇᶜ†‡§¶\*]+")
# Affiliation-like line: starts with number/symbol, contains university/dept keywords
AFFILIATION_LINE_RE = re.compile(
    r"^[\d¹²³⁴⁵⁶⁷⁸⁹⁰†‡§¶\*]+\s*"
    r"(?:Department|Dept|School|Faculty|Institute|University|College|Lab|Centre|Center|Group)",
    re.IGNORECASE,
)


# ── Function 1: extract abstract and intro ───────────────

def extract_abstract_and_intro(pdf_s3_key: str) -> dict:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        _download_from_s3(pdf_s3_key, tmp_path)
        return _extract_from_local(tmp_path)
    except Exception:
        logger.exception("Failed to extract abstract from %s", pdf_s3_key)
        return {"title": None, "abstract": None, "full_first_pages_text": ""}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _extract_from_local(pdf_path: str) -> dict:
    pages_text: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:3]:
            text = page.extract_text()
            if text:
                pages_text.append(text)

    full_text = "\n".join(pages_text)
    title = _extract_title(pdf_path)
    abstract = _extract_abstract(full_text)

    return {
        "title": title,
        "abstract": abstract,
        "full_first_pages_text": full_text,
    }


def _extract_title(pdf_path: str) -> Optional[str]:
    """Find the largest-font text span on the first page."""
    try:
        doc = fitz.open(pdf_path)
        page = doc[0]
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        best_size = 0.0
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span["size"] > best_size and span["text"].strip():
                        best_size = span["size"]

        title_parts: list[str] = []
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if abs(span["size"] - best_size) < 0.5 and span["text"].strip():
                        title_parts.append(span["text"].strip())

        doc.close()
        return " ".join(title_parts) if title_parts else None
    except Exception:
        logger.exception("Title extraction failed for %s", pdf_path)
        return None


# Common PDF ligatures + non-breaking space → their plain equivalents.
_PDF_TEXT_TRANSLATIONS = str.maketrans({
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl",
    "ﬃ": "ffi", "ﬄ": "ffl",
    " ": " ", " ": " ", " ": " ",
})

_HYPHEN_WRAP_RE = re.compile(r"([A-Za-z])-\s*\n\s*([a-z])")


def _normalize_abstract_text(text: str) -> str:
    """
    Reflow PDF-extracted abstract text into clean, paragraph-shaped prose.

    PDF text extractors preserve the physical layout of the page: every soft
    line-wrap becomes a literal newline, and hyphenated words break across
    lines. Left as-is that produces the ragged textarea rendering the editor
    sees.

    This function:
      1. Replaces common ligatures and thin/non-breaking spaces.
      2. Joins hyphenated line-wraps ("progres-\\nsive" → "progressive").
      3. Collapses single newlines to spaces while preserving double newlines
         as paragraph breaks.
      4. Squeezes runs of internal whitespace.

    Not fixed here: stranded subscripts (e.g. "MoS" and "2" separated by
    intervening text). The PDF extractor reorders spans by physical position,
    so a subscript character can end up several lines away from its base.
    Recovering that would require bounding-box analysis in the extractor
    itself, not string cleanup.
    """
    if not text:
        return text

    text = text.translate(_PDF_TEXT_TRANSLATIONS)

    # ── Join hyphenated line-wraps ────────────────────────
    text = _HYPHEN_WRAP_RE.sub(r"\1\2", text)

    # ── Reflow: preserve paragraph breaks, drop soft wraps ─
    _PARA = "\x00PARA\x00"
    text = re.sub(r"\n{2,}", _PARA, text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = text.replace(_PARA, "\n\n")

    # ── Whitespace squeeze ────────────────────────────────
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)

    return text.strip()


def _extract_abstract(full_text: str) -> Optional[str]:
    match_start = ABSTRACT_START_RE.search(full_text)
    if not match_start:
        return None
    after_header = full_text[match_start.end():]
    match_end = ABSTRACT_END_RE.search(after_header)
    abstract = after_header[: match_end.start()] if match_end else after_header[:3000]
    abstract = _normalize_abstract_text(abstract)
    return abstract or None


def extract_keywords_from_text(full_text: str) -> list[str]:
    match = KEYWORDS_RE.search(full_text)
    if not match:
        return []
    kw_text = match.group(1).strip().replace("\n", " ")
    keywords = [k.strip(" .;") for k in re.split(r"[,;]", kw_text) if k.strip(" .;")]
    return keywords[:6]


# ── IDP Author Extraction ─────────────────────────────────

def _extract_authors_from_page(pdf_path: str, full_text: str) -> list[dict]:
    """
    Extract full author list from PDF page 1 using font-size heuristics.

    Algorithm:
      1. Parse all text spans on page 1 with their font sizes and y-positions.
      2. Title = largest font cluster.
      3. Author names = next-largest font cluster below the title, above the
         affiliation block and Abstract section.
      4. Affiliations = smaller-font lines below the author cluster (contain
         university/dept keywords or start with superscript markers).
      5. Post-process: split names, match emails/ORCIDs, detect corresponding author.

    Returns list of dicts: {name, email, affiliation, orcid, is_corresponding, order}
    """
    try:
        doc = fitz.open(pdf_path)
        page = doc[0]
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
        page_height = page.rect.height
        doc.close()
    except Exception:
        logger.exception("PDF open failed during author extraction")
        return []

    # ── Step 1: collect spans from top 50% of page ──────
    top_limit = page_height * 0.55
    spans = []
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            y = line["bbox"][1]
            if y > top_limit:
                continue
            line_text = " ".join(
                s["text"] for s in line["spans"] if s["text"].strip()
            ).strip()
            if not line_text:
                continue
            avg_size = sum(s["size"] for s in line["spans"]) / max(len(line["spans"]), 1)
            spans.append({"text": line_text, "size": avg_size, "y": y})

    spans.sort(key=lambda s: s["y"])
    if not spans:
        return []

    # ── Step 2: identify font-size tiers ────────────────
    max_size = max(s["size"] for s in spans)
    title_min = max_size - 1.5  # spans at ≈ title size

    post_title = [s for s in spans if s["size"] < title_min]
    if not post_title:
        return []

    # Second-largest size tier = author names
    sizes_desc = sorted({round(s["size"], 0) for s in post_title}, reverse=True)
    author_min_size = (sizes_desc[1] if len(sizes_desc) > 1 else sizes_desc[0]) - 0.5

    # Stop at first affiliation-like line or Abstract header
    abstract_y = None
    for s in post_title:
        if re.search(r"^\s*Abstract\s*$|^\s*ABSTRACT\s*$", s["text"], re.IGNORECASE):
            abstract_y = s["y"]
            break

    author_candidates = []
    for s in post_title:
        if abstract_y and s["y"] >= abstract_y:
            break
        if s["size"] < author_min_size:
            break
        if AFFILIATION_LINE_RE.match(s["text"]):
            break
        author_candidates.append(s)

    if not author_candidates:
        return []

    # ── Step 3: collect affiliation lines ───────────────
    affil_candidates = [
        s for s in post_title
        if s not in author_candidates
        and s["size"] < author_min_size
        and (abstract_y is None or s["y"] < abstract_y)
    ]

    # Build affiliation map: marker → affiliation text
    # e.g. "¹Department of CS, MIT" → {1: "Department of CS, MIT"}
    affil_map: dict[str, str] = {}
    numbered_affil_re = re.compile(
        r"^[¹²³⁴⁵⁶⁷⁸⁹⁰\d†‡§¶\*]+\s*(.+)"
    )
    for s in affil_candidates:
        m = numbered_affil_re.match(s["text"])
        if m:
            key = re.match(r"^([¹²³⁴⁵⁶⁷⁸⁹⁰\d†‡§¶\*]+)", s["text"])
            if key:
                affil_map[key.group(1)] = m.group(1).strip()

    # ── Step 4: parse name string ────────────────────────
    raw_author_text = " ".join(s["text"] for s in author_candidates)

    # Keep per-author superscript markers before cleaning (for affil matching)
    # Pattern: Name¹² → extract "Name" with markers "¹²"
    author_with_markers: list[tuple[str, str]] = []
    token_re = re.compile(
        r"([A-Z][a-zA-Z\-\.]+(?:\s+[A-Z][a-zA-Z\-\.]+)+)"  # Name
        r"([¹²³⁴⁵⁶⁷⁸⁹⁰\d†‡§¶\*,]*)"                        # optional markers
    )
    for m in token_re.finditer(raw_author_text):
        name = m.group(1).strip()
        markers = m.group(2).strip()
        # Basic sanity: 2-5 words, no years
        words = name.split()
        if 2 <= len(words) <= 6 and not re.search(r"\d{4}", name):
            author_with_markers.append((name, markers))

    if not author_with_markers:
        # Fallback: split by separator
        cleaned = SUPERSCRIPT_CLEAN_RE.sub(" ", raw_author_text)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        for raw_name in AUTHOR_SEPARATOR_RE.split(cleaned):
            name = raw_name.strip().strip(".,;")
            words = name.split()
            if 2 <= len(words) <= 6 and not re.search(r"\d{4}", name):
                author_with_markers.append((name, ""))

    if not author_with_markers:
        return []

    # ── Step 5: emails, ORCIDs, corresponding author ─────
    search_text = full_text[:3000]
    emails = [
        e for e in EMAIL_RE.findall(search_text)
        if not e.endswith((".png", ".pdf", ".jpg", ".svg"))
    ]
    orcids = ORCID_RE.findall(search_text)

    # Detect corresponding author
    corr_name: Optional[str] = None
    corr_email: Optional[str] = None

    cn_match = CORRESPONDING_NAME_RE.search(search_text)
    if cn_match:
        corr_name = cn_match.group(1).strip()

    ce_match = CORRESPONDING_EMAIL_RE.search(search_text)
    if ce_match:
        corr_email = ce_match.group(1)

    def _name_matches(n1: str, n2: str) -> bool:
        w1 = set(n1.lower().split())
        w2 = set(n2.lower().split())
        return len(w1 & w2) >= min(2, len(w2))

    # ── Step 6: assemble result ──────────────────────────
    result: list[dict] = []
    email_idx = 0

    for order, (name, markers) in enumerate(author_with_markers[:8]):
        is_corr = False
        affiliation = ""

        # Map superscript markers to affiliation
        if markers and affil_map:
            # Try each marker character
            for marker_char in markers:
                if marker_char in affil_map:
                    affiliation = affil_map[marker_char]
                    break
            if not affiliation:
                # Try full marker string
                affiliation = affil_map.get(markers, "")

        # Detect corresponding
        if corr_name and _name_matches(name, corr_name):
            is_corr = True
        elif "*" in markers or "†" in markers:
            is_corr = True

        # Assign email
        author_email = ""
        if is_corr and corr_email:
            author_email = corr_email
        elif email_idx < len(emails):
            author_email = emails[email_idx]
            email_idx += 1

        # Assign ORCID
        orcid = orcids[order] if order < len(orcids) else ""

        result.append({
            "name": name,
            "email": author_email,
            "affiliation": affiliation,
            "orcid": orcid,
            "is_corresponding": is_corr,
            "order": order + 1,
        })

    # Default: if no corresponding found, mark first author
    if result and not any(a["is_corresponding"] for a in result):
        result[0]["is_corresponding"] = True
        if not result[0]["email"] and emails:
            result[0]["email"] = emails[0]

    return result


# ── Public extraction entrypoint ─────────────────────────

def extract_metadata_from_local(pdf_path: str) -> dict:
    """
    Full IDP extraction: title, abstract, keywords, and author list.

    Returns:
        {
          title: str | None,
          abstract: str | None,
          keywords: list[str],
          authors: list[{name, email, affiliation, orcid, is_corresponding, order}]
        }
    """
    result = _extract_from_local(pdf_path)
    full_text = result.get("full_first_pages_text", "")
    keywords = extract_keywords_from_text(full_text)
    authors = _extract_authors_from_page(pdf_path, full_text)
    return {
        "title": result["title"],
        "abstract": result["abstract"],
        "keywords": keywords,
        "authors": authors,
    }


# ── Function 2: redact author information ────────────────

def redact_author_information(pdf_s3_key: str, submission_id: str) -> str:
    """
    Download the original PDF, redact author-identifying information, upload
    the redacted copy to S3, and return its key.
    """
    tmp_in = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp_out = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp_in_path = tmp_in.name
    tmp_out_path = tmp_out.name
    tmp_in.close()
    tmp_out.close()

    redaction_log: list[str] = []

    try:
        _download_from_s3(pdf_s3_key, tmp_in_path)
        doc = fitz.open(tmp_in_path)

        _redact_first_page_header(doc, redaction_log)
        _redact_pattern_all_pages(doc, EMAIL_RE, "email", redaction_log)
        _redact_pattern_all_pages(doc, ORCID_RE, "ORCID", redaction_log)
        _redact_pattern_all_pages(doc, CORRESPONDING_RE, "corresponding-author", redaction_log)
        _redact_acknowledgment_section(doc, redaction_log)

        doc.save(tmp_out_path, deflate=True, garbage=4)
        doc.close()

        redacted_key = f"submissions/{submission_id}/redacted.pdf"
        _upload_to_s3(tmp_out_path, redacted_key)

        logger.info(
            "Redacted %d items in submission %s: %s",
            len(redaction_log),
            submission_id,
            "; ".join(redaction_log) if redaction_log else "none",
        )
        return redacted_key

    except Exception:
        logger.exception(
            "Redaction failed for submission %s (key=%s)", submission_id, pdf_s3_key
        )
        raise
    finally:
        for p in (tmp_in_path, tmp_out_path):
            if os.path.exists(p):
                os.unlink(p)


def _redact_first_page_header(doc: fitz.Document, log: list[str]) -> None:
    if len(doc) == 0:
        return

    page = doc[0]
    page_height = page.rect.height
    top_region_bottom = page_height * 0.20

    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    max_font_size = 0.0
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span["size"] > max_font_size:
                    max_font_size = span["size"]

    title_threshold = max_font_size - 1.0

    for block in blocks:
        if block.get("type") != 0:
            continue
        bbox = fitz.Rect(block["bbox"])
        if bbox.y1 > top_region_bottom:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span["size"] >= title_threshold:
                    continue
                if not span["text"].strip():
                    continue
                rect = fitz.Rect(span["bbox"])
                page.add_redact_annot(rect, fill=(0, 0, 0))
                log.append(f"page1-header: '{span['text'][:40]}…'")

    page.apply_redactions()


def _redact_pattern_all_pages(
    doc: fitz.Document,
    pattern: re.Pattern,
    label: str,
    log: list[str],
) -> None:
    for page_num, page in enumerate(doc):
        text_instances = page.get_text("text")
        for match in pattern.finditer(text_instances):
            matched_text = match.group()
            quads = page.search_for(matched_text)
            for quad in quads:
                page.add_redact_annot(quad, fill=(0, 0, 0))
                log.append(f"p{page_num + 1}-{label}: '{matched_text[:40]}'")
        page.apply_redactions()


def _redact_acknowledgment_section(doc: fitz.Document, log: list[str]) -> None:
    next_section_re = re.compile(
        r"(?:^|\n)\s*(?:References|REFERENCES|Bibliography|BIBLIOGRAPHY)\s*\n?",
        re.IGNORECASE,
    )

    for page_num, page in enumerate(doc):
        text = page.get_text("text")
        ack_match = ACKNOWLEDGMENT_HEADER_RE.search(text)
        if not ack_match:
            continue

        start_pos = ack_match.start()
        next_match = next_section_re.search(text[ack_match.end():])
        end_pos = ack_match.end() + next_match.start() if next_match else len(text)
        redact_text = text[start_pos:end_pos]

        for line in redact_text.split("\n"):
            line = line.strip()
            if not line:
                continue
            quads = page.search_for(line)
            for quad in quads:
                page.add_redact_annot(quad, fill=(0, 0, 0))

        log.append(f"p{page_num + 1}-acknowledgment: {len(redact_text)} chars")
        page.apply_redactions()
