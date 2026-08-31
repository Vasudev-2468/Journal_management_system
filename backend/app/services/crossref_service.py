"""Crossref deposit registration and status polling.

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

Status polling
--------------
``poll_crossref_status(batch_id)`` hits Crossref's ``submissionDownload``
servlet and returns a small ``{"status", "detail"}`` payload — ``success``,
``pending`` or ``failed`` — so an editor UI can render the deposit outcome
without ever seeing Crossref's raw XML.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CROSSREF_DEPOSIT_URL = "https://doi.crossref.org/servlet/deposit"
_CROSSREF_STATUS_URL = "https://doi.crossref.org/servlet/submissionDownload"
_TIMEOUT_SECONDS = 15


def _credentials() -> tuple[Optional[str], Optional[str]]:
    return os.getenv("CROSSREF_USERNAME"), os.getenv("CROSSREF_PASSWORD")


def _parse_batch_id(body: str) -> Optional[str]:
    """Best-effort extraction of the Crossref batch id from the response body.

    Crossref's deposit response is an XML fragment containing
    ``<batch_id>...</batch_id>``. We fall back to a permissive scan so that
    the older HTML success page (``batch id: XYZ``) is also handled.
    """
    if not body:
        return None
    # Preferred: proper XML tag.
    tag_match = re.search(r"<batch_id[^>]*>\s*([^<\s]+)\s*</batch_id>", body, re.IGNORECASE)
    if tag_match:
        return tag_match.group(1)
    # Fallback: legacy plain-text / HTML success page.
    fallback = re.search(r"batch[_ ]id[^A-Za-z0-9]{1,4}([A-Za-z0-9_\-.]+)", body, re.IGNORECASE)
    return fallback.group(1) if fallback else None


def _parse_deposit_code(body: str) -> Optional[str]:
    """Pull the ``<code>`` element out of Crossref's deposit XML response.

    Crossref returns ``<code>``: ``0`` on success, non-zero on error. We
    return it as a string so we can drop it into the audit log verbatim
    even when Crossref's schema drifts.
    """
    if not body:
        return None
    match = re.search(r"<code[^>]*>\s*([^<\s]+)\s*</code>", body, re.IGNORECASE)
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
        "code": _parse_deposit_code(body),
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
        "code": _parse_deposit_code(raw),
    }


def register_article_via_crossref(article: Any, xml: str) -> dict[str, Any]:
    """Post ``xml`` for ``article`` to Crossref's deposit endpoint.

    Returns a dict with ``ok``, ``batch_id``, ``detail`` and ``raw`` keys.
    ``raw`` is the (first 4 kB of the) response body so the router can
    persist it into an audit-log row for later inspection. When Crossref
    credentials are unset, no network traffic is emitted and the return
    value is ``{"ok": False, "detail": "Not configured", "batch_id": None,
    "raw": ""}`` so callers can wire the button up in advance of receiving
    production credentials.
    """
    username, password = _credentials()
    if not username or not password:
        logger.info(
            "Crossref registration skipped for article %s — CROSSREF_USERNAME/PASSWORD unset",
            getattr(article, "id", "?"),
        )
        return {"ok": False, "detail": "Not configured", "batch_id": None, "raw": ""}

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
        return {
            "ok": False,
            "detail": f"Transport error: {exc}",
            "batch_id": None,
            "raw": "",
        }

    code = result.get("code")
    # Even a 200 HTTP can carry a Crossref-level failure via <code>1</code>.
    if result.get("ok") and code is not None and code != "0":
        detail = f"HTTP {result['status_code']} · Crossref code={code}"
        ok = False
    elif result.get("ok"):
        detail = f"HTTP {result['status_code']} from Crossref"
        ok = True
    else:
        detail = f"HTTP {result['status_code']} — {result.get('body', '')[:400]}"
        ok = False

    return {
        "ok": ok,
        "detail": detail,
        "batch_id": result.get("batch_id"),
        "raw": result.get("body", ""),
    }


def _fetch_status_via_httpx(batch_id: str, username: str, password: str) -> tuple[int, str]:
    import httpx

    params = {
        "usr": username,
        "pwd": password,
        "file_name": batch_id,
        "type": "result",
    }
    with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
        resp = client.get(_CROSSREF_STATUS_URL, params=params)
    return resp.status_code, (resp.text or "")


def _fetch_status_via_urllib(batch_id: str, username: str, password: str) -> tuple[int, str]:
    import urllib.error
    import urllib.parse
    import urllib.request

    query = urllib.parse.urlencode(
        {"usr": username, "pwd": password, "file_name": batch_id, "type": "result"}
    )
    url = f"{_CROSSREF_STATUS_URL}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=_TIMEOUT_SECONDS) as resp:
            return resp.getcode(), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        return exc.code, raw


def _classify_status_body(body: str) -> tuple[str, str]:
    """Reduce Crossref's status XML to ``(status, detail)``.

    Crossref returns a ``doi_batch_diagnostic`` document whose
    ``status`` attribute is ``completed`` (success), ``in_process`` /
    ``queued`` (pending) or ``failed``. We only care about surfacing one
    of the three so an editor UI can render an outcome badge.
    """
    if not body:
        return "pending", "Empty response from Crossref"

    lowered = body.lower()
    diag = re.search(r"doi_batch_diagnostic[^>]*status\s*=\s*[\"']([^\"']+)[\"']", body, re.IGNORECASE)
    status_attr = (diag.group(1) if diag else "").lower()

    if status_attr in {"completed", "success"} or "record_diagnostic status=\"success\"" in lowered:
        # A completed batch can still contain per-record failures; report those.
        failure = re.search(
            r"record_diagnostic[^>]*status\s*=\s*[\"']failure[\"']", body, re.IGNORECASE
        )
        if failure:
            snippet = body[failure.start() : failure.start() + 400]
            return "failed", f"Record-level failure: {snippet.strip()[:200]}"
        return "success", "Deposit completed"
    if status_attr in {"in_process", "queued", "processing"}:
        return "pending", f"Crossref status: {status_attr}"
    if status_attr == "failed":
        return "failed", "Crossref reports batch failed"

    # Legacy responses / unknown envelope — best-effort keyword sniff.
    if "in_process" in lowered or "queued" in lowered:
        return "pending", "Batch still processing"
    if "success" in lowered and "failure" not in lowered:
        return "success", "Deposit completed"
    if "failure" in lowered or "error" in lowered:
        return "failed", body.strip()[:200]
    return "pending", "Unknown Crossref status"


def poll_crossref_status(batch_id: str) -> dict[str, Any]:
    """Fetch the outcome of a previously-submitted Crossref batch.

    Returns ``{"status": "success"|"pending"|"failed", "detail": str}``.
    Missing credentials or transport errors are reported as ``failed`` —
    the caller records this in the audit log verbatim.
    """
    if not batch_id:
        return {"status": "failed", "detail": "Missing batch_id"}

    username, password = _credentials()
    if not username or not password:
        return {"status": "failed", "detail": "Not configured"}

    try:
        try:
            import httpx  # noqa: F401
            status_code, body = _fetch_status_via_httpx(batch_id, username, password)
        except ImportError:
            status_code, body = _fetch_status_via_urllib(batch_id, username, password)
    except Exception as exc:
        logger.exception("Crossref status poll failed for batch %s", batch_id)
        return {"status": "failed", "detail": f"Transport error: {exc}"}

    if not (200 <= status_code < 300):
        return {
            "status": "failed",
            "detail": f"HTTP {status_code} — {body[:300]}",
        }

    status, detail = _classify_status_body(body)
    return {"status": status, "detail": detail}
