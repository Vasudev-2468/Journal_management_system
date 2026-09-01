"""
GDPR self-serve endpoints for authenticated users.

Two capabilities are exposed under ``/gdpr``:

* ``GET  /gdpr/my-data-export`` — a single JSON bundle of everything we
  hold that is tied to the caller: the safe columns of the user row and
  every editorial/messaging artefact they've authored or received. The
  response is served with ``Content-Disposition: attachment`` so the
  browser downloads it as a file. Credential material and file blob URLs
  are deliberately withheld — see :func:`_serialize_user` and
  :func:`_serialize_manuscript_file`.

* ``POST /gdpr/delete-my-account`` — the right-to-be-forgotten path. We
  can't actually delete the row: submissions and articles carry a
  10-year editorial-record retention (privacy policy §5), so removing
  the parent would break every FK and rewrite the historical record.
  Instead we **anonymise** the user row — email/username become
  ``deleted-user-{id}-*``, personal fields are cleared, credentials are
  destroyed, and every live session is revoked. The action is idempotent:
  a second POST on an already-anonymised row is a no-op but still
  returns 200 (the client just gets the same success payload).
"""

import logging
import secrets
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.article_event import ArticleEvent
from app.models.article_review import ArticleReview
from app.models.audit_log import AuditLog
from app.models.contact_message import ContactMessage
from app.models.manuscript_file import ManuscriptFile
from app.models.manuscript_version import ManuscriptVersion
from app.models.submission import Submission
from app.models.submission_message import SubmissionMessage
from app.models.user import User
from app.models.user_session import UserSession
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Anonymisation helpers ────────────────────────────────

# Anything below is either credential material or a private token hash —
# NEVER include these in the export, and always destroy them on delete.
_SECRET_USER_FIELDS = frozenset(
    {
        "hashed_password",         # bcrypt password digest
        "mfa_otp_hash",            # bcrypt hash of the live OTP
        "recovery_codes_hashes",   # comma-joined bcrypt hashes
        "totp_secret",             # base32 shared secret
        "password_reset_token_hash",  # bcrypt hash of reset JWT
    }
)

# Personal fields cleared on self-delete (name, contact, profile).
_PERSONAL_FIELDS_TO_CLEAR = (
    "full_name",
    "first_name",
    "last_name",
    "bio",
    "whatsapp_number",
    "institution",
    "department",
    "country",
    "research_areas",
    "orcid",
    "profile_picture_url",
)

