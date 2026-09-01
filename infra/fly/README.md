# Fly.io deployment (`infra/fly/`)

Single-region production deployment of the JGAIR backend on
[Fly.io](https://fly.io/). Pairs with a Fly Postgres cluster (created
separately) and a static frontend hosted anywhere (Vercel, Cloudflare
Pages, or another Fly app).

Sibling deployment scenarios:

- `../k8s/` — Kubernetes single-cluster deployment.
- `../../docker-compose.prod.yml` — single-node self-host, no orchestrator.
- `../../render.yaml`, `../../frontend/vercel.json` — hosted (Render + Vercel).

## Files

| File         | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| `fly.toml`   | App config: app name, region, HTTP service, health checks     |
| `Dockerfile` | Multi-stage build; gunicorn + uvicorn workers in the runtime  |

## One-time bootstrap

```bash
# 1. Install and log in.
brew install flyctl                  # or: curl -L https://fly.io/install.sh | sh
flyctl auth login

# 2. Create the app scaffolding (no deploy yet).
flyctl launch \
  --dockerfile infra/fly/Dockerfile \
  --copy-config infra/fly/fly.toml \
  --name jgair-backend \
  --region iad \
  --no-deploy

# 3. Provision Postgres and attach it (this sets DATABASE_URL for you).
flyctl postgres create --name jgair-db --region iad
flyctl postgres attach --app jgair-backend jgair-db

# 4. Set the rest of the secrets.
flyctl secrets set --app jgair-backend \
  SECRET_KEY="$(openssl rand -hex 32)" \
  ALGORITHM=HS256 \
  ALLOW_ORIGINS="https://jgair.example.org" \
  FRONTEND_URL="https://jgair.example.org" \
  OPENAI_API_KEY="sk-..." \
  SENDGRID_API_KEY="SG..." \
  SCHEDULED_TASKS_SECRET="$(openssl rand -hex 24)"

# 5. Ship it.
flyctl deploy --app jgair-backend
```

## Ongoing deploys

```bash
flyctl deploy --app jgair-backend
```

`fly.toml` declares `release_command = "alembic upgrade head"`, so
each deploy runs migrations against a fresh machine on the new image
before Fly shifts traffic to it. If migrations fail, the deploy aborts
and the old machines keep serving.

## Scaling

```bash
# Add/remove machines in the primary region.
flyctl scale count 3 --app jgair-backend

# Change VM class.
flyctl scale vm shared-cpu-2x --memory 1024 --app jgair-backend

# Add a second region.
flyctl regions add fra --app jgair-backend
```

`fly.toml` already caps auto-scaling at `max_machines_running = 3`
with `min_machines_running = 1`, which is a sensible starting point
for a small journal.

## Health probes

The HTTP service check hits `GET /system/health/live` every 15s. Wire
that route on the app side before deploying — until it exists, Fly
will page you with the machine flapping. If you must bring the app up
first, swap the path to `/health` (the current handler) as a one-off.

## Scheduled work

Fly doesn't have first-class cron. Three sensible options:

1. **GitHub Actions cron** hitting `POST /scheduled-tasks/run` on the
   Fly URL. This is what the hosted deployment already uses.
2. **A second Fly app** with `[processes]` running a Python loop that
   sleeps and POSTs to the backend. Cheap but not free.
3. **An external scheduler** (Upstash QStash, EasyCron) hitting the
   same endpoint.

Whichever you pick, the request must carry the same
`X-Scheduled-Tasks-Secret` header the API validates.

## Frontend

`fly.toml` here is backend-only. The React bundle wants to be somewhere
CDN-fronted (Vercel or Cloudflare Pages) — don't burn a Fly machine on
static hosting unless you have a reason to. Set `ALLOW_ORIGINS` and
`FRONTEND_URL` above to the frontend's public URL.
