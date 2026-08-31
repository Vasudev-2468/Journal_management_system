"""
Smoke tests for the public HTTP surface.

Covers just enough of the recently-added routers to catch a broken
`main.py` include, a missing model column, or an import-time crash in a
router. Each test is a single request against the shared TestClient
fixture provided by ``conftest.py``.

The whole module is skipped when DATABASE_URL isn't configured (see the
fixture) so a fresh checkout without a database can still run the rest
of the suite.
"""

import os

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not configured; skipping public-endpoint smoke tests.",
)


# ── Baseline health ─────────────────────────────────────


def test_health_endpoint_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"


# ── SEO / discovery ─────────────────────────────────────


def test_robots_txt_returns_plain_text(client):
    resp = client.get("/robots.txt")
    assert resp.status_code == 200
    # Starlette lower-cases Content-Type header keys.
    content_type = resp.headers.get("content-type", "")
    assert content_type.startswith("text/plain")


def test_sitemap_xml_contains_urlset(client):
    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    assert "<urlset" in resp.text


def test_oai_pmh_identify_returns_envelope(client):
    resp = client.get("/oai-pmh", params={"verb": "Identify"})
    assert resp.status_code == 200
    assert "<Identify>" in resp.text


# ── Public list endpoints (no auth) ─────────────────────


def test_policies_list_returns_ok(client):
    resp = client.get("/policies/")
    assert resp.status_code == 200
    # Policies is a CMS list — shape may be a bare list or a wrapped
    # object; either way the JSON must parse.
    resp.json()


def test_announcements_list_returns_ok(client):
    resp = client.get("/announcements/")
    assert resp.status_code == 200
    resp.json()


def test_special_issues_list_returns_ok(client):
    resp = client.get("/special-issues/")
    assert resp.status_code == 200
    resp.json()


def test_board_list_returns_ok(client):
    resp = client.get("/board/")
    assert resp.status_code == 200
    resp.json()


# ── Auth-gated endpoint stays gated ─────────────────────


def test_contact_inbox_requires_editor(client):
    # No Authorization header — the require_editor_mfa dependency must
    # refuse the request. Both 401 (missing credentials) and 403
    # (invalid credentials) are acceptable outcomes.
    resp = client.get("/contact/")
    assert resp.status_code in (401, 403)
