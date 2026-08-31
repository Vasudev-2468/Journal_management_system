"""Crossref deposit registration.

A thin, dependency-light wrapper around the Crossref deposit HTTP endpoint at
https://doi.crossref.org/servlet/deposit. Two behaviours by design:

  1. When ``CROSSREF_USERNAME`` and ``CROSSREF_PASSWORD`` are set in the
     environment, we post the article's already-generated deposit XML as a
     multipart form and return the batch id / response body.
  2. When either credential is missing, we short-circuit — no network call is
     made — and return ``{"ok": False, "detail": "Not configured", ...}``.
     Editors can wire the endpoint in the UI in advance of receiving
     production credentials without leaking half-registered records.

httpx is already a runtime dependency (see backend/requirements.txt), so we
use it when available; otherwise we fall back to ``urllib.request`` from the
standard library. Either transport is capped at a 15-second timeout so a
Crossref outage cannot block an editor's session.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CROSSREF_DEPOSIT_URL = "https://doi.crossref.org/servlet/deposit"
_TIMEOUT_SECONDS = 15


def _credentials() -> tuple[Optional[str], Optional[str]]:
    return os.getenv("CROSSREF_USERNAME"), os.getenv("CROSSREF_PASSWORD")


def _parse_batch_id(body: str) -> Optional[str]:
    """Best-effort extraction of the Crossref batch id from the response body.

    Crossref returns either an HTML success page or an XML fragment carrying
    the ``batch_id``. We only need something to display back to the editor
    and drop into the audit log, so a permissive regex is fine here.
    """
    if not body:
        return None
    match = re.search(r"batch[_ ]id[^A-Za-z0-9]{1,4}([A-Za-z0-9_\-.]+)", body, re.IGNORECASE)
    return match.group(1) if match else None


def _post_via_httpx(xml: str, username: str, password: str) -> dict[str, Any]:
    import httpx

    files = {
        "fname": ("deposit.xml", xml.encode("utf-8"), "application/xml"),
    }
    data = {
        "operation": "doMDUpload",
        "login_id": username,
        "login_passwd": password,
    }
    with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
        resp = client.post(_CROSSREF_DEPOSIT_URL, data=data, files=files)
    body = resp.text or ""
    ok = 200 <= resp.status_code < 300
    return {
        "ok": ok,
        "status_code": resp.status_code,
        "body": body[:4000],
        "batch_id": _parse_batch_id(body),
    }


def _post_via_urllib(xml: str, username: str, password: str) -> dict[str, Any]:
    import mimetypes  # noqa: F401  # kept for parity with httpx path
    import urllib.error
    import urllib.request
    import uuid

    boundary = f"----crossrefdeposit{uuid.uuid4().hex}"
    crlf = "\r\n"
    parts: list[bytes] = []

    def _text_part(name: str, value: str) -> bytes:
        return (
            f"--{boundary}{crlf}"
            f"Content-Disposition: form-data; name=\"{name}\"{crlf}{crlf}"
            f"{value}{crlf}"
        ).encode("utf-8")

    parts.append(_text_part("operation", "doMDUpload"))
    parts.append(_text_part("login_id", username))
    parts.append(_text_part("login_passwd", password))
    file_header = (
        f"--{boundary}{crlf}"
        f"Content-Disposition: form-data; name=\"fname\"; filename=\"deposit.xml\"{crlf}"
        f"Content-Type: application/xml{crlf}{crlf}"
    )
    parts.append(file_header.encode("utf-8") + xml.encode("utf-8") + crlf.encode("utf-8"))
    parts.append(f"--{boundary}--{crlf}".encode("utf-8"))
    body_bytes = b"".join(parts)

    req = urllib.request.Request(
        _CROSSREF_DEPOSIT_URL,
        data=body_bytes,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body_bytes)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            status = resp.getcode()
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
    return {
        "ok": 200 <= status < 300,
        "status_code": status,
        "body": raw[:4000],
        "batch_id": _parse_batch_id(raw),
    }


def register_article_via_crossref(article: Any, xml: str) -> dict[str, Any]:
    """Post ``xml`` for ``article`` to Crossref's deposit endpoint.

    Returns a dict with ``ok``, ``detail`` and ``batch_id`` keys. When
    Crossref credentials are unset, no network traffic is emitted and the
    return value is ``{"ok": False, "detail": "Not configured",
    "batch_id": None}`` so callers can wire the button up in advance of
    receiving production credentials.
    """
    username, password = _credentials()
    if not username or not password:
        logger.info(
            "Crossref registration skipped for article %s — CROSSREF_USERNAME/PASSWORD unset",
            getattr(article, "id", "?"),
        )
        return {"ok": False, "detail": "Not configured", "batch_id": None}

    try:
        try:
            import httpx  # noqa: F401
            result = _post_via_httpx(xml, username, password)
        except ImportError:
            result = _post_via_urllib(xml, username, password)
    except Exception as exc:  # network, timeout, malformed response — log & report.
        logger.exception(
            "Crossref registration failed for article %s", getattr(article, "id", "?")
        )
        return {"ok": False, "detail": f"Transport error: {exc}", "batch_id": None}

    detail = (
        f"HTTP {result['status_code']} from Crossref"
        if result.get("ok")
        else f"HTTP {result['status_code']} — {result.get('body', '')[:400]}"
    )
    return {
        "ok": bool(result.get("ok")),
        "detail": detail,
        "batch_id": result.get("batch_id"),
    }
