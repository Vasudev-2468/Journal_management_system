# Academic Journal Management System

This is a full-stack AI-powered academic journal management system built with FastAPI, SQLAlchemy, PostgreSQL, React 18, and Tailwind CSS. The system is designed to facilitate the management of academic journals, articles, and reviews, while also incorporating AI features for analysis and recommendations.

---

## What's new

The last two platform-expansion waves broadened the system from a submission/review pipeline into a full journal operations platform. Highlights:

- **Revisions loop.** Editors can request author revisions from a review round and track the manuscript through re-submission without breaking the review history.
- **Production stages.** Post-acceptance production (copy-edit, typesetting, proofreading, publication) is tracked per-article on a stage timeline.
- **Special issues.** Curated calls-for-papers with their own landing pages and per-issue submission routing.
- **Email templates.** Editor-managed message templates (subject/body) for every automated touchpoint (submission confirmation, reviewer invite, decision, etc.).
- **Audit log.** Every editor-side write is journalled and queryable, so decisions and role changes are attributable.
- **Editorial-board CRUD.** Full admin surface for the public "Editorial Board" page.
- **Contact inbox.** Reader messages from the public Contact page land in an editor-gated inbox with read/resolved state.
- **Announcements.** Editor-authored announcements published to the public site.
- **Policies CMS.** Editable publication-ethics, open-access, copyright, plagiarism, peer-review, archiving, corrections, privacy, terms, cookie and accessibility pages.
- **Reviewer accounts.** First-class reviewer authentication (invite → password → dashboard) alongside the existing token-link review flow.
- **Statistics.** Aggregate counts for submissions, reviews and decisions surfaced on the editor dashboard.
- **Search.** Article search across title, author, keyword and DOI.
- **SEO / discovery.** `robots.txt`, `sitemap.xml`, OAI-PMH, RSS and Atom feeds for indexing and syndication.
- **Cookie banner.** Consent banner on the public site with a link to the cookie policy.

## New API surface

Endpoint prefixes added or extended by the platform expansion. Each is wired up in [`backend/app/main.py`](backend/app/main.py):

| Prefix | Purpose |
|---|---|
| `/publication` | Volumes and issues (masthead of published content) |
| `/revisions` | Author revision cycles on a manuscript |
| `/production` | Post-acceptance production stage timeline |
| `/production-public` | Public-read production status for authors |
| `/special-issues` | Curated calls-for-papers |
| `/announcements` | Editor-authored public announcements |
| `/board` | Editorial-board CRUD |
| `/contact` | Reader → editor contact inbox |
| `/policies` | Editable policy CMS pages |
| `/article-reviews` | Public-facing review threads on an article |
| `/email-templates` | Editor-managed message templates |
| `/audit-logs` | Editor-write audit trail |
| `/references` | Article references / citations |
| `/users-admin` | Admin surface for user accounts and roles |
| `/uploads` | Signed upload endpoints for manuscripts and figures |
| `/submission-messages` | Threaded messages on a submission |
| `/ai/plagiarism-checks` | Plagiarism-check admin |
| `/crossref` | Crossref DOI XML + registration |
| `/authors-public` | Public author profiles |
| `/reviewer-auth` | Reviewer accounts (invite → login) |
| `/reviewer-invite` | Reviewer invitation lifecycle |
| `/rss.xml` | Article RSS feed |
| `/atom.xml` | Article Atom feed |
| `/kbart.txt` | KBART holdings feed |
| `/sitemap.xml` | XML sitemap for crawlers |
| `/robots.txt` | Robots policy |
| `/oai-pmh` | OAI-PMH metadata harvesting (Dublin Core) |
| `/search` | Article search across title/author/keyword/DOI |
| `/cited-by` | Crossref cited-by lookup |

## Applying migrations

Every wave ships new Alembic revisions under `backend/alembic/versions/` (recent: `f2b6c8d3e5a1_platform_expansion`, `g3c7d8e4b6f2_add_submission_messages`, `h4d8e5f6a2c1_extra_policies_and_contact`, `i5e9f6a7b3d2_reviewer_auth`, `j6f0a8b9c4e3_article_search_index`, `k7h2c0d1e6f5_extra_user_roles`). After pulling a new revision, run `alembic upgrade head` from `backend/` before restarting the API so the schema matches the code.

---

## Free-tier deployment (Vercel + Render + Neon)

