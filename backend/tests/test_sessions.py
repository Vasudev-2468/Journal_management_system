"""Tests for the ``/sessions`` router.

The ``authorised_author_client`` fixture already carries a signed JWT. As
soon as it hits any authenticated route once, ``get_current_user`` stamps
a matching ``user_sessions`` row via ``_touch_session`` — that's the
scaffolding these tests lean on.

Covers:

* ``GET /sessions/mine`` returns at least one row after login
* exactly one row has ``is_current=true`` (the caller's own session)
* revoking the current session without ``?force=true`` refuses
* ``POST /sessions/revoke-others`` is a no-op when the caller has no
  other live sessions
* after revoking, subsequent requests using that token get 401
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping sessions tests.",
)


def _prime_session(client):
    """Make one authenticated request so the ``user_sessions`` row exists."""
    resp = client.get("/sessions/mine")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_mine_returns_row_after_login(db_session, authorised_author_client):
    rows = _prime_session(authorised_author_client)
    assert isinstance(rows, list)
    assert len(rows) >= 1


def test_exactly_one_row_is_flagged_current(
    db_session, authorised_author_client
):
    rows = _prime_session(authorised_author_client)
    current_flags = [r for r in rows if r["is_current"]]
    assert len(current_flags) == 1


def test_revoke_current_without_force_is_refused(
    db_session, authorised_author_client
):
    rows = _prime_session(authorised_author_client)
    current = next(r for r in rows if r["is_current"])
    resp = authorised_author_client.post(
        f"/sessions/{current['id']}/revoke"
    )
    # Router returns 400 as the "refuse to lock yourself out" guard. Some
    # deployments may translate that into a 422 — accept either.
    assert resp.status_code in (400, 422)


def test_revoke_others_when_only_current_exists_is_noop(
    db_session, authorised_author_client
):
    _prime_session(authorised_author_client)
    resp = authorised_author_client.post("/sessions/revoke-others")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("ok") is True
    assert body.get("revoked") == 0


def test_revoked_session_token_is_rejected_on_next_request(
    db_session, test_author
):
    """A hard-revoked row must turn subsequent calls into 401."""
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.main import app
    from app.models.user_session import UserSession
    from app.services.auth_service import create_access_token

    # Mint a brand-new session token so revoking it doesn't tear down
    # any other fixture-owned client.
    token = create_access_token(
        data={"sub": test_author.email, "scope": "session"}
    )

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    try:
        client = TestClient(app)
        client.headers.update({"Authorization": f"Bearer {token}"})
        # First call — creates the session row.
        first = client.get("/sessions/mine")
        assert first.status_code == 200, first.text

        # Hard-revoke that row directly against the DB, then re-issue.
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        row = (
            db_session.query(UserSession)
            .filter(UserSession.token_hash == token_hash)
            .first()
        )
        assert row is not None
        row.revoked_at = datetime.utcnow()
        db_session.commit()

        second = client.get("/sessions/mine")
        assert second.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
