"""System health, liveness, and readiness endpoints.

Three routes, all under ``/system`` so the legacy ``/health`` defined in
``main.py`` keeps working until the wire-up swap:

* ``GET /system/health``
    Full health snapshot. Runs ``SELECT 1`` against the primary database
    with a bounded timeout, reports uptime since process start, exposes
    version metadata (app name, git commit from the ``GIT_COMMIT`` env,
    Python runtime). ALWAYS returns HTTP 200 — orchestrators poll it
    for information, not to gate traffic. When the DB probe fails,
    ``status`` flips to ``'degraded'`` and ``checks.database`` carries
    the exception message.

* ``GET /system/health/live``
    Liveness probe. No dependencies — a process that can answer this
    is by definition still alive and hasn't wedged. Kubernetes and the
    Railway healthcheck use this one.

* ``GET /system/health/ready``
    Readiness probe. Runs the same DB check as ``/system/health`` but
    returns HTTP 503 when the check fails, so a load balancer can pull
    the pod out of rotation until the database is reachable again.

The DB probe is intentionally minimal — ``SELECT 1`` is the cheapest
statement Postgres can serve and gives us a real end-to-end signal
(connection pool + driver + network + server) rather than a mock.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system", tags=["system"])

# Process start time, captured at import. Uptime is measured against this
# and NOT against ``datetime.now()`` at request time — the wall clock can
# jump (NTP adjustments, container clock skew) but ``time.monotonic()``
# is guaranteed to move forward, which is what "how long has this
# process been alive" actually means.
_PROCESS_START_MONOTONIC = time.monotonic()

_APP_NAME = "jgair"


def _db_check(db: Session) -> tuple[str, str | None]:
    """Return ``('ok', None)`` when SELECT 1 succeeds, else ``('error', msg)``.

    Every exception is caught — a health endpoint that raises is worse
    than useless because the caller sees a 500 with no signal at all
    about what actually failed. We swallow and report instead.
    """
    try:
        db.execute(text("SELECT 1"))
        return "ok", None
    except Exception as exc:  # pragma: no cover — probed in tests via monkeypatch
        # Log at WARNING — a failing health check is worth surfacing in
        # the logs even though we return 200 on the info endpoint.
        logger.warning("system_health db probe failed: %s", exc)
        return "error", str(exc)


def _payload(db_status: str, db_error: str | None) -> dict:
    """Assemble the JSON response body shared by /health and /health/ready."""
    now = datetime.now(timezone.utc)
    uptime = max(0.0, time.monotonic() - _PROCESS_START_MONOTONIC)
    checks: dict[str, str] = {"database": db_status}
    if db_error is not None:
        # Surface the error message alongside the flag so an operator
        # doesn't have to cross-reference application logs to diagnose.
        checks["database_error"] = db_error
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "timestamp": now.isoformat(),
        "uptime_seconds": round(uptime, 3),
        "version": {
            "app": _APP_NAME,
            "commit": os.getenv("GIT_COMMIT", "unknown"),
            "python": sys.version.split()[0],
        },
        "checks": checks,
    }


@router.get("/health")
def system_health(db: Session = Depends(get_db)) -> dict:
    """Enhanced health snapshot — always HTTP 200, includes DB probe."""
    db_status, db_error = _db_check(db)
    return _payload(db_status, db_error)


@router.get("/health/live")
def system_health_live() -> dict:
    """Liveness probe — the process is alive if it can answer this."""
    return {"status": "ok"}


@router.get("/health/ready")
def system_health_ready(db: Session = Depends(get_db)):
    """Readiness probe — 503 when DB is unreachable so LBs can drain."""
    db_status, db_error = _db_check(db)
    body = _payload(db_status, db_error)
    if db_status != "ok":
        return JSONResponse(status_code=503, content=body)
    return body
