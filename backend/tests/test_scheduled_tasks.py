"""Tests for the header-guarded ``/scheduled-tasks/run`` endpoint.

The endpoint accepts machine-only calls carrying an
``X-Scheduled-Tasks-Secret`` header. Missing or wrong secrets → 401.
A matching secret runs the maintenance body — we patch the script
loader so the test doesn't actually poke database rows.

The router itself does not require a database session, so the tests do
not depend on ``TEST_DATABASE_URL``. They do still need FastAPI to
import cleanly, which is why we gate on ``DATABASE_URL`` (the setting
Loader wants) via ``TestClient``.
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping scheduled-tasks tests.",
)


def _client():
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def test_run_without_header_returns_401(monkeypatch):
    monkeypatch.setenv("SCHEDULED_TASKS_SECRET", "correct-horse-battery-staple")
    client = _client()
    resp = client.post("/scheduled-tasks/run")
    assert resp.status_code == 401


def test_run_with_wrong_secret_returns_401(monkeypatch):
    monkeypatch.setenv("SCHEDULED_TASKS_SECRET", "correct-horse-battery-staple")
    client = _client()
    resp = client.post(
        "/scheduled-tasks/run",
        headers={"X-Scheduled-Tasks-Secret": "wrong-value"},
    )
    assert resp.status_code == 401


def test_run_with_correct_secret_returns_summary(monkeypatch):
    monkeypatch.setenv("SCHEDULED_TASKS_SECRET", "correct-horse-battery-staple")

    fake_summary = {
        "reminders_sent": 0,
        "links_expired": 0,
        "proof_nudges": 0,
        "sessions_deleted": 0,
        "duration_ms": 1,
    }

    # Reset the module-level cache and replace the loader so the router
    # never actually tries to reach the maintenance script.
    import app.routers.scheduled_tasks as st

    monkeypatch.setattr(st, "_run_scheduled_tasks_main", None)
    monkeypatch.setattr(
        st, "_load_run_scheduled_tasks_main", lambda: (lambda: fake_summary)
    )

    client = _client()
    resp = client.post(
        "/scheduled-tasks/run",
        headers={"X-Scheduled-Tasks-Secret": "correct-horse-battery-staple"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, dict)
    assert body == fake_summary