The backend has been trimmed to fit inside free-hosting limits:

- `sentence-transformers` (torch) is gone — embeddings now go through **Voyage AI** (free tier) when a key is set, and fall back to Jaccard keyword overlap when it isn't. Reviewer matching still works either way.
- Celery is gone — all background tasks are wrapped in a lightweight `InlineTask` shim that fires them on a daemon thread. Router code (`task.delay(...)`) is unchanged.

Total cost with this stack: **$0/month** for a low-traffic academic journal. Expect ~30 s cold starts on the backend after 15 min idle.

### Services

| Layer | Provider | Free tier |
|---|---|---|
| Frontend (static React build) | **Vercel** (or Cloudflare Pages) | Unlimited bandwidth on CF Pages / 100 GB/mo on Vercel |
| Backend (FastAPI) | **Render** web service | 512 MB RAM, cold starts after 15 min idle |
| PostgreSQL | **Neon** | 3 GB storage, autosuspend after 5 min idle |
| File storage | **Cloudflare R2** (S3-compatible) | 10 GB, no egress fees |
| Email | **Brevo** or **SendGrid** | 300/day (Brevo) or 100/day (SendGrid) |
| Embeddings (optional) | **Voyage AI** | Free tier — leave blank to skip |
| AI (Anthropic) | Anthropic API | Pay-per-token (pennies) |

### Deploy steps

#### 1. Push the repo to GitHub

Everything below deploys from GitHub. Push your local checkout.

#### 2. Provision Postgres (Neon)

