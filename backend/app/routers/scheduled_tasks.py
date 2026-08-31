"""
Admin endpoint for the time-triggered maintenance run.

External schedulers (GitHub Actions in this repo, cron-job.org, etc.) POST
to ``/scheduled-tasks/run`` with an ``X-Scheduled-Tasks-Secret`` header that
must match the ``SCHEDULED_TASKS_SECRET`` environment variable. If the
secret is unset or the header does not match, the endpoint answers 401.

Editors do not authenticate through this route — it is a machine-only
entry point, on purpose. Its whole surface area is a single POST guarded
by a single shared secret, so it fits the free-tier constraint that we
cannot run a background worker of our own.

See ``backend/scripts/run_scheduled_tasks.py`` for the tasks themselves.
"""

from __future__ import annotations

import importlib.util
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, status

logger = logging.getLogger(__name__)


def _load_run_scheduled_tasks_main() -> Callable[[], Dict[str, Any]]:
    """Load ``scripts/run_scheduled_tasks.main`` by file path.

    The script lives outside the ``app`` package (in ``backend/scripts/``,
    which is not itself a package), so we resolve it directly rather than
    depending on Python's package search finding it. Cached at first call.
    """
    script_path = (
        Path(__file__).resolve().parent.parent.parent / "scripts" / "run_scheduled_tasks.py"
    )
    spec = importlib.util.spec_from_file_location(
        "backend_scheduled_tasks_script", str(script_path)
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load scheduled tasks script at {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.main


_run_scheduled_tasks_main: Optional[Callable[[], Dict[str, Any]]] = None

router = APIRouter()


@router.post("/run")
def run_scheduled_tasks(
    x_scheduled_tasks_secret: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Run every scheduled task once and return the JSON summary.

    The header name from the client side is ``X-Scheduled-Tasks-Secret``;
    FastAPI converts hyphens to underscores when populating the parameter.
    """
    expected = os.getenv("SCHEDULED_TASKS_SECRET", "").strip()
    if not expected or not x_scheduled_tasks_secret or x_scheduled_tasks_secret != expected:
        # We intentionally don't distinguish "no secret configured" from
        # "bad secret" in the response — an unconfigured endpoint should
        # not leak that it is unconfigured.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
        )

    global _run_scheduled_tasks_main
    try:
        if _run_scheduled_tasks_main is None:
            _run_scheduled_tasks_main = _load_run_scheduled_tasks_main()
        return _run_scheduled_tasks_main()
    except Exception:
        logger.exception("scheduled-tasks run failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scheduled tasks failed",
        )
