"""In-process Prometheus metrics collector.

A lightweight ASGI middleware that records three signals per HTTP
request and stores them in module-level dictionaries. The ``/metrics``
endpoint (see ``routers/system_metrics.py``) reads these dictionaries
and renders the Prometheus text exposition format on demand — no
scraping-side aggregation, no third-party client library required.

Signals recorded
----------------
* ``http_requests_total{method, path_prefix, status}`` — counter,
  incremented once per completed response.
* ``http_request_duration_seconds{method, path_prefix, status}`` —
  histogram bucketed at 5 ms → 10 s. Also emits ``_sum`` and ``_count``
  companions so quantile queries and rate() over count both work.
* ``http_requests_in_flight`` — gauge, ticked up when a request enters
  the middleware and back down in a ``finally`` (so a raised exception
  never leaves it stuck above zero).

Cardinality control
-------------------
We label by the FIRST path segment only (``/articles/123`` collapses to
``articles``) because Prometheus scales terribly when high-cardinality
labels leak in — every unique article id would explode into its own
time series and blow up both the collector's memory and the scrape
size. The one-segment bucket keeps the label set bounded by the number
of top-level routers (~50), which comfortably fits a single-process
in-memory store on a free-tier deployment.

Single-process only
-------------------
No shared memory, no atomics — this only works when one process owns
the counters. That matches the current deployment (single uvicorn
worker on Railway). If we ever fan out to multiple workers, this file
needs to be replaced with either ``prometheus_client``'s multiprocess
mode or a redis-backed shim. The comment stays here as a landmine.

Recording failures
------------------
Any exception raised while recording a data point is swallowed. The
middleware's job is to serve the request; a broken counter must never
turn a successful response into a 500.
"""

from __future__ import annotations

import time
from typing import Awaitable, Callable

# ---- Metric stores ------------------------------------------------------
#
# Public module attributes so ``routers/system_metrics.py`` can walk
# them directly. Both dicts key on the same ``(method, path_prefix,
# status)`` tuple so a rendering pass can zip them together.

# Counter: incremented once per completed response.
REQUESTS_TOTAL: dict[tuple[str, str, str], int] = {}

# Histogram state, per label tuple:
#   {"buckets": [cnt_le_0.005, cnt_le_0.01, ...], "sum": total_seconds, "count": n}
# The bucket list mirrors ``BUCKETS`` (below) index-for-index; the
# final bucket in the exposition format (``+Inf``) equals ``count``.
REQUEST_DURATION: dict[tuple[str, str, str], dict] = {}

# Gauge. Plain int updated in-place — a single-process assumption
# means we don't need an atomic.
IN_FLIGHT: int = 0

# Prometheus histogram bucket upper-bounds, in seconds. Anything past
# ``10`` lands in the implicit ``+Inf`` bucket at render time.
BUCKETS: tuple[float, ...] = (
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
)


def _path_prefix(path: str) -> str:
    """Collapse ``/articles/123/reviews`` to ``articles``.

    ``/`` → ``root`` so the label is never empty (Prometheus accepts
    empty label values but they look like a bug in scrape output).
    """
    stripped = path.lstrip("/")
    if not stripped:
        return "root"
    # First segment only. Slice by ``/`` — cheaper than ``split`` when
    # we throw away the tail anyway.
    slash = stripped.find("/")
    return stripped if slash == -1 else stripped[:slash]


def _record(method: str, path_prefix: str, status: str, elapsed: float) -> None:
    """Fold one completed request into the module counters.

    Wrapped in a broad try/except by the caller — a failure to record
    a data point is fine, but a raised exception in the response path
    is not.
    """
    key = (method, path_prefix, status)

    REQUESTS_TOTAL[key] = REQUESTS_TOTAL.get(key, 0) + 1

    hist = REQUEST_DURATION.get(key)
    if hist is None:
        hist = {"buckets": [0] * len(BUCKETS), "sum": 0.0, "count": 0}
        REQUEST_DURATION[key] = hist
    hist["sum"] += elapsed
    hist["count"] += 1
    # Cumulative buckets — a request in the 25 ms bucket ALSO increments
    # every larger bucket (that's how Prometheus histograms are defined).
    for i, upper in enumerate(BUCKETS):
        if elapsed <= upper:
            hist["buckets"][i] += 1


class PrometheusMetricsMiddleware:
    """Plain ASGI middleware — one class, one ``__call__``, no BaseHTTPMiddleware.

    We hook the ``send`` callable so we can capture the response status
    without having to buffer the whole response body (which
    ``BaseHTTPMiddleware`` does under the hood). That keeps latency
    overhead well below a millisecond on a hot path.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope: dict, receive: Callable[..., Awaitable], send: Callable[..., Awaitable]) -> None:
        # Pass non-HTTP traffic (websocket, lifespan) through untouched —
        # a metrics middleware that mangles lifespan events would
        # prevent the app from starting.
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        global IN_FLIGHT
        try:
            IN_FLIGHT += 1
        except Exception:  # pragma: no cover — defensive; int += 1 shouldn't fail
            pass

        method = scope.get("method", "GET")
        path = scope.get("path", "/")
        path_prefix = _path_prefix(path)
        status_holder = {"status": 500}
        start = time.perf_counter()

        async def send_wrapper(message: dict) -> None:
            # ``http.response.start`` is the ONLY ASGI message that
            # carries the final status code. Later ``http.response.body``
            # messages don't repeat it, so grab it here or lose it.
            if message.get("type") == "http.response.start":
                status_holder["status"] = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = time.perf_counter() - start
            try:
                _record(method, path_prefix, str(status_holder["status"]), elapsed)
            except Exception:
                # A broken counter must never bubble out into the
                # response path — swallow and move on.
                pass
            try:
                IN_FLIGHT -= 1
            except Exception:  # pragma: no cover
                pass
