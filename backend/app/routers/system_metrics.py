"""Prometheus scrape endpoint.

Serves the counters populated by ``middleware.metrics`` in the
Prometheus text exposition format (v0.0.4). The endpoint is public —
Prometheus scrape jobs on Grafana Cloud / self-hosted don't send
credentials by default, and the payload is operational data (no PII).

We render the format by hand rather than pulling in ``prometheus_client``
because the observability upgrades are supposed to add zero new pip
dependencies. The format is well-defined and short — a few dozen lines
of string building — so hand-rolling it is fine.

Reference for the text format:
    https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.middleware import metrics as metrics_store

router = APIRouter(tags=["system"])

# Content-type Prometheus expects. Getting this wrong makes scrape
# targets look "up" but silently drop the sample.
_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"


def _escape_label(value: str) -> str:
    """Escape a label value per the exposition-format spec.

    Only ``\\``, ``"``, and newline need escaping. Path prefixes and
    HTTP methods should never contain these in practice, but a crafted
    URL like ``/"weird`` could — better to escape once here than to
    ship malformed metrics.
    """
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _fmt_labels(method: str, path_prefix: str, status: str, extra: str | None = None) -> str:
    parts = [
        f'method="{_escape_label(method)}"',
        f'path_prefix="{_escape_label(path_prefix)}"',
        f'status="{_escape_label(status)}"',
    ]
    if extra is not None:
        parts.append(extra)
    return "{" + ",".join(parts) + "}"


def _render() -> str:
    lines: list[str] = []

    # ---- http_requests_total ----------------------------------------
    lines.append("# HELP http_requests_total Total HTTP requests received, by method, first path segment, and status.")
    lines.append("# TYPE http_requests_total counter")
    # Sorting is not required by the format but stabilises diffs and
    # makes debug scrapes readable.
    for (method, path_prefix, status), count in sorted(metrics_store.REQUESTS_TOTAL.items()):
        labels = _fmt_labels(method, path_prefix, status)
        lines.append(f"http_requests_total{labels} {count}")

    # ---- http_request_duration_seconds ------------------------------
    lines.append("# HELP http_request_duration_seconds HTTP request latency in seconds.")
    lines.append("# TYPE http_request_duration_seconds histogram")
    for (method, path_prefix, status), hist in sorted(metrics_store.REQUEST_DURATION.items()):
        buckets = hist["buckets"]
        for i, upper in enumerate(metrics_store.BUCKETS):
            labels = _fmt_labels(method, path_prefix, status, f'le="{upper}"')
            lines.append(f"http_request_duration_seconds_bucket{labels} {buckets[i]}")
        # The +Inf bucket equals total count — a required part of the
        # histogram encoding, even when no request exceeded the last
        # explicit bucket.
        inf_labels = _fmt_labels(method, path_prefix, status, 'le="+Inf"')
        lines.append(f"http_request_duration_seconds_bucket{inf_labels} {hist['count']}")
        sum_labels = _fmt_labels(method, path_prefix, status)
        lines.append(f"http_request_duration_seconds_sum{sum_labels} {hist['sum']}")
        lines.append(f"http_request_duration_seconds_count{sum_labels} {hist['count']}")

    # ---- http_requests_in_flight ------------------------------------
    lines.append("# HELP http_requests_in_flight Number of HTTP requests currently being processed.")
    lines.append("# TYPE http_requests_in_flight gauge")
    lines.append(f"http_requests_in_flight {metrics_store.IN_FLIGHT}")

    # Prometheus tolerates a missing trailing newline but every reference
    # exporter emits one — keep parsers happy.
    return "\n".join(lines) + "\n"


@router.get("/metrics", response_class=PlainTextResponse)
def metrics_scrape() -> PlainTextResponse:
    """Prometheus scrape target.

    Always returns 200 with the current snapshot. If ``_render`` ever
    raises (it shouldn't — the stores are plain dicts) we still want
    Prometheus to see the endpoint as up rather than as a broken
    target, so keep this thin.
    """
    return PlainTextResponse(content=_render(), media_type=_CONTENT_TYPE)
