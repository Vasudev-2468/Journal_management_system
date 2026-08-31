# Operations — Time-Triggered Automation

The JGAIR backend has no persistent worker on the free tier, so periodic
maintenance runs on an external trigger. This document covers what runs,
how to wire the trigger, and how to run it by hand.

## What the scheduled tasks are

A single entry point (`backend/scripts/run_scheduled_tasks.py`) executes
three idempotent jobs in order and prints a JSON summary to stdout:

1. **`send_deadline_reminders`** — for every pending review whose link
   expires in the next 48 hours, email the reviewer using the
   `reviewer_reminder` template. Uniqueness is enforced by inserting a
   `notifications` row with
   `trigger_event = "reviewer_reminder_48h:{review_id}"`; the next run
   sees that row and skips the review.
2. **`advance_expired_review_links`** — for every pending review whose
   `link_expires_at` is already in the past, flip `status = 'expired'`
   and `link_used = True`, and write an `audit_logs` row with
   `action = 'review.link_expired'`.
3. **`production_stage_nudge`** — for every `ProductionRecord` stuck in
   `author_proof_pending` for more than five days, email the submission's
   author using the `revision_request` template (best available proxy)
   or a hardcoded fallback letter. Uniqueness is enforced by
   `trigger_event = "proof_nudge:{record_id}"`.

Each task is wrapped in its own `try`/`except`; a bad row logs and skips
rather than aborting the run.

The stdout summary looks like:

```json
{"reminders_sent": 2, "links_expired": 1, "proof_nudges": 0, "duration_ms": 812}
```

## Option A — GitHub Actions (recommended)

The workflow `.github/workflows/scheduled-tasks.yml` runs on `cron: '0 * *
* *'` (top of every hour) and also on `workflow_dispatch` for manual runs
from the Actions tab.

To turn it on, set two repository secrets under **Settings → Secrets and
variables → Actions**:

| Secret | Value |
|---|---|
| `SCHEDULED_TASKS_URL` | `https://<your-backend-host>/scheduled-tasks/run` |
| `SCHEDULED_TASKS_SECRET` | A long random string. Also set the identical value in the backend's environment as `SCHEDULED_TASKS_SECRET`. |

If `SCHEDULED_TASKS_URL` is unset the workflow logs a warning and exits
successfully, so a fresh fork does not fail every hour.

The workflow issues:

```
POST $SCHEDULED_TASKS_URL
X-Scheduled-Tasks-Secret: $SCHEDULED_TASKS_SECRET
```

and fails the run on any non-200 response.

## Option B — cron-job.org (or any external cron)

If GitHub Actions is not an option (e.g. private-fork billing) the same
endpoint works with any hosted cron:

1. In [cron-job.org](https://cron-job.org) create a new job.
2. **URL:** `https://<your-backend-host>/scheduled-tasks/run`
3. **Method:** `POST`
4. **Header:** `X-Scheduled-Tasks-Secret: <the shared secret>`
5. **Schedule:** every hour (or every day at 09:00 UTC if you prefer
   fewer runs — the tasks are idempotent either way).

Set the same secret on the backend as `SCHEDULED_TASKS_SECRET`.

## Option C — Manual run on the box

For a one-off run, or when developing locally:

```bash
cd backend
# Uses the same DATABASE_URL / SENDGRID_* env as the API
python scripts/run_scheduled_tasks.py
```

The script prints the same JSON summary to stdout and exits `0` on
success. Nothing else is required — no CLI arguments, no config file.

## Turning off the endpoint

Leave `SCHEDULED_TASKS_SECRET` unset on the backend and every request to
`/scheduled-tasks/run` responds `401 Unauthorized`, regardless of the
header sent by the caller. That is the safe default for a freshly
deployed environment.
