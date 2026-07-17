import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import auth, journals, articles, reviews, ai, submissions, reviewers, editorial
from app.routers import editor_portal, editor_auth, author_auth
from app.config import settings
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.utils.helpers import hash_password

logger = logging.getLogger(__name__)

app = FastAPI(
    title="JGAIR — Journal of Generative and Applied Intelligence Research",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────
origins = [o.strip() for o in settings.ALLOW_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup: run Alembic migrations ──────────────────────
@app.on_event("startup")
def run_migrations():
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            logger.info("Alembic migrations applied successfully.")
        else:
            logger.error("Alembic migration failed: %s", result.stderr)
    except Exception as exc:
        logger.error("Could not run Alembic migrations: %s", exc)


@app.on_event("startup")
def seed_default_editor():
    """Ensure a default editor user exists for the Editor Portal."""
    try:
        db = SessionLocal()
        existing = db.query(User).filter(User.email == "editor@journal.com").first()
        if not existing:
            user = User(
                username="chief_editor",
                email="editor@journal.com",
                full_name="Chief Editor",
                hashed_password=hash_password("Editor@2024"),
                role=UserRole.editor,
                is_active=True,
                mfa_enabled=True,
            )
            db.add(user)
            db.commit()
            logger.info("Default editor user created: editor@journal.com")
        db.close()
    except Exception as exc:
        logger.warning("Could not seed default editor: %s", exc)


# ── Health check ─────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
def read_root():
    return {"message": "Welcome to the JGAIR — Journal of Generative and Applied Intelligence Research API"}


# ── Routers ──────────────────────────────────────────────
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(journals.router, prefix="/journals", tags=["journals"])
app.include_router(articles.router, prefix="/articles", tags=["articles"])
app.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(submissions.router, prefix="/submissions", tags=["submissions"])
app.include_router(reviewers.router, prefix="/reviewers", tags=["reviewers"])
app.include_router(editorial.router, prefix="/editorial", tags=["editorial"])
app.include_router(editor_portal.router, prefix="/editor-portal", tags=["editor-portal"])
app.include_router(editor_auth.router, prefix="/editor-auth", tags=["editor-auth"])
app.include_router(author_auth.router, prefix="/author-auth", tags=["author-auth"])

# ── Static files (downloadable templates) ────────────────
_static_dir = Path(__file__).resolve().parent / "static" / "templates"
if _static_dir.is_dir():
    app.mount("/templates", StaticFiles(directory=str(_static_dir)), name="templates")