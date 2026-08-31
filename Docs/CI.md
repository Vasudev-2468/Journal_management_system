# Continuous Integration

This project ships a single GitHub Actions workflow at
`.github/workflows/ci.yml`. It runs on every push to `main` and on every
pull request, and it cancels superseded runs on the same branch via a
`concurrency` group so only the newest commit's checks stay in flight.

## What CI does

The workflow has two independent jobs, both on `ubuntu-latest`.

### `backend`

1. Checkout the repo.
2. Set up Python 3.11.
3. Restore a pip cache keyed on `backend/requirements*.txt`.
4. Install `backend/requirements.txt`, and — if present —
   `backend/requirements-dev.txt` (this is where `pytest` lives).
5. Spin up a Postgres 15 service container
   (`POSTGRES_USER=journal`, `POSTGRES_PASSWORD=journal`,
   `POSTGRES_DB=journal`) on port 5432, gated by a `pg_isready` health
   check.
6. Run `alembic upgrade head` against that database.
7. Run `bash scripts/check_migrations.sh`, which fails the build if
   `alembic heads` reports more than one head (i.e. two branches added
   migrations in parallel and no merge revision was cut).
8. Run `pytest -q --disable-warnings`.

### `frontend`

1. Checkout the repo.
2. Set up Node 20.
3. Restore an npm cache keyed on `frontend/package-lock.json`.
4. `npm ci` if the lockfile is present, otherwise `npm install`.
5. `CI=true npm test -- --watchAll=false --passWithNoTests` — runs
   `react-scripts test` (Jest) in non-interactive mode.
6. `CI=true npm run build` — runs `react-scripts build`; `CI=true`
   turns lint warnings into errors so a warning-noisy PR fails here
   rather than at deploy time.

## Environment variables set by the workflow

The backend job exports the following at the job level so every step
(the alembic upgrade, the migration guard, and pytest) sees the same
values:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://journal:journal@localhost:5432/journal` |
| `TEST_DATABASE_URL` | `postgresql://journal:journal@localhost:5432/journal` |
| `SECRET_KEY` | `ci-only-secret-abc` |
| `ALLOW_ORIGINS` | `http://localhost:3000` |
| `FRONTEND_URL` | `http://localhost:3000` |

The frontend job sets `CI=true` on the `npm test` and `npm run build`
steps. No other env vars are required for the frontend job.

None of these values are secrets — they are safe to hard-code and are
only meaningful against the ephemeral Postgres service container.

## Reproducing CI locally

The idea is: bring up a scratch Postgres, point the same env vars at
it, then run the same commands CI runs.

### Backend

You can either reuse the existing `docker-compose.yml` (which starts a
Postgres for the dev stack) or spin up a throwaway container that
matches CI exactly. A `docker-compose.test.yml` mirroring the CI
service looks like this:

```yaml
# docker-compose.test.yml (optional; matches CI's service container)
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: journal
      POSTGRES_PASSWORD: journal
      POSTGRES_DB: journal
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "journal", "-d", "journal"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Then, from the repo root:

```bash
# 1. Start Postgres (either compose file works; test file matches CI creds)
docker compose -f docker-compose.test.yml up -d

# 2. Export the same env vars CI uses
export DATABASE_URL=postgresql://journal:journal@localhost:5432/journal
export TEST_DATABASE_URL=$DATABASE_URL
export SECRET_KEY=ci-only-secret-abc
export ALLOW_ORIGINS=http://localhost:3000
export FRONTEND_URL=http://localhost:3000

# 3. Install and run the backend checks
cd backend
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
alembic upgrade head
bash scripts/check_migrations.sh
pytest -q --disable-warnings
```

If `check_migrations.sh` fails with "expected exactly 1 alembic head",
merge the divergent heads with `alembic merge -m "merge heads" <rev_a>
<rev_b>` and commit the resulting revision.

### Frontend

```bash
cd frontend
npm ci              # or `npm install` if you don't have the lockfile yet
CI=true npm test -- --watchAll=false --passWithNoTests
CI=true npm run build
```

Both steps must pass for the frontend job to go green in CI.

## Actions used

Pinned to current major versions:

- `actions/checkout@v4`
- `actions/setup-python@v5`
- `actions/setup-node@v4`
- `actions/cache@v4`
