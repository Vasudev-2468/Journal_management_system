"""Optional structured-JSON logging.

Behaviour is toggled by the ``JSON_LOGS`` environment variable:

* ``JSON_LOGS=1``  — install a formatter that emits one JSON object
  per log record on stdout. Fields: ``ts, level, name, msg, path,
  request_id`` (last two are included only when the log record
  carries them via ``extra=``).
* Anything else (unset, ``"0"``, ``""``) — leave logging alone.
  Uvicorn's default human-readable formatter continues to work.

``configure_logging()`` is idempotent — calling it a second time
detaches the formatter it installed before re-installing, so a hot
reload during development doesn't stack duplicate handlers.

Import-time note
----------------
The module calls ``configure_logging()`` at bottom of file so simply
importing it is enough. ``main.py`` can either import the module
(for its side effect) or call the function explicitly — both work.
No new pip dependency is needed; ``json`` is stdlib.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone

# Marker attribute we stamp on any handler we install, so a subsequent
# ``configure_logging()`` call can find and replace its own previous
# handler without disturbing handlers other code may have added.
_HANDLER_MARK = "_jgair_json_handler"


class JsonFormatter(logging.Formatter):
    """Format a ``LogRecord`` as a single-line JSON object.

    We DO NOT use ``logging.Formatter.format`` — the parent class runs
    a ``%``-format pass on ``msg`` that would break when the message
    contains stray ``%`` characters (JSON payloads, URL-encoded query
    strings). Building the dict directly is both cheaper and safer.
    """

    # Standard ``LogRecord`` attributes we DON'T want to spill into
    # ``extra`` when we walk ``__dict__`` for user-added fields.
    _RESERVED = frozenset({
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "message",
        "asctime", "taskName",
    })

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003 — matches base
        # ISO-8601 with a trailing ``Z`` reads better than the default
        # ``2024-01-01T00:00:00+00:00`` in log aggregators.
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat().replace("+00:00", "Z")

        payload: dict[str, object] = {
            "ts": ts,
            "level": record.levelname,
            "name": record.name,
            "msg": record.getMessage(),
        }

        # Optional structured fields — only emit when present so a
        # log line without a request context stays compact.
        path = getattr(record, "path", None)
        if path is not None:
            payload["path"] = path
        request_id = getattr(record, "request_id", None)
        if request_id is not None:
            payload["request_id"] = request_id

        # Preserve any additional ``extra={}`` fields the caller set.
        for key, value in record.__dict__.items():
            if key in self._RESERVED or key in payload or key.startswith("_"):
                continue
            try:
                json.dumps(value)  # cheap serialisability probe
            except (TypeError, ValueError):
                value = repr(value)
            payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, separators=(",", ":"), default=str)


def configure_logging() -> None:
    """Idempotent: install (or remove) the JSON handler on the root logger.

    ``JSON_LOGS=1`` → install a stdout JSON handler.
    Anything else  → leave existing handlers alone.

    We only ever touch handlers stamped with ``_HANDLER_MARK``, so
    third-party handlers (uvicorn access log, sentry, etc.) stay put.
    """
    root = logging.getLogger()

    # Drop any handler we installed on a previous call so we don't
    # stack duplicates during a hot reload.
    for h in list(root.handlers):
        if getattr(h, _HANDLER_MARK, False):
            root.removeHandler(h)

    if os.getenv("JSON_LOGS", "0") != "1":
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    setattr(handler, _HANDLER_MARK, True)
    root.addHandler(handler)
    # Only bump the level if the caller hasn't set something more
    # verbose — we want DEBUG runs to keep their verbosity.
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)


# Fire at import time so ``import app.utils.logging_config`` alone
# is enough to activate JSON logging when the env var is set.
configure_logging()
