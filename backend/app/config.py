from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────
    DATABASE_URL: str

    # ── Authentication / JWT ─────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 14

    # ── AI provider (currently OpenAI is the only one wired in) ──
    # services/ai_agent.py uses OPENAI_API_KEY for gpt-4o-mini + embeddings.
    OPENAI_API_KEY: str = ""

    # Optional legacy keys — kept nullable so config still loads if they were
    # documented in an old .env. Not read anywhere in app/ today. Delete when
    # the multi-provider agent layer lands (JG-306, JG-311).
    ANTHROPIC_API_KEY: str = ""
    VOYAGE_API_KEY: str = ""

    # ── Email (Gmail SMTP primary, Brevo/SendGrid fallback) ─
    # Preference order in email_service._send_and_log:
    #   1. Gmail SMTP (GMAIL_SMTP_PASSWORD set)  — recommended for dev,
    #      avoids Gmail's DMARC reject on From: @gmail.com through
    #      third-party relays.
    #   2. Brevo SMTP (BREVO_SMTP_KEY set)       — 300 mails/day free tier.
    #   3. SendGrid HTTP API                     — legacy fallback.
    GMAIL_SMTP_HOST: str = "smtp.gmail.com"
    GMAIL_SMTP_PORT: int = 587
    GMAIL_SMTP_USER: str = ""
    GMAIL_SMTP_PASSWORD: str = ""

    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    BREVO_SMTP_USER: str = ""
    BREVO_SMTP_KEY: str = ""

    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = ""

    # ── WhatsApp (Twilio) ────────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""
    EDITOR_WHATSAPP_NUMBER: str = ""

    # ── File Storage (S3-compatible: AWS S3 or Cloudflare R2) ──
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET_NAME: str = ""
    AWS_REGION: str = "us-east-1"

    # ── Frontend / CORS ─────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"
    ALLOW_ORIGINS: str = "http://localhost:3000"

    # Public URL where the backend API itself is reachable — used to build
    # confirmation links inside outgoing emails (CV approval, etc.). Set to
    # the deployed backend URL in production.
    PUBLIC_API_URL: str = "http://localhost:8000"

    # Editorial-office inbox address — CC on CV access requests and other
    # administrative correspondence. Blank means "no copy is sent".
    EDITORIAL_INBOX_EMAIL: str = ""

    # ── Plagiarism / Similarity thresholds ──────────────
    SIMILARITY_THRESHOLD: float = 0.60

    # ── Initial editor seed (opt-in) ────────────────────
    # If both are set, main.py will seed a single editor with these creds when
    # no editor exists yet. Leave blank in production and provision editors
    # manually. This exists so a fresh checkout still has a way in.
    INITIAL_EDITOR_EMAIL: str = ""
    INITIAL_EDITOR_PASSWORD: str = ""

    # ── Editor MFA policy ───────────────────────────────
    # When True, editor_auth logs OTPs to the console AND returns them in the
    # login response so a fresh checkout without email/SMS still lets you
    # sign in. FAIL-SAFE DEFAULT: False. Any operator wanting dev mode must
    # opt in explicitly (EDITOR_DEV_MODE=true in the local .env). Prior
    # default was True — a Render/Railway deploy that forgot to flip it
    # would silently leak OTPs into log-shipping tools.
    EDITOR_DEV_MODE: bool = False

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()
