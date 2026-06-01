"""
OTP (One-Time Password) service for Editor Portal MFA.

Every editor portal access requires a fresh OTP sent via email or WhatsApp.
OTP is 6 digits, expires in 5 minutes, max 5 failed attempts before lockout.
"""

import logging
import secrets
from datetime import datetime, timedelta

import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.services.email_service import _send_and_log, _wrap
from app.services.whatsapp_service import _send_and_log as wa_send_and_log

logger = logging.getLogger(__name__)

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 5
LOCKOUT_MINUTES = 30


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    # Use secrets for CSPRNG — never random/randint
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def _hash_otp(otp: str) -> str:
    """Hash OTP with bcrypt so it's never stored in plain text."""
    return bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_otp_hash(otp: str, hashed: str) -> bool:
    """Verify OTP against bcrypt hash."""
    return bcrypt.checkpw(otp.encode("utf-8"), hashed.encode("utf-8"))


def is_user_locked(user: User) -> bool:
    """Check if user is locked out from too many failed OTP attempts."""
    if user.mfa_locked_until and user.mfa_locked_until > datetime.utcnow():
        return True
    return False


def create_and_send_otp(db: Session, user: User, channel: str = "email") -> dict:
    """
    Generate OTP, store its hash, and send via the chosen channel.

    Args:
        channel: "email" or "whatsapp"

    Returns:
        dict with status info (never includes the OTP itself in production)
    """
    # Check lockout
    if is_user_locked(user):
        remaining = (user.mfa_locked_until - datetime.utcnow()).seconds // 60
        return {
            "success": False,
            "error": f"Account locked. Try again in {remaining + 1} minutes.",
            "locked": True,
        }

    otp = generate_otp()
    otp_hash = _hash_otp(otp)

    # Store hash + expiry on user (never store plain OTP)
    user.mfa_otp_hash = otp_hash
    user.mfa_otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    user.mfa_otp_attempts = 0
    # Clear lockout if expired
    if user.mfa_locked_until and user.mfa_locked_until <= datetime.utcnow():
        user.mfa_locked_until = None
    db.commit()

    # Send OTP
    sent = False
    if channel == "whatsapp" and user.whatsapp_number:
        sent = _send_otp_whatsapp(user, otp)
    else:
        sent = _send_otp_email(user, otp)
        channel = "email"  # fallback

    # Dev mode: if email/WhatsApp is not configured, log OTP to console
    # and include it in response so the frontend can display it
    dev_otp = None
    if not sent:
        logger.warning(
            "======== DEV MODE OTP ========\n"
            "  User:  %s\n"
            "  OTP:   %s\n"
            "  Expires in %d minutes\n"
            "==============================",
            user.email, otp, OTP_EXPIRY_MINUTES,
        )
        sent = True  # Allow flow to continue in dev
        dev_otp = otp  # Only set in dev when no email service configured

    result = {
        "success": sent,
        "channel": channel,
        "expires_in_seconds": OTP_EXPIRY_MINUTES * 60,
        "masked_destination": _mask_destination(user, channel),
    }
    if dev_otp:
        result["dev_otp"] = dev_otp
    return result


def verify_otp(db: Session, user: User, otp_input: str) -> dict:
    """
    Verify the OTP input against the stored hash.

    Returns:
        dict with success status and error info if failed.
    """
    # Check lockout
    if is_user_locked(user):
        remaining = (user.mfa_locked_until - datetime.utcnow()).seconds // 60
        return {
            "success": False,
            "error": f"Account locked due to too many failed attempts. Try again in {remaining + 1} minutes.",
            "locked": True,
        }

    # Check if OTP exists
    if not user.mfa_otp_hash:
        return {"success": False, "error": "No OTP has been generated. Please request a new code."}

    # Check expiry
    if user.mfa_otp_expires_at and user.mfa_otp_expires_at < datetime.utcnow():
        user.mfa_otp_hash = None
        user.mfa_otp_expires_at = None
        db.commit()
        return {"success": False, "error": "OTP has expired. Please request a new code."}

    # Verify
    if _verify_otp_hash(otp_input, user.mfa_otp_hash):
        # Success — clear OTP and update verification timestamp
        user.mfa_otp_hash = None
        user.mfa_otp_expires_at = None
        user.mfa_otp_attempts = 0
        user.mfa_last_verified_at = datetime.utcnow()
        db.commit()
        return {"success": True}
    else:
        # Failed attempt
        user.mfa_otp_attempts = (user.mfa_otp_attempts or 0) + 1
        if user.mfa_otp_attempts >= MAX_OTP_ATTEMPTS:
            user.mfa_locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
            user.mfa_otp_hash = None
            user.mfa_otp_expires_at = None
            db.commit()
            logger.warning("User %s locked out after %d failed OTP attempts", user.email, MAX_OTP_ATTEMPTS)
            return {
                "success": False,
                "error": f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes.",
                "locked": True,
            }
        db.commit()
        remaining = MAX_OTP_ATTEMPTS - user.mfa_otp_attempts
        return {
            "success": False,
            "error": f"Invalid code. {remaining} attempt(s) remaining.",
            "attempts_remaining": remaining,
        }


# ── OTP delivery ─────────────────────────────────────────

def _send_otp_email(user: User, otp: str) -> bool:
    """Send OTP via email with branded template."""
    subject = "Your Editor Portal Verification Code"
    body = _wrap(f"""
    <p>Dear {user.full_name or user.username},</p>

    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#1e40af;color:#ffffff;
                  font-size:32px;font-weight:700;letter-spacing:8px;
                  padding:16px 32px;border-radius:8px;font-family:monospace;">
        {otp}
      </div>
    </div>

    <p style="text-align:center;color:#6b7280;">
      This code expires in <strong>{OTP_EXPIRY_MINUTES} minutes</strong>.
    </p>

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;
                padding:12px 16px;border-radius:6px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#991b1b;">
        ⚠ If you did not request this code, someone may be trying to access
        your account. Do not share this code with anyone.
      </p>
    </div>

    <p style="font-size:12px;color:#9ca3af;">
      This is an automated security message from the Academic Journal Editor Portal.
    </p>
    """)
    return _send_and_log(user.email, subject, body, "editor_mfa_otp_email")


def _send_otp_whatsapp(user: User, otp: str) -> bool:
    """Send OTP via WhatsApp."""
    body = (
        f"🔐 Editor Portal Verification Code\n\n"
        f"Your code: *{otp}*\n\n"
        f"Expires in {OTP_EXPIRY_MINUTES} minutes.\n"
        f"Do NOT share this code with anyone."
    )
    return wa_send_and_log(user.whatsapp_number, body, "editor_mfa_otp_whatsapp")


# ── Helpers ──────────────────────────────────────────────

def _mask_destination(user: User, channel: str) -> str:
    """Mask email/phone for display: j***@example.com or +91****5678"""
    if channel == "whatsapp" and user.whatsapp_number:
        num = user.whatsapp_number.replace("whatsapp:", "")
        if len(num) > 4:
            return num[:3] + "****" + num[-4:]
        return "****" + num[-2:]
    email = user.email
    at_idx = email.index("@")
    if at_idx <= 1:
        return "*@" + email[at_idx + 1:]
    return email[0] + "***" + email[at_idx - 1:]
