"""
Shared pytest fixtures for the backend test suite.

Two independent fixture families live here:

1. ``client`` — the legacy smoke-test fixture. Wraps ``TestClient(app)``
   and skips when ``DATABASE_URL`` is missing. It preserves the shape the
   pre-existing ``test_public_endpoints.py`` module depends on.

2. ``db_session`` / ``test_journal`` / ``test_editor`` / ``test_author`` /
   ``authorised_editor_client`` / ``authorised_author_client`` — the new
   integration-test fixtures. They stand up a REAL SQLAlchemy schema on
   whatever database ``TEST_DATABASE_URL`` points at, override the app's
   ``get_db`` dependency with that connection, and hand the test a live
   ``TestClient`` already carrying a valid JWT.

   These fixtures **must** be pointed at a throw-away database — they
   ``Base.metadata.create_all`` once per test session and drop nothing.
   They are skipped when ``TEST_DATABASE_URL`` is unset so the suite
   still degrades cleanly in a bare CI environment.
"""

from __future__ import annotations

import os
from typing import Iterator

import pytest


# ═══════════════════════════════════════════════════════════
# Legacy smoke fixture — preserved unchanged
# ═══════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def client() -> Iterator[object]:
    """Yield a FastAPI ``TestClient`` bound to the real app.

    We import lazily so a missing dependency (or a missing DATABASE_URL)
    triggers a clean pytest skip rather than a hard collection error.
    """
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


# ═══════════════════════════════════════════════════════════
# Integration fixtures gated on TEST_DATABASE_URL
# ═══════════════════════════════════════════════════════════
#
# Every fixture below assumes it may write freely to the target DB. Point
# ``TEST_DATABASE_URL`` at a scratch instance — see
# ``docker-compose.test.yml`` at the repo root for a one-liner.


def _skip_unless_test_db() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set; skipping DB integration tests.")
    return url


@pytest.fixture(scope="session")
def _test_engine():
    """Create a SQLAlchemy engine + schema against ``TEST_DATABASE_URL``.

    Also makes sure ``DATABASE_URL`` is populated so ``app.config.Settings``
    can load even if the caller only exported ``TEST_DATABASE_URL``. The
    engine is shared across the whole test session; each ``db_session``
    reuses it inside its own SQLAlchemy Session.
    """
    url = _skip_unless_test_db()
    os.environ.setdefault("DATABASE_URL", url)
    os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")

    pytest.importorskip("sqlalchemy")
    from sqlalchemy import create_engine  # noqa: WPS433

    try:
        from app.database import Base  # noqa: WPS433
        import app.models  # noqa: F401,WPS433  -- register all mappers
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Could not import app models: {exc}")

    engine = create_engine(url, future=True)
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Could not create schema on TEST_DATABASE_URL: {exc}")

    yield engine

    # Deliberately do not drop_all — leaves the DB inspectable after a
    # failed test run. The scratch DB (docker-compose.test.yml) is
    # ephemeral anyway.
    engine.dispose()


@pytest.fixture()
def db_session(_test_engine):
    """A SQLAlchemy Session bound to the test engine.

    Rolls back on teardown so leaked writes from one test do not leak
    into the next. Tests that want a permanent commit (fixtures below)
    still call ``.commit()`` explicitly — the rollback is a floor, not a
    ceiling.
    """
    from sqlalchemy.orm import sessionmaker  # noqa: WPS433

    Session = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def test_journal(db_session):
    """A journal row usable as the target of article / issue fixtures."""
    from app.models.journal import Journal  # noqa: WPS433

    j = (
        db_session.query(Journal)
        .filter(Journal.title == "Test Journal")
        .first()
    )
    if j is None:
        j = Journal(
            title="Test Journal",
            description="Fixture-owned journal for the pytest suite.",
            licence="CC-BY-4.0",
            is_active=True,
            publisher_name="Test Publisher",
        )
        db_session.add(j)
        db_session.commit()
        db_session.refresh(j)
    return j


def _upsert_user(db_session, *, email, username, role):
    from app.models.user import User, UserRole  # noqa: WPS433
    from app.utils.helpers import hash_password  # noqa: WPS433

    existing = db_session.query(User).filter(User.email == email).first()
    if existing is not None:
        return existing
    u = User(
        username=username,
        email=email,
        full_name=f"Fixture {username}",
        hashed_password=hash_password("fixture-pass"),
        role=UserRole(role),
        is_active=True,
        mfa_enabled=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture()
def test_editor(db_session):
    """An editor row whose JWT will carry ``mfa_verified=True``."""
    return _upsert_user(
        db_session,
        email="fixture-editor@test.local",
        username="fixture_editor",
        role="editor",
    )


@pytest.fixture()
def test_author(db_session):
    """A plain author row for author-scoped endpoints."""
    return _upsert_user(
        db_session,
        email="fixture-author@test.local",
        username="fixture_author",
        role="author",
    )


def _make_test_client(db_session, token: str, *, extra_headers: dict | None = None):
    """Build a TestClient with ``get_db`` pinned to ``db_session``."""
    from fastapi.testclient import TestClient  # noqa: WPS433
    from app.main import app  # noqa: WPS433
    from app.database import get_db  # noqa: WPS433

    def _override_get_db():
        try:
            yield db_session
        finally:
            # The session is closed by the db_session fixture teardown;
            # do NOT close it here or later fixture uses would blow up.
            pass

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app)
    client.headers.update({"Authorization": f"Bearer {token}"})
    if extra_headers:
        client.headers.update(extra_headers)
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def authorised_editor_client(db_session, test_editor):
    """TestClient with an ``mfa_verified`` editor Bearer token.

    Also carries an ``X-Editor-MFA`` header. ``require_editor_mfa`` gates
    on the JWT claim, not the header, but downstream middleware and logs
    key on the header, so we mirror the real request shape.
    """
    from app.services.auth_service import create_access_token  # noqa: WPS433

    token = create_access_token(
        data={"sub": test_editor.email, "mfa_verified": True, "scope": "session"}
    )
    yield from _make_test_client(
        db_session,
        token,
        extra_headers={"X-Editor-MFA": "verified"},
    )


@pytest.fixture()
def authorised_author_client(db_session, test_author):
    """TestClient with a valid author Bearer token (no MFA claim needed)."""
    from app.services.auth_service import create_access_token  # noqa: WPS433

    token = create_access_token(
        data={"sub": test_author.email, "scope": "session"}
    )
    yield from _make_test_client(db_session, token)
