"""Generate a reader-friendly A4 PDF from an article's front-matter.

This is a *view*, not a manuscript export. Production tooling downstream
still owns the full-body typeset PDF; what we ship here is the title,
byline, abstract and reference list on A4, one page where possible, spilling
onto extra pages when the reference list is too long to fit.

Library choice — reasoned from ``backend/requirements.txt``:

* ``reportlab`` is not declared.
* ``fpdf2`` is not declared.
* ``PyMuPDF`` (``fitz``) *is* declared (``PyMuPDF>=1.24,<2.0``). It is a
  real, production-tested PDF library already shipped by this project for
  parsing uploads, and its ``insert_textbox`` API handles wrapping and
  measurement without pulling in a second PDF stack. So the caller's
  instruction — "prefer a real library where available" — resolves to
  PyMuPDF here.

If ``fitz`` fails to import at runtime we fall back to a hand-written,
minimal single-page PDF so the endpoint never 500s just because an
environment is missing the C extension.
"""

from __future__ import annotations

from typing import Iterable, List, Optional, Sequence

# A4 in PDF user-space points (1 pt = 1/72"). Kept as module-level
# constants so both the fitz path and the bytes-fallback path use the
# same page geometry.
A4_WIDTH_PT = 595.0
A4_HEIGHT_PT = 842.0
MARGIN_PT = 54.0  # ~0.75 inch — standard body copy margin.


# ── Helpers ──────────────────────────────────────────────────────────


def _author_display(article) -> str:
    """Build a byline string from whichever name fields the author row has.

    Mirrors the display logic used by the JATS and HTML views so a reader
    who downloads the PDF sees the same byline they saw on the article
    page.
    """
    author = getattr(article, "author", None)
    if author is None:
        return ""
    full = (getattr(author, "full_name", None) or "").strip()
    if full:
        return full
    parts = [
        (getattr(author, "first_name", None) or "").strip(),
        (getattr(author, "last_name", None) or "").strip(),
    ]
    joined = " ".join(p for p in parts if p)
    if joined:
        return joined
    return (getattr(author, "username", None) or "").strip()


def _reference_strings(references: Iterable) -> List[str]:
    """Coerce ORM ArticleReference rows (or plain strings) to display text.

    The router hands us the ORM rows in ``sequence`` order; a caller could
    also pass pre-formatted strings (that is how the unit tests do it), so
    accept either.
    """
    out: List[str] = []
    for r in references:
        if isinstance(r, str):
            text = r
        else:
            text = getattr(r, "text", None) or ""
        text = text.strip()
        if text:
            out.append(text)
    return out


# ── PyMuPDF path ─────────────────────────────────────────────────────


