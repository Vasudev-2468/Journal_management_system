"""
Free-tier shim for Celery tasks.

Celery is not available on the target free hosting tier (Render/Vercel/CF Pages
don't run background workers), so this module provides a drop-in replacement
that fires each task on a daemon thread.

Every router that previously called `task.delay(...)` continues to work without
changes.  To switch back to real Celery later, replace `InlineTask(fn)` with
`celery_app.task(...)` decorators.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Callable

logger = logging.getLogger(__name__)


class InlineTask:
    """Wrap a callable so it exposes Celery's `.delay()` / `.apply_async()`.

    On `.delay()` the wrapped function runs on a fire-and-forget daemon
    thread — the caller returns immediately, mirroring Celery's behaviour.
    Exceptions inside the thread are logged, not re-raised.
    """

    def __init__(self, fn: Callable[..., Any]):
        self.fn = fn
        self.__name__ = getattr(fn, "__name__", "inline_task")

    def _safe_run(self, *args: Any, **kwargs: Any) -> None:
        try:
            self.fn(*args, **kwargs)
        except Exception:
            logger.exception("Inline task %s raised", self.__name__)

    def delay(self, *args: Any, **kwargs: Any) -> None:
        threading.Thread(
            target=self._safe_run,
            args=args,
            kwargs=kwargs,
            daemon=True,
            name=f"inline-{self.__name__}",
        ).start()

    def apply_async(
        self,
        args: tuple[Any, ...] | None = None,
        kwargs: dict[str, Any] | None = None,
    ) -> None:
        self.delay(*(args or ()), **(kwargs or {}))

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """Synchronous call.  Useful in tests and inline flows."""
        return self.fn(*args, **kwargs)
