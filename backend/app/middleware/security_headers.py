"""Response security headers middleware.

Adds a conservative set of headers to every response:
  - Strict-Transport-Security (only when the request looks HTTPS)
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY (in addition to CSP frame-ancestors)
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: minimal disable-all-features baseline
  - Content-Security-Policy: report-only default that keeps the API workable
    for a decoupled SPA. The frontend host is expected to send its own CSP.
"""

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ``report-uri`` is the legacy CSP2 directive; modern browsers (Chrome,
# Edge, and Firefox behind a flag) honour ``report-to`` instead and
# will silently drop reports that only use the old directive. Emitting
# both keeps every browser reporting to the same endpoint without a
# codepath split.
_CSP = (
    "default-src 'none'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    # Browsers POST violation reports here — the endpoint lives in
    # routers/csp_report.py and lands rows in ``audit_logs`` with
    # ``action='csp.violation'``.
    "report-uri /csp-report; "
    # The ``report-to`` directive names a Reporting API endpoint group
    # declared by the ``Report-To`` response header below.
    "report-to csp-endpoint"
)

# 10 886 400 s == 126 days — the Reporting API max-age most browsers
# recommend as a sensible upper bound. json.dumps keeps the field
# ordering deterministic and escapes any future changes cleanly.
_REPORT_TO = json.dumps(
    {
        "group": "csp-endpoint",
        "max_age": 10886400,
        "endpoints": [{"url": "/csp-report"}],
    },
    separators=(",", ":"),
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        )
        if request.url.scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        response.headers.setdefault("Content-Security-Policy", _CSP)
        # Pair the CSP with a Reporting API endpoint group so modern
        # browsers actually deliver ``report-to`` violation reports.
        response.headers.setdefault("Report-To", _REPORT_TO)
        return response
