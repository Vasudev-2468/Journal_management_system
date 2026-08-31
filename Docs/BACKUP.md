# Database Backup and Restore

This document is the operational playbook for backing up and restoring
the journal-management Postgres database. It covers what to run, where
the dumps go, how long they are kept, and how we prove — every quarter
— that a restore actually works.

Two audiences read this:

- **On-call operators**, who need a copy-and-paste command when the
  live database is on fire.
- **Auditors** (journal boards, tenants, institutional review), who
  need to see that a documented, tested procedure exists.

If you are hosting on **Neon**, skip to the *Neon PITR* section at the
end — Neon takes automated snapshots for us, and manual `pg_dump` runs
serve only as an off-provider archive.

---

## 1. Daily logical backup with `pg_dump`

We take one logical dump per calendar day. The custom format (`-Fc`)
is compact, indexed for selective restore with `pg_restore`, and
version-portable across Postgres 13 → 17.

```bash
# Run as the `postgres` user or any role with pg_read_all_data.
# DATABASE_URL is the same connection string the backend uses.
export PGPASSWORD='***'

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="/var/backups/jgair/jgair-${STAMP}.dump"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${OUT}" \
  "${DATABASE_URL}"

# Verify the dump is not truncated: pg_restore --list must return
# a non-empty table of contents. Fail the job if it does not.
pg_restore --list "${OUT}" > "${OUT}.toc" \
  || { echo "backup verify FAILED"; exit 1; }
```

Typical dump size for a mid-sized journal (a few thousand articles,
their reviews, and audit rows) is 40–150 MB compressed. If you see it
double week-over-week, investigate before adjusting retention.

## 2. Storage location

Store dumps somewhere that survives losing the app host **and** the
Postgres host in the same incident. In practice, that means an object
store in a different region, with server-side encryption on and
public access denied.

Recommended layout:

```
s3://jgair-backups/prod/pg/YYYY/MM/jgair-YYYY-MM-DDTHH-MM-SSZ.dump
```

- **Encryption**: SSE-KMS with a customer-managed key. If you use
  Cloudflare R2 or Backblaze B2 instead, enable their equivalent
  server-side encryption and rotate the KMS key annually.
- **Access**: object-lock or WORM policy for at least 30 days so a
  compromised operator credential cannot delete recent backups.
- **Off-site**: cross-region replication if you host in the same
  region as your primary — a regional outage should still leave a
  restorable copy.

The `pg_dump` script above should `aws s3 cp` (or `rclone copy`) the
`.dump` file to the bucket immediately after it verifies, then delete
the local copy once the upload succeeds.

## 3. Retention: 30 days rolling

Keep **30 daily dumps**. Beyond 30 days the risk profile shifts —
schemas drift, GDPR erasure requests apply, and older dumps become
liability more than insurance.

If regulatory obligations require longer retention (for example
FASTR-style archival for a specific tenant), promote the last dump of
each month to a separate `s3://jgair-backups/prod/pg-monthly/` prefix
with a 12-month lifecycle rule. That keeps the operational bucket
small while satisfying auditors.

A simple lifecycle rule (AWS S3 JSON):

```json
{
  "Rules": [
    {
      "ID": "expire-daily-dumps",
      "Filter": { "Prefix": "prod/pg/" },
      "Status": "Enabled",
      "Expiration": { "Days": 30 }
    }
  ]
}
```

## 4. Cron template for a Linux host

Place the following in `/etc/cron.d/jgair-backup`. Adjust paths for
your distribution. The `MAILTO` line makes the daily cron output the
first thing on-call sees if something breaks.

```cron
MAILTO=oncall@example.com
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Daily at 02:07 UTC — off-peak for most authors, before EU morning.
7 2 * * *   postgres  /usr/local/bin/jgair-backup.sh >> /var/log/jgair-backup.log 2>&1
```

