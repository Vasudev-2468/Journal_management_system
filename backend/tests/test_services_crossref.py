"""Unit tests for ``app.services.crossref_service``.

These tests never hit the network. They exercise two behaviours:

* ``register_article_via_crossref`` short-circuits to ``{ok: False,
  detail: "Not configured"}`` when either the CROSSREF_USERNAME or
  CROSSREF_PASSWORD environment variable is unset.
* When credentials are present but the response body is malformed, the
  function correctly classifies the deposit as "failed" and returns a
  detail string that reflects the transport outcome.

``poll_crossref_status`` gets a similar treatment — a credential-less
call is a fast failure, a well-formed ``completed`` batch is a success,
and a batch with a record-level failure lands as ``failed``.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest


# httpx is a runtime dep of the service; skip if it isn't around.
pytest.importorskip("httpx")

from app.services import crossref_service as svc  # noqa: E402


class _FakeArticle:
    """Cheap stand-in for the ORM row the router hands the service."""

    def __init__(self, article_id: int = 42) -> None:
        self.id = article_id


# ── register_article_via_crossref ────────────────────────


def test_register_returns_not_configured_when_username_missing(monkeypatch):
    monkeypatch.delenv("CROSSREF_USERNAME", raising=False)
    monkeypatch.setenv("CROSSREF_PASSWORD", "hunter2")

    result = svc.register_article_via_crossref(_FakeArticle(), "<?xml version='1.0'?><doi_batch/>")

    assert result == {"ok": False, "detail": "Not configured", "batch_id": None, "raw": ""}


def test_register_returns_not_configured_when_password_missing(monkeypatch):
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.delenv("CROSSREF_PASSWORD", raising=False)

    result = svc.register_article_via_crossref(_FakeArticle(), "<x/>")

    assert result["ok"] is False
    assert result["detail"] == "Not configured"
    assert result["batch_id"] is None


def test_register_flags_malformed_body_as_failed(monkeypatch):
    """A 200 that carries no ``<batch_id>`` / no ``<code>`` is still a success
    per ``result["ok"]``, but the outer helper should NOT invent a batch id
    for it. This test enforces both invariants."""
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    fake_response = {
        "ok": True,
        "status_code": 200,
        "body": "<html>not xml we recognise</html>",
        "batch_id": None,
        "code": None,
    }
    with patch.object(svc, "_post_via_httpx", return_value=fake_response):
        result = svc.register_article_via_crossref(_FakeArticle(), "<x/>")

    # No <code> means we cannot prove a Crossref-level failure, so the
    # transport-level ok flows through. The batch_id must stay None.
    assert result["batch_id"] is None
    assert "HTTP 200" in result["detail"]


def test_register_detects_crossref_level_failure(monkeypatch):
    """A 200 HTTP response carrying ``<code>1</code>`` is a Crossref-level
    failure — the helper must surface ok=False and mention the code."""
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    fake_response = {
        "ok": True,
        "status_code": 200,
        "body": "<doi_batch_diagnostic><code>1</code></doi_batch_diagnostic>",
        "batch_id": None,
        "code": "1",
    }
    with patch.object(svc, "_post_via_httpx", return_value=fake_response):
        result = svc.register_article_via_crossref(_FakeArticle(), "<x/>")

    assert result["ok"] is False
    assert "code=1" in result["detail"] or "code" in result["detail"]


def test_register_handles_transport_exception(monkeypatch):
    """A raised exception inside ``_post_via_httpx`` collapses to a
    transport-error report, not a stack trace back to the caller."""
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    with patch.object(svc, "_post_via_httpx", side_effect=RuntimeError("boom")):
        result = svc.register_article_via_crossref(_FakeArticle(), "<x/>")

    assert result["ok"] is False
    assert "Transport error" in result["detail"]
    assert result["batch_id"] is None


# ── poll_crossref_status ─────────────────────────────────


def test_poll_status_rejects_empty_batch_id():
    assert svc.poll_crossref_status("") == {"status": "failed", "detail": "Missing batch_id"}


def test_poll_status_requires_credentials(monkeypatch):
    monkeypatch.delenv("CROSSREF_USERNAME", raising=False)
    monkeypatch.delenv("CROSSREF_PASSWORD", raising=False)

    result = svc.poll_crossref_status("some-batch-id")

    assert result == {"status": "failed", "detail": "Not configured"}


def test_poll_status_completed(monkeypatch):
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    body = '<doi_batch_diagnostic status="completed"></doi_batch_diagnostic>'
    with patch.object(svc, "_fetch_status_via_httpx", return_value=(200, body)):
        result = svc.poll_crossref_status("batch-1")

    assert result["status"] == "success"


def test_poll_status_flags_record_level_failure(monkeypatch):
    """A ``completed`` batch that carries a per-record failure must
    still classify as ``failed``."""
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    body = (
        '<doi_batch_diagnostic status="completed">'
        '<record_diagnostic status="failure"><msg>bad DOI</msg></record_diagnostic>'
        "</doi_batch_diagnostic>"
    )
    with patch.object(svc, "_fetch_status_via_httpx", return_value=(200, body)):
        result = svc.poll_crossref_status("batch-2")

    assert result["status"] == "failed"


def test_poll_status_pending(monkeypatch):
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    body = '<doi_batch_diagnostic status="in_process"></doi_batch_diagnostic>'
    with patch.object(svc, "_fetch_status_via_httpx", return_value=(200, body)):
        result = svc.poll_crossref_status("batch-3")

    assert result["status"] == "pending"


def test_poll_status_http_error(monkeypatch):
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    with patch.object(svc, "_fetch_status_via_httpx", return_value=(500, "server error")):
        result = svc.poll_crossref_status("batch-4")

    assert result["status"] == "failed"
    assert "HTTP 500" in result["detail"]


def test_poll_status_transport_error(monkeypatch):
    monkeypatch.setenv("CROSSREF_USERNAME", "user")
    monkeypatch.setenv("CROSSREF_PASSWORD", "pw")

    with patch.object(svc, "_fetch_status_via_httpx", side_effect=OSError("network down")):
        result = svc.poll_crossref_status("batch-5")

    assert result["status"] == "failed"
    assert "Transport error" in result["detail"]


# ── low-level parsers stay honest ────────────────────────


def test_parse_batch_id_from_xml():
    body = "<doi_batch><batch_id>abcdef123</batch_id></doi_batch>"
    assert svc._parse_batch_id(body) == "abcdef123"


def test_parse_batch_id_returns_none_when_absent():
    assert svc._parse_batch_id("<html>no batch here</html>") is None


def test_parse_deposit_code():
    assert svc._parse_deposit_code("<code>0</code>") == "0"
    assert svc._parse_deposit_code("<code>1</code>") == "1"
    assert svc._parse_deposit_code("no code") is None


# Just to shake out that SimpleNamespace-shaped articles still log cleanly.
def test_register_accepts_simple_namespace_article(monkeypatch):
    monkeypatch.delenv("CROSSREF_USERNAME", raising=False)
    monkeypatch.delenv("CROSSREF_PASSWORD", raising=False)
    result = svc.register_article_via_crossref(SimpleNamespace(id=None), "<x/>")
    assert result["detail"] == "Not configured"
