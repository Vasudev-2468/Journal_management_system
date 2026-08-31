"""TOTP (authenticator-app) 2FA — Google Authenticator / Authy / 1Password / etc.

Standard RFC 6238 TOTP with a 30-second step and 1-step drift tolerance
(±30 s window) so a user whose phone clock has drifted slightly still gets
in.
"""
from __future__ import annotations

import base64
import io
import logging
from datetime import datetime
from typing import Optional

import pyotp
import segno
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

# One 30-second step of drift on either side. That covers a phone whose
# clock is off by up to ~30 s, which is well within what NTP corrects for.
_VALID_WINDOW = 1


def generate_secret() -> str:
    """Return a fresh base32 secret suitable for RFC 6238 TOTP."""
    return pyotp.random_base32()


def issuer_name() -> str:
    """Issuer string shown in the authenticator app. Kept short so it fits
    on the phone screen. Prefer the journal abbreviation, fall back to the
    project code."""
    return "JGAIR"


def provisioning_uri(secret: str, account: str) -> str:
    """The otpauth:// URI encoded in the QR code."""
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=issuer_name())


def qr_code_svg(otpauth_uri: str) -> str:
    """Render the URI as an inline SVG suitable for `<img src="data:...">`.

    We use segno (pure-Python, no Pillow dependency). The SVG is small
    enough to inline as a data URI without hitting reasonable header limits.
    """
    qr = segno.make(otpauth_uri, error="M")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=6, border=2, dark="#111827", light="#ffffff")
    return buf.getvalue().decode("utf-8")


def qr_code_data_uri(otpauth_uri: str) -> str:
    svg = qr_code_svg(otpauth_uri)
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def start_enrolment(db: Session, user: User) -> str:
    """Generate a new secret and stash it on the user. Does NOT mark the user
    as enrolled — that only happens after a successful confirm."""
    secret = generate_secret()
    user.totp_secret = secret
    user.totp_enrolled_at = None
    db.commit()
    return secret


def confirm_enrolment(db: Session, user: User, code: str) -> bool:
    """Verify the first TOTP code and, on success, mark the user enrolled."""
    if not user.totp_secret:
        return False
    if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=_VALID_WINDOW):
        return False
    user.totp_enrolled_at = datetime.utcnow()
    db.commit()
    return True


def verify(db: Session, user: User, code: str) -> bool:
    """Verify a login-time TOTP code against the enrolled secret."""
    if not user.totp_secret or not user.totp_enrolled_at:
        return False
    return pyotp.TOTP(user.totp_secret).verify(code, valid_window=_VALID_WINDOW)


def is_enrolled(user: User) -> bool:
    return bool(user.totp_secret and user.totp_enrolled_at)