# MFA + password-reset + recovery-code + totp fields nulled on delete.
_MFA_FIELDS_TO_NULL = (
    "mfa_otp_hash",
    "mfa_otp_expires_at",
    "mfa_otp_attempts",
    "mfa_locked_until",
    "mfa_last_verified_at",
    "mfa_email_verified_at",
    "mfa_whatsapp_verified_at",
    "totp_secret",
    "totp_enrolled_at",
    "password_reset_token_hash",
    "password_reset_expires_at",
    "recovery_codes_hashes",
    "recovery_codes_generated_at",
)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _stringify(value: Any) -> Any:
    """JSON-safe scalar. Datetimes → ISO, enums → their .value, UUIDs → str."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value") and hasattr(value, "name"):
        # SQLAlchemy Enum instance.
        return value.value
    if isinstance(value, (list, tuple)):
        return [_stringify(v) for v in value]
    if isinstance(value, dict):
        return {k: _stringify(v) for k, v in value.items()}
    try:
        # UUIDs, decimals, and anything else we treat as a string.
        import uuid as _uuid

        if isinstance(value, _uuid.UUID):
            return str(value)
    except Exception:
        pass
    return value


def _serialize_user(user: User) -> dict:
    """Every safe column on the user row — never credentials or token hashes."""
    out: dict[str, Any] = {}
    for col in User.__table__.columns:
        name = col.name
        if name in _SECRET_USER_FIELDS:
            continue
        out[name] = _stringify(getattr(user, name, None))
    return out


def _serialize_submission(sub: Submission) -> dict:
    return {
        "id": str(sub.id),
        "paper_id_code": sub.paper_id_code,
        "author_name": sub.author_name,
        "author_email": sub.author_email,
        "paper_title": sub.paper_title,
        "abstract": sub.abstract,
        "keywords": list(sub.keywords) if sub.keywords else [],
        "classified_field": sub.classified_field,
        "status": sub.status.value if sub.status else None,
        "submitted_at": _iso(sub.submitted_at),
        "updated_at": _iso(sub.updated_at),
        "format_check_completed_at": _iso(sub.format_check_completed_at),
    }


def _serialize_article(article: Article) -> dict:
    return {
        "id": article.id,
        "title": article.title,
        "abstract": article.abstract,
        "content": article.content,
        "journal_id": article.journal_id,
    }


def _serialize_article_review(review: ArticleReview) -> dict:
    return {
        "id": review.id,
        "article_id": review.article_id,
        "title": review.title,
        "content": review.content,
        "rating": review.rating,
        "created_at": _iso(review.created_at),
        "updated_at": _iso(review.updated_at),
    }


def _serialize_version(version: ManuscriptVersion) -> dict:
    return {
        "id": version.id,
        "submission_id": str(version.submission_id),
        "version_number": version.version_number,
        "label": version.label,
        "cover_letter": version.cover_letter,
        "response_to_reviewers": version.response_to_reviewers,
        "change_summary": version.change_summary,
        "is_current": version.is_current,
        "created_at": _iso(version.created_at),
    }


def _serialize_manuscript_file(f: ManuscriptFile) -> dict:
    """Only the metadata the user actually needs to know they filed. The
    signed ``stored_url`` MUST NOT leave this endpoint — it grants read
    access to the object store and is meant for editorial workflows only."""
    return {
        "id": f.id,
        "version_id": f.version_id,
        "kind": f.kind,
        "original_filename": f.original_filename,
        "created_at": _iso(f.created_at),
    }


def _serialize_submission_message(msg: SubmissionMessage) -> dict:
    return {
        "id": msg.id,
        "submission_id": str(msg.submission_id),
        "sender_role": msg.sender_role,
        "sender_email": msg.sender_email,
        "body": msg.body,
        "is_from_editor": msg.is_from_editor,
        "read_by_author_at": _iso(msg.read_by_author_at),
        "read_by_editor_at": _iso(msg.read_by_editor_at),
        "created_at": _iso(msg.created_at),
    }


def _serialize_contact_message(msg: ContactMessage) -> dict:
    return {
        "id": msg.id,
        "name": msg.name,
        "email": msg.email,
        "subject": msg.subject,
        "message": msg.message,
        "is_read": msg.is_read,
        "resolved": msg.resolved,
        "created_at": _iso(msg.created_at),
    }


def _serialize_article_event(event: ArticleEvent) -> dict:
    """Per-article view/download event on one of the caller's own articles.

    We deliberately withhold ``ip_hash`` — even though it's a salted
    SHA-256 and cannot be reversed, it's still a per-visitor identifier
    the article owner has no legitimate need to see. ``user_agent`` is
    likewise omitted from the export payload (it's a fingerprintable
    surface); the columns kept below are the ones that describe the
    interaction itself — what happened to which article and when.
    """
    return {
        "id": event.id,
        "article_id": event.article_id,
        "event_type": event.event_type,
        "created_at": _iso(event.created_at),
        "referrer": event.referrer,
    }


def _serialize_session(sess: UserSession) -> dict:
    """Best-effort session summary. ``token_hash`` MUST NOT leak — it's the
    only server-side proof-of-identity for a live JWT."""
    return {
        "id": sess.id,
        "created_at": _iso(sess.created_at),
        "last_seen_at": _iso(sess.last_seen_at),
        "ip_address": sess.ip_address,
        "user_agent": sess.user_agent,
        "revoked_at": _iso(sess.revoked_at),
    }


# ── Schemas ──────────────────────────────────────────────

class DeleteAccountRequest(BaseModel):
    confirm_email: EmailStr = Field(
        ...,
        description=(
            "The caller must repeat their own email exactly (case-insensitive) "
            "to authorise the destructive action."
        ),
    )


class DeleteAccountResponse(BaseModel):
    ok: bool = True
    message: str


# ── Endpoints ────────────────────────────────────────────

@router.get("/my-data-export")
def export_my_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return everything we hold that is tied to the caller.

    Always 200. A user with no submissions / articles / reviews still gets
    a bundle — the arrays are just empty. The response is JSON but served
    with ``Content-Disposition: attachment`` so browsers download it.
    """
    email_lc = (current_user.email or "").lower()

    submissions = (
        db.query(Submission)
        .filter(Submission.author_email.ilike(email_lc))
        .order_by(Submission.submitted_at.desc())
        .all()
    )
    submission_ids = [s.id for s in submissions]

    articles = (
        db.query(Article)
        .filter(Article.author_id == current_user.id)
        .order_by(Article.id.desc())
        .all()
    )
    article_ids = [a.id for a in articles]

    # article_events are keyed by IP hash, not by user, so we can only
    # export events on articles the caller *authored* — those are their
    # own view/download stats. ``ip_hash`` is deliberately NOT surfaced
    # by ``_serialize_article_event`` (see its docstring).
    if article_ids:
        article_events = (
            db.query(ArticleEvent)
            .filter(ArticleEvent.article_id.in_(article_ids))
            .order_by(ArticleEvent.created_at.desc())
            .all()
        )
    else:
        article_events = []

    article_reviews = (
        db.query(ArticleReview)
        .filter(ArticleReview.reviewer_id == current_user.id)
        .order_by(ArticleReview.created_at.desc())
        .all()
    )

    if submission_ids:
        versions = (
            db.query(ManuscriptVersion)
            .filter(ManuscriptVersion.submission_id.in_(submission_ids))
            .order_by(ManuscriptVersion.submission_id, ManuscriptVersion.version_number)
            .all()
        )
        version_ids = [v.id for v in versions]
        files = (
            db.query(ManuscriptFile)
            .filter(ManuscriptFile.version_id.in_(version_ids))
            .order_by(ManuscriptFile.id)
            .all()
            if version_ids
            else []
        )
        # The task spec is explicit: BOTH sides of every thread that hangs
        # off a submission the caller owns. sender_role filter is deliberately
        # absent so editor + system messages come through as well.
        submission_messages = (
            db.query(SubmissionMessage)
            .filter(SubmissionMessage.submission_id.in_(submission_ids))
            .order_by(SubmissionMessage.created_at)
            .all()
        )
    else:
        versions = []
        files = []
        submission_messages = []

    contact_messages = (
        db.query(ContactMessage)
        .filter(ContactMessage.email.ilike(email_lc))
        .order_by(ContactMessage.created_at.desc())
        .all()
    )

    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id)
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )

    now = datetime.utcnow()
    bundle = {
        "exported_at": now.isoformat(),
        "user": _serialize_user(current_user),
        "submissions": [_serialize_submission(s) for s in submissions],
        "articles": [_serialize_article(a) for a in articles],
        "article_events": [_serialize_article_event(e) for e in article_events],
        "article_reviews": [_serialize_article_review(r) for r in article_reviews],
        "manuscript_versions": [_serialize_version(v) for v in versions],
        "manuscript_files": [_serialize_manuscript_file(f) for f in files],
        "submission_messages": [
            _serialize_submission_message(m) for m in submission_messages
        ],
        "contact_messages": [_serialize_contact_message(m) for m in contact_messages],
        "sessions": [_serialize_session(s) for s in sessions],
    }

    filename = f"jgair-data-export-{now.strftime('%Y%m%d')}.json"
    return JSONResponse(
        content=bundle,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Chrome/Safari respect this to keep the download from being
            # sniffed as text/html and rendered inline.
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/delete-my-account", response_model=DeleteAccountResponse)
def delete_my_account(
    body: DeleteAccountRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeleteAccountResponse:
    """Anonymise the caller's user row and revoke every live session.

    We never actually delete the row — the privacy policy commits to a
    10-year editorial-record retention, and the caller may have
    submissions/articles/reviews whose FKs point back at this ``users.id``.
    Instead we scrub every personal field, replace the email/username with
    a namespaced placeholder, and destroy every credential secret so the
    row cannot be signed into.

    Idempotent by design — running twice is fine. The confirm-email check
    still passes on the anonymised email (nobody knows that address, so a
    third-party can't trigger the second call). Editorial records are left
    untouched.
    """
    # Case-insensitive equality — the frontend echoes the email exactly
    # from the profile, but users type variants (upper-case first letter
    # from mobile autocorrect, trailing space, …).
    supplied = (body.confirm_email or "").strip().lower()
    actual = (current_user.email or "").strip().lower()
    if not supplied or supplied != actual:
        # 422 Unprocessable Entity — per spec, matches the shape of a
        # validation failure so the frontend can render the "wrong email"
        # hint next to the confirmation input.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="confirm_email does not match your account email.",
        )

    user_id = current_user.id
    # Deterministic anonymised handle for the username and a random suffix
    # in the email so a re-run doesn't collide on the unique index. Even
    # though the row is already anonymised on a second call, we still
    # generate a fresh suffix — the write is a no-op semantically but the
    # DB unique constraint is safe either way.
    suffix = secrets.token_hex(4)  # 8 hex chars
    anonymised_email = f"deleted-user-{user_id}-{suffix}@anonymised.invalid"
    anonymised_username = f"deleted-user-{user_id}"

    current_user.email = anonymised_email
    current_user.username = anonymised_username

    for field in _PERSONAL_FIELDS_TO_CLEAR:
        if hasattr(current_user, field):
            setattr(current_user, field, None)

    current_user.is_active = False

    for field in _MFA_FIELDS_TO_NULL:
        if hasattr(current_user, field):
            setattr(current_user, field, None)

    # Replace the password hash with an unguessable random string. The
    # value is NOT a valid bcrypt digest, so ``verify_password`` will raise
    # ValueError which our helper turns into a rejection — no login path
    # can succeed. Using a random string also protects the DB from an
    # attacker who trawls for rows still carrying "reused" reset tokens.
    current_user.hashed_password = f"!anonymised-{secrets.token_hex(32)}"

    # Revoke every live session in one UPDATE. UserSession.revoked_at is
    # inspected by get_current_user on every subsequent request, so any
    # JWT still held by the client is turned to a 401 immediately.
    db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    ).update({UserSession.revoked_at: datetime.utcnow()}, synchronize_session=False)

    # Scrub analytics rows on articles the caller authored. We keep the
    # row (so aggregate view / download counts survive), but null out
    # every fingerprintable column:
    #   * ``ip_hash`` — a salted SHA-256 of the visitor's IP; unreachable
    #     from outside but still per-visitor, and a right-to-be-forgotten
    #     request covers it as a best-effort scoped scrub.
    #   * ``referrer`` and ``user_agent`` — both carry residual PII (query
    #     strings, unique browser fingerprints) that the aggregate does
    #     not need.
    # Scope is intentionally narrow: only events on articles the user
    # owns. article_events for content authored by other users are not
    # this user's data to erase.
    owned_article_ids = [
        aid for (aid,) in db.query(Article.id).filter(Article.author_id == user_id).all()
    ]
    if owned_article_ids:
        db.query(ArticleEvent).filter(
            ArticleEvent.article_id.in_(owned_article_ids)
        ).update(
            {
                ArticleEvent.ip_hash: None,
                ArticleEvent.referrer: None,
                ArticleEvent.user_agent: None,
            },
            synchronize_session=False,
        )

    # Audit trail — actor is the (now-anonymised) user. We keep actor_id
    # and record only a meta flag; we do NOT log the pre-anonymisation
    # email or IP-linked personal detail beyond the platform-standard
    # request source.
    audit_ip = request.client.host if request and request.client else None
    db.add(
        AuditLog(
            actor_id=user_id,
            actor_email=anonymised_email,
            action="user.self_delete",
            target_type="user",
            target_id=str(user_id),
            ip_address=audit_ip,
            meta={"email_pattern": "anonymised"},
        )
    )

    db.commit()

    logger.info("Self-delete anonymised user id=%s", user_id)

    return DeleteAccountResponse(
        ok=True,
        message=(
            "Your account has been anonymised. Editorial records are "
            "preserved for research integrity per the privacy policy."
        ),
    )
