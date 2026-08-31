"""
Reviewer Invitation Router — explicit accept / decline flow.

Historically the reviewer flow used the same per-review link token as
the review portal itself, so clicking the invitation URL landed you on
the review form and started the assignment clock implicitly. Reviewers
had no way to say "no thanks" other than ignoring the email, and
declines fell out of the audit trail entirely.

This router adds a small, unauthenticated pre-flight surface that reuses
the *existing* review link token so the invitation email URL structure
does not change on the outside — only the frontend landing behaviour
does. From the landing card the reviewer chooses:

  • Accept  → POST /reviewer-invite/{token}/accept   → 200 + review_url
  • Decline → POST /reviewer-invite/{token}/decline  → 200 + message

Endpoints
---------
GET  /reviewer-invite/{link_token}
  Public. Returns the paper title + abstract excerpt + expected deadline
  so the reviewer can see what they are being asked to review before
  they commit. Also carries ``already_accepted`` — true whenever the
  underlying Review row has already moved past ``pending`` — so the UI
  can hide the buttons and show a "continue to your review" link
  instead of re-firing accept.

POST /reviewer-invite/{link_token}/accept
  Public. Marks the assignment as accepted:
    - writes an ``audit_logs`` row with ``action='reviewer_invite.accepted'``
    - stamps ``assigned_at = utcnow()`` if the row does not already carry
      one (defensive — the model default is utcnow, but a row created
      out-of-band could still be missing it)
  Returns the URL to redirect into the existing review portal.

POST /reviewer-invite/{link_token}/decline
  Public. Optional ``{reason?: str}`` body. Marks the row
  ``status='expired'`` + ``link_used=True`` so the token is retired and
  no future access lands on the review form, and writes an
  ``audit_logs`` row with ``action='reviewer_invite.declined'`` (the
  reason lands in the meta JSON).

Token verification reuses ``verify_review_link_token`` from
``app.utils.link_tokens`` — defence-in-depth on top of the DB lookup.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import ExpiredSignatureError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.review import Review, ReviewStatus
from app.services.review_service import get_review_by_token
from app.utils.link_tokens import verify_review_link_token


router = APIRouter()


# ── Response / request models ───────────────────────────

# How much of the abstract we surface on the invitation card. The full
# abstract can be long; the reviewer only needs enough to decide whether
# the topic is in their lane.
ABSTRACT_EXCERPT_CHARS = 500


class InviteInfoResponse(BaseModel):
    paper_title: str
    paper_abstract_excerpt: str
    expected_deadline: Optional[str] = None
    already_accepted: bool


class AcceptResponse(BaseModel):
    ok: bool = True
    review_url: str


class DeclineRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)


class DeclineResponse(BaseModel):
    ok: bool = True
    message: str


# ── Helpers ─────────────────────────────────────────────

def _load_review_or_404(db: Session, link_token: str) -> Review:
    """Resolve a link_token to its Review row, or raise the correct HTTP
    error. Verifies the JWT signature after the DB hit so a
    signature-corrupt token can't sneak past the row lookup."""
    review = get_review_by_token(db, link_token)
    if review is None:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    try:
        review_id_str = verify_review_link_token(link_token)
    except ExpiredSignatureError:
        # A signature that has expired according to the JWT ``exp``. We
        # still know which row it maps to, but we must not treat the
        # token as authoritative. Report 410 so the UI shows an
        # "expired" state instead of prompting to accept.
        raise HTTPException(status_code=410, detail="This invitation link has expired.")

    if review_id_str is None:
        raise HTTPException(status_code=401, detail="Invalid invitation token.")

    if review.link_expires_at and review.link_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This invitation link has expired.")

    return review


