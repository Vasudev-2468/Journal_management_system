"""Unit tests for ``app.services.cited_by_service.fetch_cited_by``.

The service reaches out to Crossref and OpenCitations; every test in
this module patches ``_http_client`` so no real network traffic is
emitted. We test three shapes:

  * empty / whitespace DOI -> defaults returned immediately
  * network error at any layer -> {count: 0, citing: []}
  * a well-formed response -> parsed count + enriched citing list
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


pytest.importorskip("httpx")

from app.services import cited_by_service as svc  # noqa: E402


# ── Helpers ──────────────────────────────────────────────


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _client_returning(response_map):
    """Build a MagicMock client whose ``get`` picks the response for a URL.

    ``response_map`` is a callable ``url -> _FakeResponse`` so a single
    client can serve both Crossref and OpenCitations lookups in one
    test.
    """
    fake_client = MagicMock()

    def _get(url, params=None, headers=None, timeout=None):
        return response_map(url)

    fake_client.get.side_effect = _get
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=None)
    return fake_client


# ── Empty / bad-shape DOIs ───────────────────────────────


def test_empty_doi_short_circuits():
    assert svc.fetch_cited_by("") == {"count": 0, "citing": []}


def test_whitespace_only_doi_short_circuits():
    assert svc.fetch_cited_by("   \t  ") == {"count": 0, "citing": []}


def test_non_string_doi_short_circuits():
    # noinspection PyTypeChecker
    assert svc.fetch_cited_by(None) == {"count": 0, "citing": []}
    # noinspection PyTypeChecker
    assert svc.fetch_cited_by(12345) == {"count": 0, "citing": []}


# ── Network error paths ──────────────────────────────────


def test_network_error_returns_empty_result():
    """A transport-layer exception must collapse to the empty default."""
    with patch.object(svc, "_http_client", side_effect=RuntimeError("network down")):
        result = svc.fetch_cited_by("10.1000/xyz123")
    assert result == {"count": 0, "citing": []}


def test_crossref_error_yields_zero_count_but_still_returns_citing():
    """When Crossref count fails but OpenCitations succeeds, we still
    return an empty citing list because ``_fetch_citing_dois`` runs
    against the same broken client - both surface empty."""

    fake_client = MagicMock()
    fake_client.get.side_effect = RuntimeError("boom")
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=None)

    with patch.object(svc, "_http_client", return_value=fake_client):
        result = svc.fetch_cited_by("10.1000/abc")

    # Neither list should blow up the caller.
    assert result["count"] == 0
    assert result["citing"] == []


# ── Valid response parsing ───────────────────────────────


def test_valid_response_parses_count_and_enriches_citing():
    """A Crossref work with 3 citations - OpenCitations returns two of
    them - should surface count=3, and each citing row is enriched with
    a title + year when Crossref has one for it."""

    citing_doi_a = "10.9999/aaa"
    citing_doi_b = "10.9999/bbb"

    def _response_for(url):
        if url.endswith("10.1000/found"):
            return _FakeResponse(
                200,
                {"message": {"is-referenced-by-count": 3}},
            )
        if "opencitations.net" in url:
            return _FakeResponse(
                200,
                [{"citing": citing_doi_a}, {"citing": citing_doi_b}],
            )
        # Enrichment lookups
        if url.endswith(citing_doi_a):
            return _FakeResponse(
                200,
                {"message": {"title": ["Citing paper A"], "issued": {"date-parts": [[2024]]}}},
            )
        if url.endswith(citing_doi_b):
            return _FakeResponse(
                200,
                {"message": {"title": ["Citing paper B"], "issued": {"date-parts": [[2023, 6]]}}},
            )
        return _FakeResponse(404, {})

    with patch.object(svc, "_http_client", return_value=_client_returning(_response_for)):
        result = svc.fetch_cited_by("10.1000/found")

    assert result["count"] == 3
    assert len(result["citing"]) == 2
    dois = {row["doi"] for row in result["citing"]}
    assert dois == {citing_doi_a, citing_doi_b}
    # At least one row must carry the enriched title.
    titles = {row.get("title") for row in result["citing"]}
    assert "Citing paper A" in titles
    years = {row.get("year") for row in result["citing"]}
    assert 2024 in years or 2023 in years


def test_opencitations_missing_falls_back_to_count_only():
    """Crossref knows the count, OpenCitations returns nothing - the
    caller should still get a real count with an empty citing list."""

    def _response_for(url):
        if "opencitations.net" in url:
            return _FakeResponse(200, [])
        return _FakeResponse(200, {"message": {"is-referenced-by-count": 7}})

    with patch.object(svc, "_http_client", return_value=_client_returning(_response_for)):
        result = svc.fetch_cited_by("10.1234/some")

    assert result["count"] == 7
    assert result["citing"] == []


def test_crossref_non_200_gives_zero_count():
    """A 404 from Crossref (unknown DOI) shows up as count=0, not an error."""

    def _response_for(url):
        return _FakeResponse(404, {})

    with patch.object(svc, "_http_client", return_value=_client_returning(_response_for)):
        result = svc.fetch_cited_by("10.0000/none")

    assert result == {"count": 0, "citing": []}


def test_bad_count_type_defaults_to_zero():
    """A malformed ``is-referenced-by-count`` (e.g. a string) must not raise."""

    def _response_for(url):
        if "opencitations.net" in url:
            return _FakeResponse(200, [])
        return _FakeResponse(200, {"message": {"is-referenced-by-count": "not-a-number"}})

    with patch.object(svc, "_http_client", return_value=_client_returning(_response_for)):
        result = svc.fetch_cited_by("10.1234/xyz")

    assert result["count"] == 0
