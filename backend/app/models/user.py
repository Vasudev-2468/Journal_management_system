import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    author = "author"
    editor = "editor"
    section_editor = "section_editor"
    admin = "admin"
    # Extended editorial roles — kept alongside the legacy set so any
    # existing role check that whitelists `editor / section_editor / admin`
    # continues to pass without modification.
    super_admin = "super_admin"
    managing_editor = "managing_editor"
    production_editor = "production_editor"


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    role = Column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.author,
        index=True,
    )
    whatsapp_number = Column(String(30))

    # MFA fields
    mfa_enabled = Column(Boolean, nullable=False, default=True)
    mfa_otp_hash = Column(String(255))          # bcrypt hash of current OTP
    mfa_otp_expires_at = Column(DateTime)       # OTP expiry
    mfa_otp_attempts = Column(Integer, default=0)  # failed attempts counter
    mfa_locked_until = Column(DateTime)         # lockout timestamp
    mfa_last_verified_at = Column(DateTime)     # last successful MFA
    mfa_email_verified_at = Column(DateTime)    # author 2FA: email step done
    mfa_whatsapp_verified_at = Column(DateTime) # author 2FA: whatsapp step done

    # TOTP (authenticator-app 2FA) — required for every author.
    totp_secret = Column(String(64))            # base32-encoded shared secret
    totp_enrolled_at = Column(DateTime)         # first successful enrolment

    # Author profile fields
    institution = Column(String(500))
    orcid = Column(String(50))
    research_areas = Column(String(1000))
    first_name = Column(String(100))
    last_name = Column(String(100))
    country = Column(String(100))
    department = Column(String(500))
    bio = Column(String)
    profile_picture_url = Column(String(1024))

    articles = relationship("Article", back_populates="author")