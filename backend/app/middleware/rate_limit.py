"""In-memory token-bucket rate limit — no Redis required.

Suitable for the free-tier deployment. Each unique client IP (or authenticated
user id, when a valid ``Authorization: Bearer`` header is present) is allowed
up to ``max_burst`` requests, refilled at ``refill_per_second`` tokens/second.
Exceeding the bucket yields HTTP 429.

Keying preference: user id (``sub`` claim from the JWT signed with the app's
``SECRET_KEY``) over IP, so shared-NAT clients aren't punished for one noisy
neighbour. Token decode failures fall back to IP silently — an anonymous or
tampered token should never let a request through faster than a valid one.

Public paths and health-check endpoints bypass the limiter.
"""

import time
from collections import defaultdict
from typing import Dict, Tuple

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings


_BYPASS_PREFIXES = (
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/sitemap.xml",
    "/robots.txt",
    "/oai-pmh",
)


# Cache decoded ``sub`` claims for a short window so a burst of requests
# from one client doesn't pay the HS256 verification cost every hop. Keyed
# by the raw token string; value is ``(sub, expires_at_monotonic)``.
_TOKEN_CACHE_TTL_SECONDS = 60.0


class InMemoryRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, max_burst: int = 60, refill_per_second: float = 1.0):
        super().__init__(app)
        self.max_burst = max_burst
        self.refill_per_second = refill_per_second
        self._buckets: dict[str, Tuple[float, float]] = defaultdict(
            lambda: (float(max_burst), time.monotonic())
        )
        self._token_cache: Dict[str, Tuple[str, float]] = {}

    def _first_path_segment(self, path: str) -> str:
        return path.split("/", 2)[1] if "/" in path else ""

    def _sub_from_token(self, token: str) -> str | None:
        """Return the ``sub`` claim, or ``None`` on any decode failure.

        Cached for ``_TOKEN_CACHE_TTL_SECONDS`` so a client hammering the
        API doesn't cost a signature verification per request. Never
        raises — a bad or expired token yields ``None`` and the caller
        falls back to IP-based keying.
        """
        if not token:
            return None
        now = time.monotonic()

        cached = self._token_cache.get(token)
        if cached is not None:
            sub, expires_at = cached
            if expires_at > now:
                return sub
            # Expired — drop and re-decode below.
            self._token_cache.pop(token, None)

        # Opportunistic cleanup so the cache doesn't grow unbounded on a
        # long-running process. Cheap: it only runs when we're already
        # about to do the expensive JWT verify.
        if len(self._token_cache) > 512:
            for k, (_, exp) in list(self._token_cache.items()):
                if exp <= now:
                    self._token_cache.pop(k, None)

        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
        except JWTError:
            return None
        except Exception:
            # Defensive: never let a malformed header take down the limiter.
            return None

        sub = payload.get("sub")
        if not sub:
            return None
        sub_str = str(sub)
        self._token_cache[token] = (sub_str, now + _TOKEN_CACHE_TTL_SECONDS)
        return sub_str

    def _key_for(self, request: Request) -> str:
        segment = self._first_path_segment(request.url.path)

        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth:
            parts = auth.split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "bearer":
                sub = self._sub_from_token(parts[1].strip())
                if sub:
                    return f"user:{sub}:{segment}"

        client = request.client.host if request.client else "unknown"
        return f"{client}:{segment}"

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