def _abstract_excerpt(text: Optional[str]) -> str:
    """Trim the abstract to a reviewer-friendly preview. Returns an empty
    string when the submission has no abstract (defensive — the column
    is NOT NULL in the schema but a mocked row in tests can still be
    None)."""
    if not text:
        return ""
    if len(text) <= ABSTRACT_EXCERPT_CHARS:
        return text
    # Break on a whitespace boundary if possible so we don't slice in
    # the middle of a word — small nicety for the reviewer UI.
    cut = text[:ABSTRACT_EXCERPT_CHARS]
    last_space = cut.rfind(" ")
    if last_space > ABSTRACT_EXCERPT_CHARS - 80:
        cut = cut[:last_space]
    return cut.rstrip() + "…"


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _write_audit(
    db: Session,
    *,
    action: str,
    review: Review,
    ip: Optional[str],
    meta: Optional[dict] = None,
) -> None:
    """Append an ``audit_logs`` row for an invite state change. The
    reviewer_id is stored in ``target_id`` so an editor viewing the log
    can filter to a single reviewer's decline history; the review_id
    and submission_id ride along in ``meta`` for the same reason."""
    entry = AuditLog(
        actor_id=None,
        actor_email=None,
        action=action,
        target_type="review",
        target_id=str(review.id),
        ip_address=ip,
        meta={
            "review_id": str(review.id),
            "submission_id": (
                str(review.submission_id) if review.submission_id else None
            ),
            "reviewer_id": (
                str(review.reviewer_id) if review.reviewer_id else None
            ),
            **(meta or {}),
        },
    )
    db.add(entry)


# ── GET /reviewer-invite/{link_token} ───────────────────

@router.get("/{link_token}", response_model=InviteInfoResponse)
def get_invite(link_token: str, db: Session = Depends(get_db)):
    review = _load_review_or_404(db, link_token)

    submission = review.submission
    paper_title = submission.paper_title if submission else "Untitled paper"
    abstract_excerpt = _abstract_excerpt(
        submission.abstract if submission else None
    )

    # Expected deadline is derived from the token's expiry — that's the
    # window in which the reviewer is expected to complete the review.
    expected_deadline: Optional[str] = None
    if review.link_expires_at:
        expected_deadline = review.link_expires_at.isoformat()

    # ``already_accepted`` is true whenever the review row is anything
    # but ``pending`` — either the reviewer already accepted (assigned
    # then continued into the form), completed the review, or declined
    # (which we mark as ``expired``). The frontend uses this to hide
    # both action buttons and offer "continue to your review".
    already_accepted = review.status != ReviewStatus.pending

    return InviteInfoResponse(
        paper_title=paper_title,
        paper_abstract_excerpt=abstract_excerpt,
        expected_deadline=expected_deadline,
        already_accepted=already_accepted,
    )


# ── POST /reviewer-invite/{link_token}/accept ───────────

@router.post("/{link_token}/accept", response_model=AcceptResponse)
def accept_invite(link_token: str, request: Request, db: Session = Depends(get_db)):
    review = _load_review_or_404(db, link_token)

    if review.link_used:
        # Already accepted-and-completed. The review portal itself will
        # give the reviewer the definitive "already submitted" message;
        # here we just hand them the URL so the frontend can navigate.
        return AcceptResponse(review_url=f"/review/{link_token}")

    # The model default already stamps ``assigned_at`` at row creation,
    # but a row seeded via SQL migration or a fixture might be missing
    # one — belt-and-braces so the audit trail is always coherent.
    if review.assigned_at is None:
        review.assigned_at = datetime.utcnow()

    _write_audit(
        db,
        action="reviewer_invite.accepted",
        review=review,
        ip=_client_ip(request),
        meta={"invite_accepted": True},
    )

    db.commit()

    return AcceptResponse(review_url=f"/review/{link_token}")


# ── POST /reviewer-invite/{link_token}/decline ──────────

@router.post("/{link_token}/decline", response_model=DeclineResponse)
def decline_invite(
    link_token: str,
    request: Request,
    body: Optional[DeclineRequest] = None,
    db: Session = Depends(get_db),
):
    review = _load_review_or_404(db, link_token)

    # If the review has already been submitted, a decline no longer
    # makes sense — the row is completed and the reviewer's feedback is
    # already in the editor's queue. Keep the response friendly instead
    # of raising 409 so the reviewer sees a coherent thank-you either
    # way.
    if review.status == ReviewStatus.completed:
        return DeclineResponse(
            ok=True,
            message=(
                "Your review has already been submitted — thank you. "
                "There is nothing more to decline."
            ),
        )

    reason = body.reason if body and body.reason else None

    review.status = ReviewStatus.expired
    review.link_used = True

    _write_audit(
        db,
        action="reviewer_invite.declined",
        review=review,
        ip=_client_ip(request),
        meta={"reason": reason},
    )

    db.commit()

    return DeclineResponse(
        ok=True,
        message="Thank you — we've noted your decline and will approach another reviewer.",
    )
