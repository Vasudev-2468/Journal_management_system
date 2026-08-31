"""Unit tests for ``app.services.file_validator``.

Pure-function tests over a small bytes payload. We verify:

  * ``detect_mime`` recognises PDF / PNG / JPEG / ZIP magic bytes.
  * Unknown or truncated bytes return ``None``.
  * ``validate_kind`` accepts a matching kind and rejects a mismatch.
"""

from __future__ import annotations

from app.services.file_validator import detect_mime, validate_kind


# ── Real magic-byte prefixes (just enough to be recognised) ─────

PDF_HEAD = b"%PDF-1.4\n%some tail"
PNG_HEAD = b"\x89PNG\r\n\x1a\ntrailing"
JPEG_HEAD = b"\xff\xd8\xff\xe0\x00\x10JFIF"
ZIP_HEAD = b"PK\x03\x04\x14\x00\x00\x00"


# ── Positive detection ──────────────────────────────────


def test_detect_pdf():
    assert detect_mime(PDF_HEAD) == "application/pdf"


def test_detect_png():
    assert detect_mime(PNG_HEAD) == "image/png"


def test_detect_jpeg():
    assert detect_mime(JPEG_HEAD) == "image/jpeg"


def test_detect_zip():
    assert detect_mime(ZIP_HEAD) == "application/zip"


# ── Negative detection ──────────────────────────────────


def test_wrong_bytes_returns_none():
    assert detect_mime(b"just some text") is None


def test_empty_buffer_returns_none():
    assert detect_mime(b"") is None


def test_short_buffer_returns_none():
    # A single byte cannot match any signature.
    assert detect_mime(b"%") is None


def test_html_bytes_do_not_match_anything():
    assert detect_mime(b"<html><body>hi</body></html>") is None


# ── validate_kind — matches ─────────────────────────────


def test_validate_kind_pdf_by_extension():
    assert validate_kind(PDF_HEAD, "pdf") is True


def test_validate_kind_pdf_by_mime():
    assert validate_kind(PDF_HEAD, "application/pdf") is True


def test_validate_kind_image_matches_png_and_jpeg():
    assert validate_kind(PNG_HEAD, "image") is True
    assert validate_kind(JPEG_HEAD, "image") is True


def test_validate_kind_docx_accepts_zip_container():
    """docx / xlsx / pptx are ZIP containers on the wire — the validator
    exposes them all as aliases for ``application/zip``."""
    assert validate_kind(ZIP_HEAD, "docx") is True
    assert validate_kind(ZIP_HEAD, "xlsx") is True
    assert validate_kind(ZIP_HEAD, "pptx") is True


def test_validate_kind_case_insensitive():
    assert validate_kind(PDF_HEAD, "PDF") is True
    assert validate_kind(PDF_HEAD, "Application/PDF") is True


# ── validate_kind — mismatches ──────────────────────────


def test_validate_kind_pdf_rejects_png_bytes():
    assert validate_kind(PNG_HEAD, "pdf") is False


def test_validate_kind_image_rejects_pdf_bytes():
    assert validate_kind(PDF_HEAD, "image") is False


def test_validate_kind_zip_rejects_jpeg_bytes():
    assert validate_kind(JPEG_HEAD, "zip") is False


def test_validate_kind_unknown_label_rejected():
    """A caller who asks for a kind we have no alias for gets ``False``
    even when the bytes are a recognised type — we do not silently
    admit an unrecognised expected_kind."""
    assert validate_kind(PDF_HEAD, "no-such-kind") is False


def test_validate_kind_empty_kind_rejected():
    assert validate_kind(PDF_HEAD, "") is False


def test_validate_kind_empty_buffer_rejected():
    assert validate_kind(b"", "pdf") is False
