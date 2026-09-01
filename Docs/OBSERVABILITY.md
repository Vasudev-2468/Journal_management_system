# Observability

Three endpoints and one environment toggle. Everything documented here
lives inside `backend/app/` — no external services required.

## Endpoints

### `GET /system/health`

Full health snapshot. Runs `SELECT 1` against the primary database with a
short timeout and returns the process's uptime, version metadata, and
per-dependency check results.

Always returns **HTTP 200** — orchestrators poll this for information,
not to gate traffic. When a check fails, `status` flips to `"degraded"`
and the failing check carries an error message.

```json
{
  "status": "ok",
  "timestamp": "2026-08-31T14:03:11.812345+00:00",
  "uptime_seconds": 5842.19,
  "version": {
    "app": "jgair",
    "commit": "9fa1c3d",
    "python": "3.11.9"
  },
  "checks": { "database": "ok" }
}
```

`version.commit` reads the `GIT_COMMIT` environment variable (set by the
CI build step or your deploy pipeline); it falls back to `"unknown"`
locally.

### `GET /system/health/live`

Liveness probe — no dependencies. Returns `{"status": "ok"}` and HTTP
200. If the process can answer it, it is by definition alive.

Use this for Kubernetes `livenessProbe`, Railway healthcheck, or any
supervisor that should restart a wedged process.

### `GET /system/health/ready`

Readiness probe — runs the DB check and returns **HTTP 503** when it
fails. A load balancer should route traffic to a pod only while this
returns 200.

### `GET /metrics`

Prometheus text exposition format (v0.0.4). Three signals:

| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | `method, path_prefix, status` |
| `http_request_duration_seconds` | histogram | `method, path_prefix, status` |
| `http_requests_in_flight` | gauge | — |

`path_prefix` is the first URL segment (`/articles/42` → `articles`) to
keep label cardinality bounded. Histogram buckets: 5 ms, 10 ms, 25 ms,
50 ms, 100 ms, 250 ms, 500 ms, 1 s, 2.5 s, 5 s, 10 s (plus `+Inf`).

Single-process only — counters live in module-level dicts. This matches
our current single-worker deployment; fan-out to multiple workers would
require either `prometheus_client`'s multiprocess mode or a
Redis-backed shim.

Public read — Prometheus scrape jobs on Grafana Cloud / self-hosted
don't send credentials by default and the payload has no PII.

## Structured logging — `JSON_LOGS`

Set the environment variable to switch stdout from uvicorn's default
human-readable format to one-JSON-object-per-line:

```
JSON_LOGS=1
```

Any other value (unset, `0`, empty) keeps the default formatter.

Fields emitted per record:

- `ts` — ISO-8601 UTC timestamp with trailing `Z`
- `level` — `INFO`, `WARNING`, `ERROR`, …
- `name` — logger name (`app.routers.articles`)
- `msg` — the formatted message
- `path` — optional; set via `logger.info(..., extra={"path": ...})`
- `request_id` — optional; set via `extra={"request_id": ...}`
- any additional `extra={}` keys the caller supplies

Exceptions get a formatted `exc_info` string. The formatter is
installed by `backend/app/utils/logging_config.py` at import time and
is idempotent — a second call detaches the previous handler before
re-installing, so hot reloads don't stack duplicates.
