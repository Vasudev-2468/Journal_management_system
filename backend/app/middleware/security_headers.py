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

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


_CSP = (
    "default-src 'none'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'"
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
        return response
