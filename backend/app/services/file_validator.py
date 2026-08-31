"""Magic-bytes MIME sniffing.

Trusting the file extension or the browser-supplied Content-Type is not enough
when an untrusted client is uploading a manuscript or a supplementary artefact
— either can be spoofed. This module inspects the first few bytes of the
payload and returns the mime type we recognise, or ``None`` when the header
does not match any known signature.

Only the formats we accept for manuscript uploads and figures are covered:

  * PDF   (%PDF-)
  * PNG   (89 50 4E 47 0D 0A 1A 0A)
  * JPEG  (FF D8 FF)
  * ZIP   (50 4B 03 04)  — also covers modern .docx / .xlsx / .pptx which are
                          ZIP containers underneath.

The functions are pure and take a plain ``bytes`` buffer, so callers can feed
them either an ``UploadFile.file.read()`` or an already-in-memory blob.
"""

from __future__ import annotations

from typing import Optional


# ── Signatures ──────────────────────────────────────────
# Each entry is (mime_type, magic_bytes).  Order matters only where two
# signatures could theoretically collide — none of these do today.
_SIGNATURES: tuple[tuple[str, bytes], ...] = (
    ("application/pdf", b"%PDF-"),
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/jpeg", b"\xff\xd8\xff"),
    ("application/zip", b"PK\x03\x04"),
)


# ── Extension → accepted mime types ─────────────────────
# ``validate_kind`` treats the ``expected_kind`` argument as either a mime
# type, a bare file extension ("pdf") or a common short label ("image").
_KIND_ALIASES: dict[str, tuple[str, ...]] = {
    "pdf": ("application/pdf",),
    "application/pdf": ("application/pdf",),
    "png": ("image/png",),
    "image/png": ("image/png",),
    "jpg": ("image/jpeg",),
    "jpeg": ("image/jpeg",),
    "image/jpeg": ("image/jpeg",),
    "zip": ("application/zip",),
    "application/zip": ("application/zip",),
    # ``image`` accepts any recognised image mime type — useful for figure uploads.
    "image": ("image/png", "image/jpeg"),
    # docx / xlsx / pptx are ZIP archives on the wire; we can only assert the
    # container is well-formed here — deeper validation belongs to the caller.
    "docx": ("application/zip",),
    "xlsx": ("application/zip",),
    "pptx": ("application/zip",),
}


def detect_mime(buf: bytes) -> Optional[str]:
    """Return the mime type detected from the first few bytes of ``buf``.

    Returns ``None`` when the buffer is empty, too short, or does not match
    any known signature. Never raises on unexpected input.
    """
    if not buf:
        return None
    for mime, magic in _SIGNATURES:
        if buf.startswith(magic):
            return mime
    return None


def validate_kind(buf: bytes, expected_kind: str) -> bool:
    """Return ``True`` when ``buf``'s detected mime matches ``expected_kind``.

    ``expected_kind`` may be a full mime type ("application/pdf"), a bare
    extension ("pdf", "png"), or a short label ("image"). Unknown labels are
    rejected — a caller who asks for a kind we do not recognise is treated
    the same as one whose file failed to match: the answer is ``False``.
    """
    if not expected_kind:
        return False
    detected = detect_mime(buf)
    if detected is None:
        return False
    accepted = _KIND_ALIASES.get(expected_kind.lower())
    if accepted is None:
        # Fall back to a direct compare — lets a caller pass an exact mime
        # type we have a signature for but no alias key for.
        return detected == expected_kind.lower()
    return detected in accepted
