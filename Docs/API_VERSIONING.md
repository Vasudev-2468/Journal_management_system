# API versioning strategy

Status: proposed. This document captures the versioning approach we
intend to adopt. The code change is a coordinated release concern and
is not part of the same commit that introduces this doc.

## 1. Where we are today

All backend routes are mounted at unversioned paths:

```
/auth/...            /articles/...      /reviews/...
/journals/...        /submissions/...   /reviewers/...
/editor-portal/...   /scheduled-tasks/...   /system/health/...
```

Clients (the React frontend, external integrations, RSS/JATS/sitemap
consumers, the GitHub Actions cron caller) hit these paths directly.
There is no header-based version negotiation, no `Accept: application/vnd.jgair.v1+json` scheme, and no `?api_version=` query
parameter. Every response is implicitly "whatever the deployed build
happens to serve today".

That has been fine while everything is in one repo and the frontend
ships in lockstep with the backend. It stops being fine as soon as:

- Third parties (institutional discovery clients, index services,
  mobile apps) integrate against the API.
- We want to change a response shape without a coordinated
  frontend redeploy.
- Someone needs to pin against a stable contract during due diligence
  or a security review.

## 2. Proposed approach — path-based versioning with alias mounts

We adopt path-based versioning: `/v1/*`, `/v2/*`, etc. The choice is
between path-based, header-based, and query-based; path-based wins for
this project because:

- It is trivially cacheable (CDNs key on the URL).
- It is grep-able in server logs and firewall rules.
- It is the least surprising for people reading the OpenAPI schema.
- It composes with our existing nginx / Vercel routing without any
  content-negotiation shims.

### The alias-mount pattern

The existing unversioned mounts stay in place. Every router gets a
second mount under `/v1/...` that points at the same router object.
The mounts return byte-for-byte identical responses because they *are*
the same handler; there is no duplication of business logic.

New clients target `/v1/*`. Old paths remain supported indefinitely
(see §5).

### Concretely, in `main.py`

Given the current mounts:

```python
# Current — do not touch these lines when v1 lands.
app.include_router(articles.router,     prefix="/articles",     tags=["articles"])
app.include_router(journals.router,     prefix="/journals",     tags=["journals"])
app.include_router(reviews.router,      prefix="/reviews",      tags=["reviews"])
app.include_router(submissions.router,  prefix="/submissions",  tags=["submissions"])
app.include_router(reviewers.router,    prefix="/reviewers",    tags=["reviewers"])
app.include_router(editor_portal.router, prefix="/editor-portal", tags=["editor-portal"])
# ...and every other router.
```

Add v1 alias mounts immediately after, using a small loop so we can't
forget one:

```python
# ── v1 aliases ───────────────────────────────────────────
# Every unversioned mount above gets a mirror under /v1/*. The two
# prefixes point at the same router object, so they will always agree.
# When a breaking change lands, a new router (or a wrapper that reshapes
# a response) mounts under /v2/... — the /v1/ line for that router
# stays put until we hit the deprecation window (see API_VERSIONING.md
# §5).
V1_ROUTES = [
    (auth.router,           "/auth",           ["auth"]),
    (journals.router,       "/journals",       ["journals"]),
    (articles.router,       "/articles",       ["articles"]),
    (reviews.router,        "/reviews",        ["reviews"]),
    (ai.router,             "/ai",             ["ai"]),
    (submissions.router,    "/submissions",    ["submissions"]),
    (reviewers.router,      "/reviewers",      ["reviewers"]),
    (editorial.router,      "/editorial",      ["editorial"]),
    (editor_portal.router,  "/editor-portal",  ["editor-portal"]),
    # ...continue for every router mounted above.
]
for router, prefix, tags in V1_ROUTES:
    app.include_router(router, prefix=f"/v1{prefix}", tags=[f"v1:{tags[0]}"])
```

Notes on the loop:

- Tags are prefixed `v1:` so the generated OpenAPI groups v1 endpoints
  in their own section — reviewers of the schema see them side-by-side
  with the unversioned equivalents.
- The list is authoritative for `/v1`. If a router is added later and
  the author forgets to append it here, a lightweight unit test
  (`test_v1_covers_all_routers`) will catch the omission by diffing
  the two mount sets.
- No new dependency, no middleware, no request rewriting. FastAPI's
  `include_router` handles the duplication cleanly.

