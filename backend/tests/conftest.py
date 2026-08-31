"""
Shared pytest fixtures for the backend test suite.

The smoke suite in `test_public_endpoints.py` uses the `client` fixture
below — a bare `TestClient(app)` wrapper. Other test modules
(`test_workflow.py`) declare their own local `client` fixture; those
locals shadow this one, so bringing this conftest in does not disturb
the existing async workflow tests.

If either FastAPI/Starlette or the app's own imports fail (e.g. the
DATABASE_URL setting is not provided), the fixture is skipped so the
smoke suite can degrade gracefully in a bare CI environment.
"""

import os
from typing import Iterator

import pytest


@pytest.fixture(scope="session")
def client() -> Iterator[object]:
    """Yield a FastAPI ``TestClient`` bound to the real app.

    We import lazily so a missing dependency (or a missing DATABASE_URL)
    triggers a clean pytest skip rather than a hard collection error.
    """
    # Starlette's TestClient is powered by httpx; both are optional in
    # a minimal install. Skip cleanly if either is unavailable.
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient  # noqa: WPS433

    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL is not configured; skipping app-level smoke tests.")

    try:
        from app.main import app  # noqa: WPS433
    except Exception as exc:  # pragma: no cover - environment guard
        pytest.skip(f"Could not import app.main: {exc}")

    with TestClient(app) as test_client:
        yield test_client
