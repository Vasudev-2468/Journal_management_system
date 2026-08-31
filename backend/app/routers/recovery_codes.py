"""
Two-factor recovery codes — authenticated router for the current user.

Endpoints:

  * ``POST /recovery-codes/generate``
      Mint a fresh set of 8 one-time backup codes, hash each with bcrypt,
      store them comma-joined on the user row, and return the plaintext
      once. This is the only time the plaintext leaves the server.
      Calling this again voids every remaining code.

  * ``GET  /recovery-codes/count``
      ``{total: 8, remaining: int}`` — how many codes have not yet been
      marked ``USED``. Read-only; safe to poll from settings pages.

  * ``POST /recovery-codes/consume``
      Verify a single code against the stored hashes. On the first
      match the slot is overwritten with the literal string ``"USED"``
      (position preserved for audit; hash gone). On no match the caller
      gets a generic 401.

The consume helper is also exposed as ``consume_recovery_code(user, code)``
so ``otp_service`` can offer recovery codes as an alternative to the TOTP
during the MFA challenge without re-implementing the format check.
"""

import logging
import secrets
from datetime import datetime
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

TOTAL_CODES = 8
CODE_GROUP_LEN = 4
CODE_GROUPS = 3   # xxxx-xxxx-xxxx
# Crockford-style base32 minus ambiguous letters (I, L, O, U). Twelve chars
# times log2(28) ≈ 57.7 bits of entropy per code — well above the 5-tries
# lockout threshold on any realistic attacker budget.
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
_USED_MARKER = "USED"


# ── Schemas ──────────────────────────────────────────────

class RecoveryCodesResponse(BaseModel):
    codes: list[str]
    generated_at: datetime
    message: str = (
        "Store these codes somewhere safe. Each one can be used once and "
        "they will not be shown again."
    )


class RecoveryCodesCountResponse(BaseModel):
    total: int
    remaining: int


class ConsumeRecoveryCodeRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)


class ConsumeResponse(BaseModel):
    ok: bool = True


# ── Helpers ──────────────────────────────────────────────

def _generate_code() -> str:
    """Return a single ``xxxx-xxxx-xxxx`` code using a CSPRNG."""
    parts = []
    for _ in range(CODE_GROUPS):
        parts.append(
            "".join(secrets.choice(_ALPHABET) for _ in range(CODE_GROUP_LEN))
        )
    return "-".join(parts)


def _hash_code(code: str) -> str:
    return bcrypt.hashpw(
        code.upper().encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def _verify_code(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.upper().encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Corrupt/legacy row — treat as non-match rather than 500.
        return False


def _split_hashes(user: User) -> list[str]:
    raw = user.recovery_codes_hashes or ""
    if not raw:
        return []
    return raw.split(",")


def _remaining(user: User) -> int:
    return sum(1 for h in _split_hashes(user) if h and h != _USED_MARKER)


def _normalize_input(code: str) -> str:
    """Users paste with or without hyphens, in any case. Store/verify
    canonically to keep the UX forgiving without weakening the entropy."""
    return code.strip().replace(" ", "").replace("-", "").upper()


def consume_recovery_code(db: Session, user: User, raw_code: str) -> bool:
    """
    Attempt to spend a single recovery code.

    Also exported (importable from ``otp_service``) so the MFA challenge
    can accept a recovery code as a stand-in for the TOTP. Returns True
    on success (slot marked ``USED`` and committed), False otherwise.
    """
    stripped = _normalize_input(raw_code)
    if not stripped:
        return False
    # Re-format to include hyphens so the bcrypt input matches what we
    # originally hashed.
    if len(stripped) != CODE_GROUP_LEN * CODE_GROUPS:
        return False
    canonical = "-".join(
        stripped[i : i + CODE_GROUP_LEN]
        for i in range(0, len(stripped), CODE_GROUP_LEN)
    )

    hashes = _split_hashes(user)
    if not hashes:
        return False
    for idx, h in enumerate(hashes):
        if not h or h == _USED_MARKER:
            continue
        if _verify_code(canonical, h):
            hashes[idx] = _USED_MARKER
            user.recovery_codes_hashes = ",".join(hashes)
            db.commit()
            return True
    return False


# ── Endpoints ────────────────────────────────────────────

@router.post("/generate", response_model=RecoveryCodesResponse)
def generate_recovery_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecoveryCodesResponse:
    """Regenerate the current user's 8 backup codes. Any previously
    outstanding codes — including unused ones — are voided by the
    overwrite. Plaintext is returned exactly once; the client is
    responsible for showing/downloading it before navigating away."""
    codes = [_generate_code() for _ in range(TOTAL_CODES)]
    hashes = [_hash_code(c) for c in codes]

    now = datetime.utcnow()
    current_user.recovery_codes_hashes = ",".join(hashes)
    current_user.recovery_codes_generated_at = now
    db.commit()

    logger.info(
        "Recovery codes regenerated for user %s (id=%s)",
        current_user.email,
        current_user.id,
    )
    return RecoveryCodesResponse(codes=codes, generated_at=now)


@router.get("/count", response_model=RecoveryCodesCountResponse)
def get_recovery_codes_count(
    current_user: User = Depends(get_current_user),
) -> RecoveryCodesCountResponse:
    return RecoveryCodesCountResponse(
        total=TOTAL_CODES,
        remaining=_remaining(current_user),
    )


@router.post("/consume", response_model=ConsumeResponse)
def consume_recovery_code_endpoint(
    body: ConsumeRecoveryCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConsumeResponse:
    ok = consume_recovery_code(db, current_user, body.code)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That recovery code is not valid.",
        )
    return ConsumeResponse(ok=True)
