import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import auth, journals, articles, reviews, ai, submissions, reviewers, editorial
from app.routers import editor_portal, editor_auth, author_auth, policies, article_reviews
from app.routers import volumes as volumes_router
from app.routers import contact as contact_router
from app.routers import announcements as announcements_router
from app.routers import board as board_router
from app.routers import platform as platform_router
from app.routers import discovery as discovery_router
from app.routers import uploads as uploads_router
from app.routers import submission_messages as submission_messages_router
from app.routers import plagiarism_admin as plagiarism_admin_router
from app.routers import jats as jats_router
from app.routers import crossref_registration as crossref_registration_router
from app.routers import authors_public as authors_public_router
from app.routers import reviewer_auth as reviewer_auth_router
from app.routers import search as search_router
from app.routers import reviews_public as reviews_public_router
from app.routers import production_public as production_public_router
from app.routers import cited_by as cited_by_router
from app.routers import article_render as article_render_router
from app.routers import article_pdf as article_pdf_router
from app.routers import feeds as feeds_router
from app.routers import kbart as kbart_router
from app.routers import reviewer_invite as reviewer_invite_router
from app.middleware import InMemoryRateLimiter, SecurityHeadersMiddleware
from app.config import settings
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.utils.helpers import hash_password

logger = logging.getLogger(__name__)


# ── Startup helpers ──────────────────────────────────────

def _run_migrations_if_requested() -> None:
    """
    Apply Alembic migrations at startup ONLY when RUN_MIGRATIONS_ON_STARTUP=1.

    The prior approach ran `alembic upgrade head` inside every uvicorn worker
    at every boot — that raced under gunicorn workers and could time out on
    Neon cold starts, then continue serving on a drifted schema. The right
    place for migrations is a deploy step (render.yaml `preDeployCommand`,
    railway.json `startCommand`, or an explicit `alembic upgrade head` in the
    Procfile) — not a request-serving process.
    """
    if os.getenv("RUN_MIGRATIONS_ON_STARTUP") != "1":
        return
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            logger.info("Alembic migrations applied successfully.")
        else:
            # Don't hide schema failures. If the DB is wrong, refuse to serve.
            logger.error("Alembic migration failed: %s", result.stderr)
            raise RuntimeError("Alembic migrations failed; refusing to start.")
    except FileNotFoundError as exc:
        logger.error("alembic binary not found: %s", exc)
        raise
    except subprocess.TimeoutExpired:
        logger.error("Alembic migration timed out after 120s")
        raise


def _seed_initial_editor_if_configured() -> None:
    """
    Provision a single initial editor account only when BOTH
    INITIAL_EDITOR_EMAIL and INITIAL_EDITOR_PASSWORD env vars are set,
    and no editor account exists yet.

    Replaces the earlier code that unconditionally created
    editor@journal.com / Editor@2024 on every deploy — a hard credential
    that shipped in git and gave anyone with the repo a valid production
    login.
    """
    email = (settings.INITIAL_EDITOR_EMAIL or "").strip()
    password = settings.INITIAL_EDITOR_PASSWORD
    if not email or not password:
        return

    db = SessionLocal()
    try:
        any_editor = (
            db.query(User)
            .filter(User.role.in_([UserRole.editor, UserRole.section_editor, UserRole.admin]))
            .first()
        )
        if any_editor:
            return  # Someone is already an editor — do not create a shadow account.

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            return

        user = User(
            username=email.split("@")[0],
            email=email,
            full_name="Initial Editor",
            hashed_password=hash_password(password),
            role=UserRole.editor,
            is_active=True,
            mfa_enabled=True,
        )
        db.add(user)
        db.commit()
        logger.info("Provisioned initial editor account: %s", email)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not seed initial editor: %s", exc)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_migrations_if_requested()
    _seed_initial_editor_if_configured()
    yield


app = FastAPI(
    title="JGAIR — Journal of Generative and Applied Intelligence Research",
    version="1.0.0",
    lifespan=lifespan,
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
app.add_middleware(SecurityHeadersMiddleware)
if os.getenv("RATE_LIMIT_ENABLED", "1") == "1":
    app.add_middleware(
        InMemoryRateLimiter,
        max_burst=int(os.getenv("RATE_LIMIT_BURST", "120")),
        refill_per_second=float(os.getenv("RATE_LIMIT_REFILL", "2.0")),
    )


# ── Health check ─────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
def read_root():
    return {"message": "Welcome to the JGAIR API"}


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
app.include_router(policies.router, prefix="/policies", tags=["policies"])
app.include_router(article_reviews.router, prefix="/article-reviews", tags=["article-reviews"])
app.include_router(volumes_router.router, prefix="/publication", tags=["publication"])
app.include_router(contact_router.router, prefix="/contact", tags=["contact"])
app.include_router(announcements_router.router, prefix="/announcements", tags=["announcements"])
app.include_router(board_router.router, prefix="/board", tags=["editorial-board"])
app.include_router(platform_router.revisions_router, prefix="/revisions", tags=["revisions"])
app.include_router(platform_router.production_router, prefix="/production", tags=["production"])
app.include_router(platform_router.special_issues_router, prefix="/special-issues", tags=["special-issues"])
app.include_router(platform_router.email_templates_router, prefix="/email-templates", tags=["email-templates"])
app.include_router(platform_router.audit_router, prefix="/audit-logs", tags=["audit-logs"])
app.include_router(platform_router.references_router, prefix="/references", tags=["references"])
app.include_router(platform_router.users_admin_router, prefix="/users-admin", tags=["users-admin"])
app.include_router(discovery_router.router, tags=["discovery"])
app.include_router(uploads_router.router, prefix="/uploads", tags=["uploads"])
app.include_router(submission_messages_router.router, prefix="/submission-messages", tags=["submission-messages"])
app.include_router(plagiarism_admin_router.router, prefix="/ai", tags=["plagiarism-admin"])
app.include_router(jats_router.router, prefix="/articles", tags=["jats"])
app.include_router(crossref_registration_router.router, prefix="/crossref", tags=["crossref"])
app.include_router(authors_public_router.router, prefix="/authors-public", tags=["authors-public"])
app.include_router(reviewer_auth_router.router, prefix="/reviewer-auth", tags=["reviewer-auth"])
app.include_router(search_router.router, prefix="/search", tags=["search"])
app.include_router(reviews_public_router.router, prefix="/reviews-public", tags=["reviews-public"])
app.include_router(production_public_router.router, prefix="/production-public", tags=["production-public"])
app.include_router(cited_by_router.router, prefix="/cited-by", tags=["cited-by"])
app.include_router(article_render_router.router, prefix="/articles", tags=["article-html"])
app.include_router(article_pdf_router.router, prefix="/articles", tags=["article-pdf"])
app.include_router(feeds_router.router, tags=["feeds"])
app.include_router(kbart_router.router, tags=["kbart"])
app.include_router(reviewer_invite_router.router, prefix="/reviewer-invite", tags=["reviewer-invite"])

# ── Static files (downloadable templates) ────────────────
_static_dir = Path(__file__).resolve().parent / "static" / "templates"
if _static_dir.is_dir():
    app.mount("/templates", StaticFiles(directory=str(_static_dir)), name="templates")
