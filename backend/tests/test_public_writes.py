"""Integration tests for the recently-added write endpoints.

Uses the ``authorised_editor_client`` / ``authorised_author_client``
fixtures from ``conftest.py``. Every test in this module is skipped
when ``TEST_DATABASE_URL`` is not configured (via the fixture chain).

Covers:
  - Public contact submission
  - Editor CRUD on announcements, board members, special issues
  - Author-authored article reviews
  - RSS / Atom / KBART feeds
  - Generated PDF for an article
  - Reviewer-invite decline guard against a bogus token
"""

from __future__ import annotations

import os
import uuid

import pytest


pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not set; skipping public-write integration tests.",
)


# ═══════════════════════════════════════════════════════════
# Public /contact/ — anyone may POST
# ═══════════════════════════════════════════════════════════


def test_contact_submit_creates_message(authorised_editor_client, db_session):
    # ``authorised_editor_client`` only needed here to force the DB
    # dependency override to be installed; the POST itself is public.
    resp = authorised_editor_client.post(
        "/contact/",
        headers={"Authorization": ""},  # blank auth — endpoint is public
        json={
            "name": "Public Visitor",
            "email": "visitor@example.com",
            "subject": "General enquiry",
            "message": "Hello, I have a question about a paper.",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "visitor@example.com"
    assert body["name"] == "Public Visitor"

    from app.models.contact_message import ContactMessage

    row = (
        db_session.query(ContactMessage)
        .filter(ContactMessage.email == "visitor@example.com")
        .order_by(ContactMessage.id.desc())
        .first()
    )
    assert row is not None
    assert row.subject == "General enquiry"


def test_contact_submit_rejects_missing_fields(authorised_editor_client):
    resp = authorised_editor_client.post(
        "/contact/",
        headers={"Authorization": ""},
        json={"name": "n", "email": "not-an-email", "subject": "s", "message": "short"},
    )
    # Pydantic invalidates message min_length AND email format.
    assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════
# Editor-only /announcements/ POST
# ═══════════════════════════════════════════════════════════


def test_announcement_create_returns_201(authorised_editor_client):
    payload = {
        "title": "Call for Papers - Special Issue",
        "body": "Details of the CfP go here.",
        "kind": "cfp",
        "is_published": True,
    }
    resp = authorised_editor_client.post("/announcements/", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == payload["title"]
    assert body["kind"] == "cfp"
    assert "id" in body


def test_announcement_create_rejects_bad_kind(authorised_editor_client):
    resp = authorised_editor_client.post(
        "/announcements/",
        json={"title": "T", "body": "B", "kind": "invalid", "is_published": True},
    )
    assert resp.status_code == 422


def test_announcement_create_requires_auth(authorised_editor_client):
    resp = authorised_editor_client.post(
        "/announcements/",
        headers={"Authorization": ""},
        json={"title": "T", "body": "B", "kind": "news"},
    )
    assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════
# Editor-only /board/ POST + roundtrip
# ═══════════════════════════════════════════════════════════


def test_board_create_and_roundtrip(authorised_editor_client):
    unique_name = f"Board Member {uuid.uuid4().hex[:6]}"
    payload = {
        "name": unique_name,
        "role": "Section Editor - Generative AI",
        "category": "section_editor",
        "affiliation": "Test Uni",
        "country": "US",
        "is_active": True,
    }
    resp = authorised_editor_client.post("/board/", json=payload)
    assert resp.status_code == 201, resp.text
    created = resp.json()
    member_id = created["id"]

    # Roundtrip GET (public) - the item should appear.
    resp2 = authorised_editor_client.get(f"/board/{member_id}")
    assert resp2.status_code == 200
    fetched = resp2.json()
    assert fetched["name"] == unique_name
    assert fetched["category"] == "section_editor"


# ═══════════════════════════════════════════════════════════
# Author-only /article-reviews/ POST
# ═══════════════════════════════════════════════════════════


def _seed_article(db_session, author_id, journal_id):
    from app.models.article import Article

    a = Article(
        title="A Test Article",
        abstract="This is a test abstract for a fixture article.",
        content="Body content that a search vector could index later.",
        author_id=author_id,
        journal_id=journal_id,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


def test_article_review_create_returns_201(
    authorised_author_client, db_session, test_author, test_journal
):
    article = _seed_article(db_session, test_author.id, test_journal.id)

    payload = {
        "article_id": article.id,
        "title": "Well argued and worth reading",
        "content": (
            "The paper makes a solid case for its central claim, and the "
            "methodology is transparent. Recommended reading."
        ),
        "rating": 5,
    }
    resp = authorised_author_client.post("/article-reviews/", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["article_id"] == article.id
    assert body["rating"] == 5
    assert body["reviewer_id"] == test_author.id


def test_article_review_rejects_unknown_article(authorised_author_client):
    resp = authorised_author_client.post(
        "/article-reviews/",
        json={
            "article_id": 999_999,
            "title": "This should fail",
            "content": "This will not be persisted anywhere at all.",
            "rating": 3,
        },
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════
# Editor-only /special-issues/ POST
# ═══════════════════════════════════════════════════════════


def test_special_issue_create_returns_201(authorised_editor_client):
    slug = f"si-{uuid.uuid4().hex[:8]}"
    payload = {
        "slug": slug,
        "title": "A themed special issue",
        "description": "About things.",
        "status": "open",
        "is_published": True,
    }
    resp = authorised_editor_client.post("/special-issues/", json=payload)
    assert resp.status_code == 201, resp.text
    assert resp.json()["slug"] == slug


def test_special_issue_duplicate_slug_conflicts(authorised_editor_client):
    slug = f"si-dup-{uuid.uuid4().hex[:6]}"
    payload = {
        "slug": slug,
        "title": "Once",
        "description": "First time.",
    }
    r1 = authorised_editor_client.post("/special-issues/", json=payload)
    assert r1.status_code == 201
    r2 = authorised_editor_client.post("/special-issues/", json=payload)
    assert r2.status_code == 409


# ═══════════════════════════════════════════════════════════
# Public feeds
# ═══════════════════════════════════════════════════════════


def test_rss_feed_returns_valid_rss(authorised_editor_client):
    resp = authorised_editor_client.get("/rss.xml", headers={"Authorization": ""})
    assert resp.status_code == 200
    assert "<rss" in resp.text
    assert resp.headers["content-type"].startswith("application/rss+xml")


def test_atom_feed_returns_valid_atom(authorised_editor_client):
    resp = authorised_editor_client.get("/atom.xml", headers={"Authorization": ""})
    assert resp.status_code == 200
    assert "<feed" in resp.text
    assert resp.headers["content-type"].startswith("application/atom+xml")


def test_kbart_returns_header_row(authorised_editor_client, test_journal):
    resp = authorised_editor_client.get("/kbart.txt", headers={"Authorization": ""})
    assert resp.status_code == 200
    first_line = resp.text.splitlines()[0]
    assert first_line.startswith("publication_title")
    # Tab-separated per KBART.
    assert "\t" in first_line
    assert resp.headers["content-type"].startswith("text/tab-separated-values")


# ═══════════════════════════════════════════════════════════
# Generated per-article PDF
# ═══════════════════════════════════════════════════════════


def test_generated_pdf_for_article(
    authorised_editor_client, db_session, test_author, test_journal
):
    article = _seed_article(db_session, test_author.id, test_journal.id)
    resp = authorised_editor_client.get(
        f"/articles/{article.id}/generated.pdf",
        headers={"Authorization": ""},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.content[:5] == b"%PDF-"


def test_generated_pdf_404_for_unknown_article(authorised_editor_client):
    resp = authorised_editor_client.get(
        "/articles/9999999/generated.pdf",
        headers={"Authorization": ""},
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════
# Reviewer-invite decline guard
# ═══════════════════════════════════════════════════════════


def test_reviewer_invite_decline_rejects_bogus_token(authorised_editor_client):
    """A fabricated token has no matching Review row — the guard must
    fire with a 401/404 before any state is written."""
    fake_token = "totally-not-a-real-jwt-abcdefg"
    resp = authorised_editor_client.post(
        f"/reviewer-invite/{fake_token}/decline",
        headers={"Authorization": ""},
        json={"reason": "not my area"},
    )
    assert resp.status_code in (401, 404), resp.text