- Sign up at [neon.tech](https://neon.tech) → create a project.
- Copy the pooled `DATABASE_URL` (format: `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`).

#### 3. Deploy the backend (Render)

The repo ships with a [`render.yaml`](./render.yaml) blueprint.

- In Render → **New +** → **Blueprint** → point at your GitHub repo.
- Render provisions a `journal-backend` web service using `backend/` as the root.
- After the first build, open the service → **Environment** → fill in:
  - `DATABASE_URL` — from Neon (step 2)
  - `SECRET_KEY` — auto-generated by the blueprint; regenerate anytime
  - `ANTHROPIC_API_KEY` — your Claude API key
  - `ALLOW_ORIGINS` — your frontend origin (leave a placeholder for now)
  - `FRONTEND_URL` — same
  - (Optional) `VOYAGE_API_KEY`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, Twilio keys, R2/S3 credentials — see the render.yaml for the full list
- The service comes up at `https://journal-backend-xxxx.onrender.com`.
- Alembic runs on startup ([`app/main.py:37`](backend/app/main.py#L37)), so schema is applied automatically.

Verify:

```bash
curl https://journal-backend-xxxx.onrender.com/health
# {"status":"ok","timestamp":"…"}
```

#### 4. Deploy the frontend (Vercel)

- In Vercel → **Add New… → Project** → import the GitHub repo.
- **Root directory:** `frontend`
- Framework preset: **Create React App** (auto-detected via [`frontend/vercel.json`](./frontend/vercel.json)).
- **Environment variable:** `REACT_APP_API_URL = https://journal-backend-xxxx.onrender.com` (the Render URL from step 3).
- Deploy. Vercel serves the static bundle from their edge CDN with SPA fallback to `index.html`.

#### 5. Wire CORS

Back in Render → the backend service → **Environment**:

- `ALLOW_ORIGINS` = `https://your-app.vercel.app`
- `FRONTEND_URL` = `https://your-app.vercel.app`

Redeploy. The backend now trusts requests from your Vercel origin.

#### 6. (Optional) File storage on Cloudflare R2

R2 speaks S3, so no code change is needed.

- Cloudflare dashboard → **R2** → create a bucket.
- Generate an R2 token (Access Key + Secret).
- On Render, set:
  - `AWS_ACCESS_KEY_ID` = the R2 access key
  - `AWS_SECRET_ACCESS_KEY` = the R2 secret
  - `AWS_S3_BUCKET_NAME` = your bucket
  - `AWS_REGION` = `auto` (R2 ignores region)
- If your S3 client code hardcodes the AWS endpoint, add an env var for the R2 endpoint URL (`https://<accountid>.r2.cloudflarestorage.com`) and pass it to boto3.

#### 7. (Optional) Trigger the daily deadline reminders

Celery beat is gone, so `send_deadline_reminders` no longer runs on a schedule. Two options:

- **cron-job.org (free):** create a secured admin endpoint (`POST /admin/tasks/send-deadline-reminders`) protected by a header token, and register a daily cron there.
- **Manual:** hit the endpoint yourself when needed.

Skipping this entirely is also fine for a low-volume journal — reviewers still get their initial invitation and completion emails.

### What you should expect

- **Cold starts.** First request after 15 min idle: ~30 s. Warm requests: sub-second.
- **Neon autosuspend.** First DB query after 5 min idle: ~500 ms extra.
- **No dedicated worker.** Background tasks run on the web dyno's threads. If a task takes >30 s and the process idles out mid-way, the task may be interrupted. Fine for the tasks in this codebase (all seconds-scale).
- **Not production-grade.** Free tiers are for demos and low-traffic hobby projects. If this becomes a real journal, plan on $20–30/mo (Render Starter + Neon Pro).

### Reverting to a full-featured stack

The Celery `.delay()` interface is preserved — every task call site (`process_new_submission.delay(...)`, etc.) still works. To bring Celery back:

1. Re-add `celery[redis]` to `backend/requirements.txt`.
2. Recreate `backend/app/tasks/celery_app.py` (see git history for the original).
3. Swap each `InlineTask(fn)` in `paper_tasks.py`/`notification_tasks.py` for the original `@celery_app.task(...)` decorator.
4. Restore the `worker` and `beat` lines in `backend/Procfile`.
5. Provision a Redis instance (Upstash free or Render Redis paid), re-add a `REDIS_URL` field to `app/config.py` (it was removed alongside Celery), and set the env var on your deploy target. `docker-compose.yml` no longer includes a Redis service — restore that too if you use compose.

Similarly, to bring back on-device embeddings, re-add `sentence-transformers` and restore the `SentenceTransformer` path in `backend/app/services/ai_agent.py`.

---

## Project Structure

The project is organized into two main directories: `backend` and `frontend`.

### Backend

The backend is built using FastAPI and SQLAlchemy, and it includes the following components:

- **app/**: Contains the main application code.
  - **main.py**: Entry point of the FastAPI application.
  - **config.py**: Configuration settings using Pydantic.
  - **database.py**: Database connection setup with SQLAlchemy.
  - **models/**: Contains SQLAlchemy ORM models.
  - **schemas/**: Contains Pydantic schemas for data validation.
  - **routers/**: Contains API endpoints for various functionalities.
  - **services/**: Contains business logic for handling operations.
  - **middleware/**: Contains middleware for authentication.
  - **utils/**: Contains utility functions.

- **alembic/**: Contains migration scripts for database schema changes.
- **tests/**: Contains unit tests for the application.
- **requirements.txt**: Lists Python dependencies for the backend.
- **.env.example**: Example environment variables for configuration.

### Frontend

The frontend is built using React 18 and Tailwind CSS, and it includes the following components:

- **public/**: Contains static files, including the main HTML file.
- **src/**: Contains the source code for the React application.
  - **api/**: Contains functions for interacting with the backend API.
  - **components/**: Contains reusable components for the application.
  - **pages/**: Contains page components for routing.
  - **hooks/**: Contains custom hooks for managing state and logic.
  - **context/**: Contains context providers for state management.
  - **types/**: Contains TypeScript types used throughout the application.
  - **styles/**: Contains global styles for the application.

- **package.json**: Lists dependencies and scripts for the frontend.
- **tsconfig.json**: TypeScript configuration file.
- **tailwind.config.js**: Tailwind CSS configuration file.
- **postcss.config.js**: PostCSS configuration file.

## Setup Instructions

### Backend

1. Navigate to the `backend` directory.
2. Create a virtual environment and activate it.
3. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```
4. Set up the PostgreSQL database and update the `.env` file with the database connection details.
5. Run database migrations using Alembic:
   ```
   alembic upgrade head
   ```
6. Start the FastAPI application:
   ```
   uvicorn app.main:app --reload
   ```

### Frontend

1. Navigate to the `frontend` directory.
2. Install the required dependencies:
   ```
   npm install
   ```
3. Start the React application:
   ```
   npm start
   ```

## Usage

Once both the backend and frontend are running, you can access the application in your web browser at `http://localhost:3000`. The application allows users to manage academic journals, submit articles, and conduct reviews, with AI features for enhanced functionality.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.