"""Integration tests for ``GET /search/articles``.

The route depends on a Postgres full-text vector — no attempt is made to
emulate that on SQLite. The fixture chain skips everything in this
module unless ``TEST_DATABASE_URL`` points at a real Postgres.

Covers:
  * A seeded article surfaces on a matching query and carries a ``rank``.
  * Pagination bounds (page < 1 / page_size > 100) are rejected as 422.
  * An empty ``q`` returns an empty result set (not an error).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not set; skipping search integration tests.",
)


# ── Helpers ──────────────────────────────────────────────


def _seed_article(db_session, author_id, journal_id, *, title, abstract, content):
    """Insert an Article and, because our test schema uses a plain
    ``search_vector`` column instead of the migration's GENERATED one,
    fill it in explicitly with ``to_tsvector('english', ...)``."""
    from app.models.article import Article

    a = Article(
        title=title,
        abstract=abstract,
        content=content,
        author_id=author_id,
        journal_id=journal_id,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)

    db_session.execute(
        text(
            "UPDATE articles SET search_vector = "
            "to_tsvector('english', coalesce(title,'') || ' ' || "
            "coalesce(abstract,'') || ' ' || coalesce(content,'')) "
            "WHERE id = :id"
        ),
        {"id": a.id},
    )
    db_session.commit()
    return a


# ── Empty q ──────────────────────────────────────────────


def test_search_empty_q_returns_empty_result(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": ""},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_search_whitespace_only_q_returns_empty_result(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "   "},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ── Pagination bounds ────────────────────────────────────


def test_search_page_zero_rejected(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "anything", "page": 0},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 422


def test_search_page_size_too_large_rejected(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "anything", "page_size": 500},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 422


def test_search_page_size_zero_rejected(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "anything", "page_size": 0},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 422


def test_search_invalid_kind_rejected(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "anything", "kind": "nonsense"},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 422


# ── Positive match ───────────────────────────────────────


def test_search_returns_matching_article_with_rank(
    authorised_editor_client, db_session, test_author, test_journal
):
    _seed_article(
        db_session,
        test_author.id,
        test_journal.id,
        title="Federated Learning for Genomics",
        abstract="A study on federated learning applied to genomic datasets.",
        content="Detailed content about federated learning experiments.",
    )

    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "federated genomics", "page": 1, "page_size": 5},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 5
    assert body["total"] >= 1
    assert len(body["items"]) >= 1

    first = body["items"][0]
    # Contract of the endpoint: every item carries id, title, and rank.
    assert "id" in first
    assert "title" in first
    assert "rank" in first
    assert isinstance(first["rank"], (int, float))
    assert first["rank"] >= 0.0
    assert first["title"] == "Federated Learning for Genomics"


def test_search_pagination_returns_page_metadata(
    authorised_editor_client, db_session, test_author, test_journal
):
    """A second-page request should echo the page/page_size back verbatim."""
    _seed_article(
        db_session,
        test_author.id,
        test_journal.id,
        title="Unique Term Zebrafish Alpha",
        abstract="Nothing to see here about zebrafish.",
        content="",
    )
    resp = authorised_editor_client.get(
        "/search/articles",
        params={"q": "zebrafish", "page": 2, "page_size": 3},
        headers={"Authorization": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 2
    assert body["page_size"] == 3
    # Only one article on page 1 — page 2 must be empty.
    assert body["items"] == []
