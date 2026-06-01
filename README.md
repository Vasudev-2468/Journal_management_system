# Academic Journal Management System

This is a full-stack AI-powered academic journal management system built with FastAPI, SQLAlchemy, PostgreSQL, React 18, and Tailwind CSS. The system is designed to facilitate the management of academic journals, articles, and reviews, while also incorporating AI features for analysis and recommendations.

---

## Deployment to Railway.app

### Prerequisites

| Tool | Purpose |
|------|---------|
| [Railway CLI](https://docs.railway.app/develop/cli) | Deploy from your terminal |
| [Git](https://git-scm.com/) | Version control (Railway deploys from a repo) |
| Node.js 18+ | Required for the Railway CLI |

### Step-by-step Checklist

#### 1. Install Railway CLI

```bash
npm install -g @railway/cli
```

#### 2. Login to Railway

```bash
railway login
```

#### 3. Create a new project

```bash
railway init
```

Choose a project name when prompted (e.g., `academic-journal-system`).

#### 4. Add PostgreSQL

```bash
railway add postgresql
```

Railway auto-provisions the database and injects `DATABASE_URL` into your service.

#### 5. Add Redis

```bash
railway add redis
```

Railway injects `REDIS_URL` automatically.

#### 6. Set environment variables

Set each variable for the **backend** service. Replace placeholder values with your real credentials.

```bash
# ── Auth / JWT ──────────────────────────────────────
railway variables set SECRET_KEY="<generate-a-64-char-random-string>"
railway variables set ALGORITHM="HS256"
railway variables set JWT_EXPIRE_DAYS="14"

# ── AI (Anthropic / Claude) ─────────────────────────
railway variables set ANTHROPIC_API_KEY="sk-ant-..."

# ── Email (SendGrid) ────────────────────────────────
railway variables set SENDGRID_API_KEY="SG...."
railway variables set SENDGRID_FROM_EMAIL="noreply@yourjournal.org"

# ── WhatsApp (Twilio) ───────────────────────────────
railway variables set TWILIO_ACCOUNT_SID="AC..."
railway variables set TWILIO_AUTH_TOKEN="..."
railway variables set TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
railway variables set EDITOR_WHATSAPP_NUMBER="whatsapp:+1234567890"

# ── File Storage (AWS S3) ───────────────────────────
railway variables set AWS_ACCESS_KEY_ID="AKIA..."
railway variables set AWS_SECRET_ACCESS_KEY="..."
railway variables set AWS_S3_BUCKET_NAME="your-journal-bucket"
railway variables set AWS_REGION="us-east-1"

# ── DOI Registration (Crossref) ─────────────────────
railway variables set CROSSREF_USERNAME="..."
railway variables set CROSSREF_PASSWORD="..."
railway variables set CROSSREF_DOI_PREFIX="10.xxxxx"

# ── Frontend URL (update after step 10) ─────────────
railway variables set FRONTEND_URL="https://your-frontend.up.railway.app"
railway variables set ALLOW_ORIGINS="https://your-frontend.up.railway.app,http://localhost:3000"

# ── Plagiarism / Similarity ─────────────────────────
railway variables set SIMILARITY_THRESHOLD="0.60"
```

For the **frontend** service, set:

```bash
railway variables set REACT_APP_API_URL="https://your-backend.up.railway.app"
```

#### 7. Deploy the backend

From the project root:

```bash
cd backend
railway up
```

Railway detects the `Procfile` / `railway.json` and builds automatically. Alembic migrations run on startup.

#### 8. Deploy the Celery worker

In the Railway dashboard, create a **second service** from the same repo pointing to `backend/`. Override the start command:

```
celery -A app.tasks.celery_app worker --loglevel=info
```

#### 9. Deploy the Celery beat scheduler

Create a **third service** for beat (same repo → `backend/`):

```
celery -A app.tasks.celery_app beat --loglevel=info
```

#### 10. Deploy the frontend

```bash
cd frontend
railway up
```

Railway detects the `Dockerfile` and builds the production React bundle via nginx.

#### 11. Get public URLs

```bash
railway domain
```

Run this for each service to assign a `*.up.railway.app` domain. Then update `FRONTEND_URL` / `ALLOW_ORIGINS` / `REACT_APP_API_URL` with the actual domains.

#### 12. Generate initial Alembic migration (first time only)

Before your first deploy (locally, with `DATABASE_URL` pointing to your Railway PostgreSQL):

```bash
cd backend
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Commit the generated migration file in `alembic/versions/` so Railway applies it on deploy.

### Service Architecture on Railway

```
┌─────────────────────────────────────────────────┐
│                  Railway Project                 │
├──────────────┬──────────┬──────────┬─────────────┤
│   Backend    │  Worker  │   Beat   │  Frontend   │
│  (FastAPI)   │ (Celery) │ (Celery) │  (nginx)    │
│  port $PORT  │          │          │  port $PORT  │
├──────────────┴──────────┴──────────┴─────────────┤
│         PostgreSQL          │        Redis        │
│     (auto DATABASE_URL)     │  (auto REDIS_URL)   │
└─────────────────────────────┴─────────────────────┘
```

### Verifying the deployment

```bash
# Health check
curl https://your-backend.up.railway.app/health

# Expected response:
# {"status": "ok", "timestamp": "2026-04-16T12:00:00+00:00"}
```

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