"""Tests for the ``/recovery-codes`` router.

Covers the shape and consume-once semantics of the 8 backup codes the
router exposes for the current user:

* generate returns 8 codes in the ``xxxx-xxxx-xxxx`` shape
* count reports 8 remaining after generation
* consuming a valid code marks it USED and count drops
* replaying the same code returns 401
* regenerate resets the pool to 8 fresh codes
"""

from __future__ import annotations

import os
import re

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping recovery-codes tests.",
)


_CODE_SHAPE = re.compile(r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")


def _generate(client):
    resp = client.post("/recovery-codes/generate")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_generate_returns_eight_correctly_shaped_codes(
    db_session, test_author, authorised_author_client
):
    body = _generate(authorised_author_client)
    codes = body["codes"]
    assert isinstance(codes, list)
    assert len(codes) == 8
    for c in codes:
        assert _CODE_SHAPE.match(c), f"bad shape: {c!r}"


def test_count_reports_eight_remaining_after_generate(
    db_session, test_author, authorised_author_client
):
    _generate(authorised_author_client)
    resp = authorised_author_client.get("/recovery-codes/count")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"total": 8, "remaining": 8}


def test_consume_valid_code_marks_it_used_and_drops_count(
    db_session, test_author, authorised_author_client
):
    body = _generate(authorised_author_client)
    first_code = body["codes"][0]

    resp = authorised_author_client.post(
        "/recovery-codes/consume", json={"code": first_code}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json().get("ok") is True

    resp2 = authorised_author_client.get("/recovery-codes/count")
    assert resp2.status_code == 200
    assert resp2.json()["remaining"] == 7


def test_consume_same_code_twice_second_attempt_returns_401(
    db_session, test_author, authorised_author_client
):
    body = _generate(authorised_author_client)
    code = body["codes"][2]

    ok1 = authorised_author_client.post(
        "/recovery-codes/consume", json={"code": code}
    )
    assert ok1.status_code == 200

    ok2 = authorised_author_client.post(
        "/recovery-codes/consume", json={"code": code}
    )
    assert ok2.status_code == 401


def test_generate_again_resets_pool_to_eight_fresh_codes(
    db_session, test_author, authorised_author_client
):
    first = _generate(authorised_author_client)
    # Consume one so we can prove the second generate resets rather
    # than merely appends.
    authorised_author_client.post(
        "/recovery-codes/consume", json={"code": first["codes"][0]}
    )
    second = _generate(authorised_author_client)

    assert len(second["codes"]) == 8
    # The two sets are cryptographically fresh; overlap is astronomically
    # unlikely but we only assert the count contract.
    resp = authorised_author_client.get("/recovery-codes/count")
    assert resp.status_code == 200
    assert resp.json() == {"total": 8, "remaining": 8}

    # And the code that was consumed against the OLD set is no longer a
    # valid input against the new set.
    replay = authorised_author_client.post(
        "/recovery-codes/consume", json={"code": first["codes"][0]}
    )
    assert replay.status_code == 401
