"""Cited-by lookups against Crossref + OpenCitations.

We fetch two pieces of information for a given DOI:

  * ``is-referenced-by-count`` from the Crossref REST API
    (``https://api.crossref.org/works/{doi}``) — the authoritative citation
    count for the DOI. This is the only field we need from Crossref and
    it costs one HTTP call.
  * The list of citing works from OpenCitations' COCI index
    (``https://opencitations.net/index/coci/api/v1/citations/{doi}``) — an
    optional enrichment. When the index is unreachable, rate-limits us, or
    simply has no data, we downgrade to an empty list rather than fail the
    request. Titles/years are pulled from a follow-up Crossref lookup on
    each citing DOI when a small batch of enrichments is cheap.

Design notes
------------
* No new dependencies — ``httpx`` is already declared in
  ``backend/requirements.txt``.
* One 12-second timeout on every outbound request; a single sluggish
  citation index cannot lock up the article page.
* Any exception at any layer collapses to ``{"count": 0, "citing": []}``
  so the frontend never has to deal with partial responses.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_CROSSREF_WORKS_URL = "https://api.crossref.org/works/{doi}"
_OPENCITATIONS_URL = "https://opencitations.net/index/coci/api/v1/citations/{doi}"
_TIMEOUT_SECONDS = 12
_ENRICH_LIMIT = 8  # only enrich the first few citing DOIs to stay under the timeout
_MAX_CITING = 50  # cap the payload size we return to the frontend


def _http_client():
    """Return a configured ``httpx.Client`` — imported lazily so callers
    that don't need this service don't pay for the httpx import.
    """
    import httpx

    return httpx.Client(
        timeout=_TIMEOUT_SECONDS,
        headers={
            # A polite, identifying UA lets Crossref keep us in their fast
            # pool per their API etiquette.
            "User-Agent": "JournalManagementSystem/1.0 (cited-by)",
            "Accept": "application/json",
        },
    )


def _fetch_count(client, doi: str) -> int:
    """Fetch ``is-referenced-by-count`` for ``doi`` from Crossref."""
    resp = client.get(_CROSSREF_WORKS_URL.format(doi=doi))
    if resp.status_code != 200:
        return 0
    data = resp.json()
    message = data.get("message") or {}
    raw = message.get("is-referenced-by-count", 0)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _fetch_citing_dois(client, doi: str) -> list[str]:
    """Fetch citing DOIs from OpenCitations' COCI index.

    Any HTTP or JSON failure produces an empty list — the caller falls back
    to reporting the raw count only.
    """
    try:
        resp = client.get(_OPENCITATIONS_URL.format(doi=doi))
        if resp.status_code != 200:
            return []
        rows = resp.json() or []
    except Exception:
        logger.debug("OpenCitations lookup failed for %s", doi, exc_info=True)
        return []

    citing: list[str] = []
    for row in rows[:_MAX_CITING]:
        citing_doi = (row or {}).get("citing")
        if citing_doi:
            citing.append(citing_doi.strip())
    return citing


def _enrich_citing_work(client, citing_doi: str) -> dict[str, Any]:
    """Look up the title + year for a citing DOI. Silent on failure.

    We fetch a tiny ``select`` slice from Crossref so we're not carrying
    around the entire work record for every citing entry.
    """
    result: dict[str, Any] = {"doi": citing_doi, "title": None, "year": None}
    try:
        resp = client.get(
            _CROSSREF_WORKS_URL.format(doi=citing_doi),
            params={"select": "title,issued,DOI"},
        )
        if resp.status_code != 200:
            return result
        message = (resp.json() or {}).get("message") or {}
    except Exception:
        return result

    titles = message.get("title") or []
    if titles:
        result["title"] = titles[0]

    issued = message.get("issued") or {}
    date_parts = issued.get("date-parts") or []
    if date_parts and date_parts[0]:
        try:
            result["year"] = int(date_parts[0][0])
        except (TypeError, ValueError):
            pass

    return result


def fetch_cited_by(doi: str) -> dict[str, Any]:
    """Return ``{"count", "citing"}`` for ``doi``.

    * ``count`` is Crossref's ``is-referenced-by-count`` (0 if absent).
    * ``citing`` is a best-effort list of ``{doi, title?, year?}`` records
      from OpenCitations, enriched from Crossref where cheap.

    Any transport, parse, or network failure returns
    ``{"count": 0, "citing": []}`` — the frontend renders the empty
    state, and the editor can retry after transient outages.
    """
    if not doi or not isinstance(doi, str):
        return {"count": 0, "citing": []}
    doi = doi.strip()
    if not doi:
        return {"count": 0, "citing": []}

    try:
        with _http_client() as client:
            try:
                count = _fetch_count(client, doi)
            except Exception:
                logger.exception("Crossref count lookup failed for %s", doi)
                count = 0

            citing_dois = _fetch_citing_dois(client, doi)
            citing: list[dict[str, Any]] = []
            for idx, citing_doi in enumerate(citing_dois):
                if idx < _ENRICH_LIMIT:
                    citing.append(_enrich_citing_work(client, citing_doi))
                else:
                    citing.append({"doi": citing_doi, "title": None, "year": None})
    except Exception:
        logger.exception("cited-by lookup failed for %s", doi)
        return {"count": 0, "citing": []}

    return {"count": count, "citing": citing}