### What does NOT change

- Routers themselves stay untouched. There is no `if version == 1`
  branching inside handlers.
- Response schemas stay untouched. `/v1/articles/{id}` returns exactly
  what `/articles/{id}` returns today.
- Feeds, sitemap, and other content-typed XML endpoints (`/*.xml`,
  KBART, JATS) remain unversioned — they are content, not an API
  contract, and consumers negotiate them by MIME type.
- `/system/health/*`, `/scheduled-tasks/*`, and static `/templates/*`
  are operational endpoints, not API surface. They stay unversioned.

## 3. When to bump to `/v2`

`/v2/*` is introduced when — and only when — a breaking change is
about to land on at least one route. Breaking, for us, means any of:

- Removing a field from a response body.
- Renaming a field (including a case change).
- Changing a field's type (`string` → `int`, `null` → error).
- Tightening a request schema (making an optional field required).
- Changing HTTP status codes for a documented case.
- Changing pagination semantics.

Additive changes — new optional response fields, new endpoints, new
query parameters with safe defaults — do NOT bump the version. They
ship under both `/v1/` and unversioned, unchanged.

When a v2 change lands:

1. The new-shaped handler mounts under `/v2/...`.
2. The old-shaped handler stays mounted under `/v1/...` and the
   unversioned path. The two point at different implementations (or
   one implementation with a wrapper that reshapes the response).
3. Only the changed router splits. Every other router still has one
   implementation, mounted under `/v1/...`, `/v2/...`, and unversioned.

## 4. Deprecation policy

Deprecation is announced 12 months before removal.

- Once we decide to retire an endpoint (or an entire version), every
  response from that endpoint gains a
  [`Deprecation`](https://datatracker.ietf.org/doc/html/rfc9745)
  header set to the deprecation date, plus a `Sunset` header set to
  the removal date, at least 365 days later.
- Example:

  ```
  Deprecation: Wed, 01 Sep 2026 00:00:00 GMT
  Sunset: Mon, 01 Sep 2027 00:00:00 GMT
  Link: <https://docs.jgair.example.org/api/migration#v1-articles>; rel="deprecation"
  ```

- A machine-readable list of deprecated routes lives at
  `GET /system/deprecations` (JSON: `[{"path": "...", "sunset": "..."}, ...]`).
- We advertise every removal in the release notes and via a mailing
  list to registered API consumers.
- Removals happen on a scheduled minor release, never mid-cycle.

## 5. Client-side migration checklist

For each client (frontend, downstream integrations, mobile, cron
callers):

- [ ] Grep the codebase for every hard-coded API path (`/articles`,
      `/journals`, `/reviews`, `/submissions`, ...). A shared
      `API_BASE` constant makes this a one-place change; a scattered
      set of literals is why we're doing this now.
- [ ] Introduce (or update) `API_BASE` to include the version segment:
      `https://api.jgair.example.org/v1`.
- [ ] Run the full end-to-end test suite against a staging deploy that
      has the `/v1/*` mounts live.
- [ ] Watch response headers for `Deprecation` / `Sunset` — surface a
      warning in CI when either is present, so a scheduled removal
      doesn't surprise anyone.
- [ ] Track which version each integration is on in an internal
      registry. When a `/v2/*` route lands, that registry tells you
      who has to move and by when.
- [ ] For public-facing clients (RSS readers, index services), we
      cannot force a migration; those consumers stay on the unversioned
      or `/v1/*` paths for the endpoints they use. Plan removals of
      those paths only after usage telemetry shows near-zero traffic.

## 6. What we deliberately are NOT doing

- **Header-based version negotiation.** Fine for content APIs
  (GitHub v3/v4 do it) but overkill for our surface area and awkward
  to cache at the edge.
- **A version segment on every response body** (e.g. `{"apiVersion":
  "v1", "data": {...}}`). We already carry `openapi.json`; a per-body
  discriminator adds nothing for clients that consult the schema.
- **Semver on the API.** The API version is a small integer that
  matches the URL segment. Server semver (`X.Y.Z`) is a separate
  concern and continues to live in `pyproject.toml` / release tags.
- **Dropping the unversioned paths on day one.** The alias mount is
  cheap; the flag day is not. Old paths stay until the deprecation
  window plays out.