def _render_with_fitz(
    title: str,
    byline: str,
    abstract: str,
    references: Sequence[str],
) -> bytes:
    """Render using PyMuPDF's ``insert_textbox`` — handles wrapping for us.

    Layout is deliberately conservative: one column, generous margins,
    no fancy typography. Text that overflows a page rolls onto a new
    A4 page rather than being clipped.
    """
    import fitz  # local import so the fallback path is reachable at import time

    doc = fitz.open()
    page = doc.new_page(width=A4_WIDTH_PT, height=A4_HEIGHT_PT)

    left = MARGIN_PT
    right = A4_WIDTH_PT - MARGIN_PT
    top = MARGIN_PT
    bottom = A4_HEIGHT_PT - MARGIN_PT
    width = right - left
    y = top

    def _new_page() -> None:
        nonlocal page, y
        page = doc.new_page(width=A4_WIDTH_PT, height=A4_HEIGHT_PT)
        y = top

    def _write(
        text: str,
        *,
        fontname: str,
        fontsize: float,
        leading: float,
        gap_after: float,
    ) -> None:
        """Insert ``text`` at ``y`` and advance the cursor.

        ``insert_textbox`` returns a negative number when the box was too
        small to fit the content; we react by rolling to a new page and
        retrying once with the full remaining height.
        """
        nonlocal y
        if not text:
            return
        # Give the box the entire remaining page height; fitz will not
        # actually paint below the text it fitted.
        rect = fitz.Rect(left, y, right, bottom)
        # ``align=0`` is left-justified; ``align=3`` would be justified
        # but adds visible gaps in short paragraphs, so we stick with
        # left. ``lineheight`` is a multiplier; ``leading`` here is the
        # target line height in points so divide by fontsize.
        remaining = page.insert_textbox(
            rect,
            text,
            fontname=fontname,
            fontsize=fontsize,
            lineheight=leading / fontsize,
            align=0,
        )
        if remaining < 0:
            # Content did not fit — start a new page and try once more with
            # a full-height box. If it still does not fit (a >1-page-long
            # reference, say) we accept truncation over an infinite loop.
            _new_page()
            rect = fitz.Rect(left, y, right, bottom)
            page.insert_textbox(
                rect,
                text,
                fontname=fontname,
                fontsize=fontsize,
                lineheight=leading / fontsize,
                align=0,
            )
        # Estimate the vertical space consumed. ``insert_textbox`` doesn't
        # return the used height, so approximate by counting wrapped lines
        # via character-per-line heuristic. For headings & short lines
        # this is close enough; for the abstract we lean generous.
        approx_chars_per_line = max(1, int(width / (fontsize * 0.5)))
        line_count = max(1, sum(
            max(1, -(-len(seg) // approx_chars_per_line))
            for seg in text.splitlines() or [text]
        ))
        y += line_count * leading + gap_after
        if y >= bottom - leading:
            _new_page()

    _write(title or "Untitled", fontname="helv-bold", fontsize=18, leading=22, gap_after=8)
    if byline:
        _write(f"By {byline}", fontname="helv-oblique", fontsize=11, leading=14, gap_after=14)
    else:
        y += 6

    if abstract:
        _write("Abstract", fontname="helv-bold", fontsize=13, leading=16, gap_after=4)
        _write(abstract, fontname="helv", fontsize=11, leading=15, gap_after=14)

    _write("References", fontname="helv-bold", fontsize=13, leading=16, gap_after=4)
    if references:
        for idx, ref in enumerate(references, start=1):
            _write(f"{idx}. {ref}", fontname="helv", fontsize=10, leading=13, gap_after=4)
    else:
        _write("No references cited.", fontname="helv-oblique", fontsize=10, leading=13, gap_after=4)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# ── Hand-rolled fallback ─────────────────────────────────────────────


def _pdf_escape(text: str) -> str:
    """Escape a string for embedding inside a PDF text object.

    PDF's ``( … )`` string form requires ``\\``, ``(`` and ``)`` to be
    backslash-escaped. We also drop control characters that would
    corrupt the content stream.
    """
    out = []
    for ch in text:
        if ch in ("\\", "(", ")"):
            out.append("\\" + ch)
        elif ord(ch) < 32:
            out.append(" ")
        elif ord(ch) > 126:
            # Winansi has a wider glyph coverage than pure ASCII but
            # relying on it requires font subsetting we don't want in
            # the fallback path. Replace out-of-range chars with '?'.
            out.append("?")
        else:
            out.append(ch)
    return "".join(out)


def _wrap(text: str, width_chars: int) -> List[str]:
    """Word-wrap ``text`` into lines no wider than ``width_chars``."""
    lines: List[str] = []
    for paragraph in text.splitlines() or [""]:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = ""
        for w in words:
            candidate = w if not current else f"{current} {w}"
            if len(candidate) <= width_chars:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = w
        if current:
            lines.append(current)
    return lines


def _render_minimal_pdf(
    title: str,
    byline: str,
    abstract: str,
    references: Sequence[str],
) -> bytes:
    """Emit a valid single-page PDF by writing the bytes directly.

    Uses only the Helvetica standard font (Type1, no embedding required
    per PDF 1.4 §5.5.1) and a single content stream. The output is
    intentionally conservative — one page, cropped body content — because
    this path only runs when the preferred PyMuPDF path is unavailable.
    """
    content_lines: List[str] = ["BT", "/F1 18 Tf", "54 780 Td",
                                f"({_pdf_escape(title or 'Untitled')}) Tj",
                                "ET"]
    y = 750
    if byline:
        content_lines += [
            "BT", "/F1 11 Tf", f"54 {y} Td",
            f"(By {_pdf_escape(byline)}) Tj", "ET",
        ]
        y -= 24

    if abstract:
        content_lines += [
            "BT", "/F1 13 Tf", f"54 {y} Td", "(Abstract) Tj", "ET",
        ]
        y -= 18
        for line in _wrap(abstract, 82):
            if y < 90:
                break
            content_lines += [
                "BT", "/F1 11 Tf", f"54 {y} Td",
                f"({_pdf_escape(line)}) Tj", "ET",
            ]
            y -= 15
        y -= 6

    content_lines += [
        "BT", "/F1 13 Tf", f"54 {y} Td", "(References) Tj", "ET",
    ]
    y -= 18
    if references:
        for idx, ref in enumerate(references, start=1):
            for j, line in enumerate(_wrap(f"{idx}. {ref}", 92)):
                if y < 60:
                    break
                content_lines += [
                    "BT", "/F1 10 Tf", f"54 {y} Td",
                    f"({_pdf_escape(line)}) Tj", "ET",
                ]
                y -= 13
            if y < 60:
                break
    else:
        content_lines += [
            "BT", "/F1 10 Tf", f"54 {y} Td",
            "(No references cited.) Tj", "ET",
        ]

    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    # Assemble a minimal PDF 1.4 with 5 objects: Catalog, Pages, Page,
    # Font, Contents. We track byte offsets for the xref table.
    header = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"
    objects: List[bytes] = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R "
            b"/MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> "
            b"/Contents 5 0 R >>\nendobj\n"
        ),
        (
            b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
            b"/Encoding /WinAnsiEncoding >>\nendobj\n"
        ),
        (
            b"5 0 obj\n<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream\nendobj\n"
        ),
    ]

    body = bytearray(header)
    offsets: List[int] = []
    for obj in objects:
        offsets.append(len(body))
        body.extend(obj)

    xref_offset = len(body)
    body.extend(b"xref\n0 6\n")
    body.extend(b"0000000000 65535 f \n")
    for off in offsets:
        body.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    body.extend(b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n")
    body.extend(str(xref_offset).encode("ascii"))
    body.extend(b"\n%%EOF\n")
    return bytes(body)


# ── Public entry point ───────────────────────────────────────────────


def render_article_pdf(article, references: Optional[Iterable] = None) -> bytes:
    """Render ``article`` (+ its references) as A4 PDF bytes.

    ``article`` is expected to have ``title`` and ``abstract`` attributes
    and a loaded ``author`` relationship; ``references`` is an iterable of
    ``ArticleReference`` rows in citation order (the router hands them in
    ``sequence`` order). Either argument may be missing without raising —
    a paper with no abstract or no references still produces a valid PDF.
    """
    title = (getattr(article, "title", None) or "").strip()
    byline = _author_display(article)
    abstract = (getattr(article, "abstract", None) or "").strip()
    ref_strings = _reference_strings(references or [])

    try:
        return _render_with_fitz(title, byline, abstract, ref_strings)
    except Exception:
        # Any failure inside PyMuPDF (missing extension, font error,
        # resource cap) falls through to the hand-rolled writer so the
        # HTTP endpoint always responds with a valid PDF.
        return _render_minimal_pdf(title, byline, abstract, ref_strings)
