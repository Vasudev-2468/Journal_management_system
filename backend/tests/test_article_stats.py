"""Tests for the public ``/article-stats`` router.

Covers the tracked-events surface:

* first ``track`` records the event and returns ``{recorded: true}``
* a repeat inside the 30-min dedup window returns ``{recorded: false}``
* the aggregate ``GET`` reports the resulting count
* the timeline returns zero-filled buckets across the window
"""

from __future__ import annotations

import os

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping article-stats tests.",
)


@pytest.fixture()
def _article(db_session, test_journal, test_author):
    """A published article the stats router can index off."""
    from app.models.article import Article

    a = Article(
        title="Stats Test Article",
        abstract="Abstract",
        content="Content",
        author_id=test_author.id,
        journal_id=test_journal.id,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


def test_track_view_first_call_records_event(
    db_session, _article, authorised_author_client
):
    resp = authorised_author_client.post(
        f"/article-stats/{_article.id}/track",
        json={"event_type": "view"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"recorded": True}


def test_track_view_second_identical_call_is_dedup_skipped(
    db_session, _article, authorised_author_client
):
    first = authorised_author_client.post(
        f"/article-stats/{_article.id}/track",
        json={"event_type": "view"},
    )
    assert first.status_code == 200
    assert first.json() == {"recorded": True}

    second = authorised_author_client.post(
        f"/article-stats/{_article.id}/track",
        json={"event_type": "view"},
    )
    assert second.status_code == 200
    assert second.json() == {"recorded": False}


def test_get_stats_returns_aggregate_counts(
    db_session, _article, authorised_author_client
):
    # Prime one view event through the endpoint so the dedup semantics
    # are exercised end-to-end.
    authorised_author_client.post(
        f"/article-stats/{_article.id}/track",
        json={"event_type": "view"},
    )

    resp = authorised_author_client.get(f"/article-stats/{_article.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["views"] >= 1
    assert body["downloads"] == 0
    assert body["citation_clicks"] == 0


def test_timeline_returns_zero_filled_buckets_for_window(
    db_session, _article, authorised_author_client
):
    resp = authorised_author_client.get(
        f"/article-stats/{_article.id}/timeline",
        params={"window": "7d"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    buckets = body["buckets"]
    # A ``7d`` window yields exactly seven daily buckets.
    assert len(buckets) == 7
    for bucket in buckets:
        # Shape: {"date": "YYYY-MM-DD", "views": int, "downloads": int}.
        assert set(bucket.keys()) == {"date", "views", "downloads"}
        assert isinstance(bucket["views"], int)
        assert isinstance(bucket["downloads"], int)
    # Dates come back sorted ascending.
    dates = [b["date"] for b in buckets]
    assert dates == sorted(dates)
