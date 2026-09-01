"""Tests for the self-serve ``/gdpr`` router.

* export returns 200 with a JSON body carrying the expected top-level
  keys and never leaks credential columns
* delete-my-account rejects a wrong ``confirm_email`` with 422
* the happy delete path anonymises the row and revokes the caller's
  session so subsequent ``/author-auth/me`` calls return 401
"""

from __future__ import annotations

import os

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping gdpr tests.",
)


def test_my_data_export_returns_expected_shape_and_no_secrets(
    db_session, test_author, authorised_author_client
):
    resp = authorised_author_client.get("/gdpr/my-data-export")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("content-type", "").startswith("application/json")

    body = resp.json()
    assert isinstance(body, dict)
    for key in ("user", "submissions", "articles", "article_reviews", "sessions"):
        assert key in body, f"missing key {key!r}"

    forbidden = {
        "password_hash",
        "hashed_password",
        "mfa_otp_hash",
        "recovery_codes_hashes",
        "totp_secret",
        "password_reset_token_hash",
    }
    user_row = body["user"]
    assert isinstance(user_row, dict)
    leaked = forbidden.intersection(user_row.keys())
    assert not leaked, f"export leaked credential columns: {leaked}"


def test_delete_account_wrong_confirm_email_returns_422(
    db_session, test_author, authorised_author_client
):
    resp = authorised_author_client.post(
        "/gdpr/delete-my-account",
        json={"confirm_email": "definitely-not-my-email@example.invalid"},
    )
    assert resp.status_code == 422


def test_delete_account_anonymises_and_locks_out_subsequent_me(
    db_session, test_author
):
    """The full delete flow — mint a fully-verified token, delete, and
    prove ``/author-auth/me`` no longer accepts the same token."""
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.main import app
    from app.models.user import User
    from app.services.auth_service import create_access_token

    # We need a token /author-auth/me will accept, so mint one with the
    # full-verified claim the author-auth guard demands.
    token = create_access_token(
        data={
            "sub": test_author.email,
            "scope": "session",
            "author_mfa": "fully_verified",
        }
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

        # /author-auth/me must work before the delete so we're sure the
        # 401-after-delete assertion is meaningful.
        pre = client.get("/author-auth/me")
        assert pre.status_code == 200, pre.text

        original_email = test_author.email
        resp = client.post(
            "/gdpr/delete-my-account",
            json={"confirm_email": original_email},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ok") is True

        db_session.expire_all()
        fresh = (
            db_session.query(User).filter(User.id == test_author.id).first()
        )
        assert fresh is not None
        assert fresh.email.startswith("deleted-user-")
        assert fresh.is_active is False

        # The old token is now attached to an inactive user — /me refuses.
        post = client.get("/author-auth/me")
        assert post.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