The `jgair-backup.sh` script is the pipeline from section 1: dump,
verify with `pg_restore --list`, upload to object storage, delete the
local file. Guard it with `flock` so overlapping runs cannot corrupt a
partial upload:

```bash
#!/usr/bin/env bash
set -euo pipefail
exec 9>/var/lock/jgair-backup.lock
flock -n 9 || { echo "another backup already running"; exit 0; }
# … dump + upload commands here …
```

## 5. Restore procedure

Restoring is the same regardless of whether the disaster was a
dropped table, a bad migration, or a lost host.

1. **Provision an empty target database.** Never restore over a live
   database. Bring up a fresh Postgres instance (or a fresh schema
   `jgair_restore` inside a spare cluster) and record its URL as
   `RESTORE_URL`.

2. **Copy the chosen dump locally.**
   ```bash
   aws s3 cp s3://jgair-backups/prod/pg/2026/03/jgair-2026-03-15T02-07-00Z.dump ./restore.dump
   ```

3. **Restore.** `pg_restore` is safe to interrupt and retry with
   `--clean --if-exists` because the custom format tracks per-object
   dependencies.
   ```bash
   pg_restore \
     --no-owner --no-privileges \
     --clean --if-exists \
     --dbname "${RESTORE_URL}" \
     ./restore.dump
   ```

4. **Point the backend at `RESTORE_URL`** by setting `DATABASE_URL`
   on a single non-production replica, then run the smoke test in the
   next section. Only after the smoke test passes should you swap the
   production `DATABASE_URL`.

5. **Rotate secrets** if the incident implied credential compromise.
   Alembic's history is inside the restored database, so migrations
   pick up cleanly from where the dump was taken.

Restoring a 100 MB dump into an empty database usually completes in
2–5 minutes on modern SSD.

## 6. Test restore, once a quarter

An untested backup is a story, not a backup. On the first Monday of
every quarter, run the full restore procedure into a scratch database
and prove the app comes up against it. Log the outcome in the
operations calendar.

The smoke test is a tiny `pytest` file that hits `/health` against a
backend pointed at the restored database. It lives at
`backend/tests/smoke/test_restore.py`:

```python
"""Restore smoke test — quarterly drill.

Point ``BACKEND_URL`` at a backend instance whose DATABASE_URL is set
to the restored database. The check is deliberately minimal: if the
app can serve /health, the schema and connection pool are alive.
"""

import os
import urllib.request


def test_restored_backend_health():
    url = os.environ["BACKEND_URL"].rstrip("/") + "/health"
    with urllib.request.urlopen(url, timeout=10) as resp:
        assert resp.status == 200, f"unexpected status {resp.status}"
        body = resp.read().decode("utf-8")
        assert "ok" in body.lower() or "healthy" in body.lower(), body
```

Run it from the operator's laptop against the restored deployment:

```bash
BACKEND_URL=https://restore-drill.internal.example.com \
  pytest backend/tests/smoke/test_restore.py -q
```

Record the timestamp of the last successful drill in the
`ops/last-restore-drill.txt` file and commit it. Auditors ask.

## 7. Neon (managed Postgres) — automated PITR

If the production database is hosted on Neon, the primary safety net
is Neon's own point-in-time recovery. Neon retains a continuous WAL
stream for the retention window on your plan (7 days on Launch, 30
days on Scale at time of writing — check `neon status` for the exact
current setting).

To recover on Neon:

1. In the Neon console, pick the affected project → **Branches** →
   **Create branch from** and select the timestamp just before the
   incident. Neon spins up a new branch with its own read/write
   connection string.
2. Point a non-production backend at the new branch's `DATABASE_URL`,
   run the section 6 smoke test.
3. If the branch is good, either promote it to primary, or `pg_dump`
   from it and restore selectively into the current primary.

Neon's PITR does not replace off-provider dumps: keep the daily
`pg_dump` job running so a Neon-account compromise or accidental
project deletion is still recoverable. The two together are what
"real backups" mean for our deployment.
