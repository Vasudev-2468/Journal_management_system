"""In-memory token-bucket rate limit — no Redis required.

Suitable for the free-tier deployment. Each unique client IP (or bearer token
if no IP) is allowed up to ``max_burst`` requests, refilled at
``refill_per_second`` tokens/second. Exceeding the bucket yields HTTP 429.

Public paths and health-check endpoints bypass the limiter.
"""

import time
from collections import defaultdict
from typing import Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


_BYPASS_PREFIXES = (
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/sitemap.xml",
    "/robots.txt",
    "/oai-pmh",
)


class InMemoryRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, max_burst: int = 60, refill_per_second: float = 1.0):
        super().__init__(app)
        self.max_burst = max_burst
        self.refill_per_second = refill_per_second
        self._buckets: dict[str, Tuple[float, float]] = defaultdict(
            lambda: (float(max_burst), time.monotonic())
        )

    def _key_for(self, request: Request) -> str:
        client = request.client.host if request.client else "unknown"
        return f"{client}:{request.url.path.split('/', 2)[1] if '/' in request.url.path else ''}"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path or "/"
        if any(path.startswith(p) for p in _BYPASS_PREFIXES):
            return await call_next(request)

        now = time.monotonic()
        key = self._key_for(request)
        tokens, last = self._buckets[key]
        elapsed = max(0.0, now - last)
        tokens = min(float(self.max_burst), tokens + elapsed * self.refill_per_second)

        if tokens < 1.0:
            resp = JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
            )
            resp.headers["Retry-After"] = "5"
            self._buckets[key] = (tokens, now)
            return resp

        tokens -= 1.0
        self._buckets[key] = (tokens, now)
        response: Response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Remaining", str(int(tokens)))
        return response
