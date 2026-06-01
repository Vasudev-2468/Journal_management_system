from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Authentication / JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 14

    # AI (Anthropic / Claude)
    ANTHROPIC_API_KEY: str = ""

    # Email (SendGrid)
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = ""

    # WhatsApp (Twilio)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""
    EDITOR_WHATSAPP_NUMBER: str = ""

    # File Storage (AWS S3)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET_NAME: str = ""
    AWS_REGION: str = "us-east-1"

    # Task Queue (Redis / Celery)
    REDIS_URL: str = "redis://localhost:6379/0"

    # DOI Registration (Crossref)
    CROSSREF_USERNAME: str = ""
    CROSSREF_PASSWORD: str = ""
    CROSSREF_DOI_PREFIX: str = ""

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"
    ALLOW_ORIGINS: str = "http://localhost:3000"

    # Plagiarism / Similarity
    SIMILARITY_THRESHOLD: float = 0.60

    class Config:
        env_file = str(_ENV_FILE)


settings = Settings()