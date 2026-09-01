"""Integration tests for the public password-reset router.

Covers the router shipped in ``app/routers/password_reset.py``:

* enumeration-safe 202 for unknown emails
* 202 + a stored ``password_reset_token_hash`` for known active users
* invalid / expired token rejection
* successful rotation clears the reset columns and re-authenticates
  against the new password

Every DB-touching case is gated on ``TEST_DATABASE_URL`` so the suite
degrades cleanly on a bare CI checkout.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping password-reset tests.",
)


# ── /password-reset/request ───────────────────────────────


def test_request_unknown_email_returns_202_no_enumeration(
    db_session, authorised_author_client
):
    """Unknown email must return the same 202 as a known one."""
    resp = authorised_author_client.post(
        "/password-reset/request",
        json={"email": "nobody-here-at-all@example.invalid"},
    )
    assert resp.status_code == 202
    body = resp.json()
    # The response body is enumeration-safe: neutral copy, no hint of a
    # missing user.
    assert "message" in body
    assert "if an account exists" in body["message"].lower()


def test_request_existing_email_stores_reset_token_hash(
    db_session, test_author, authorised_author_client
):
    """A hit path stamps the user row with a bcrypt reset-token hash."""
    from app.models.user import User

    # Clear any leftover state from a previous run.
    test_author.password_reset_token_hash = None
    test_author.password_reset_expires_at = None
    db_session.commit()

    # SendGrid is patched so we don't try to hit the network. The endpoint
    # deliberately swallows send errors — we only care that it stored the
    # hash regardless.
    with patch(
        "app.routers.password_reset._send_reset_email", return_value=True
    ) as send_mock:
        resp = authorised_author_client.post(
            "/password-reset/request",
            json={"email": test_author.email},
        )

    assert resp.status_code == 202
    assert send_mock.called

    db_session.expire_all()
    fresh = db_session.query(User).filter(User.id == test_author.id).first()
    assert fresh.password_reset_token_hash, "hash should be set on hit path"
    assert fresh.password_reset_expires_at is not None


# ── /password-reset/verify ────────────────────────────────


def test_verify_wrong_token_returns_401_or_400(
    db_session, test_author, authorised_author_client
):
    """Wrong token → generic rejection (implementation returns 400)."""
    from app.routers.password_reset import _mint_reset_token
    from app.utils.helpers import hash_password

    # Set up a legitimate reset row so the not-found path can't short-circuit.
    real_token = _mint_reset_token(test_author.id)
    test_author.password_reset_token_hash = hash_password(real_token)
    test_author.password_reset_expires_at = datetime.utcnow() + timedelta(
        minutes=30
    )
    db_session.commit()

    bogus_token = _mint_reset_token(test_author.id)  # different signed token
    resp = authorised_author_client.post(
        "/password-reset/verify",
        json={"token": bogus_token, "new_password": "brand-new-p4ss"},
    )
    # Router uses 400 as the generic; brief allows either 401 or 400.
    assert resp.status_code in (400, 401)


def test_verify_correct_token_rotates_password_and_clears_reset(
    db_session, test_author, authorised_author_client
):
    """Happy path: password rotates, reset columns are cleared."""
    from app.models.user import User
    from app.routers.password_reset import _mint_reset_token
    from app.utils.helpers import hash_password, verify_password

    token = _mint_reset_token(test_author.id)
    test_author.password_reset_token_hash = hash_password(token)
    test_author.password_reset_expires_at = datetime.utcnow() + timedelta(
        minutes=30
    )
    db_session.commit()

    new_password = "chosen-fresh-secret-9!"
    resp = authorised_author_client.post(
        "/password-reset/verify",
        json={"token": token, "new_password": new_password},
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True

    db_session.expire_all()
    fresh = db_session.query(User).filter(User.id == test_author.id).first()
    assert fresh.password_reset_token_hash is None
    assert fresh.password_reset_expires_at is None
    assert verify_password(new_password, fresh.hashed_password)


def test_verify_after_expiry_returns_generic_error(
    db_session, test_author, authorised_author_client
):
    """A token whose window has passed is rejected with the generic error."""
    from app.routers.password_reset import _mint_reset_token
    from app.utils.helpers import hash_password

    token = _mint_reset_token(test_author.id)
    test_author.password_reset_token_hash = hash_password(token)
    # Explicit past expiry — 31 min ago is safely outside the 30-min TTL.
    test_author.password_reset_expires_at = datetime.utcnow() - timedelta(
        minutes=31
    )
    db_session.commit()

    resp = authorised_author_client.post(
        "/password-reset/verify",
        json={"token": token, "new_password": "another-new-p4ss"},
    )
    assert resp.status_code in (400, 401)
