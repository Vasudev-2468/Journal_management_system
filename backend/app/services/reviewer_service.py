import uuid
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from app.config import settings
from app.models.reviewer import Reviewer
from app.models.review import Review, ReviewStatus
from app.models.submission import Submission, SubmissionStatus


# ── Registration ─────────────────────────────────────────

def register_reviewer(
    db: Session,
    *,
    name: str,
    email: str,
    whatsapp_number: Optional[str],
    institution: Optional[str],
    expertise_tags: List[str],
) -> Reviewer:
    existing = db.query(Reviewer).filter(Reviewer.email == email).first()
    if existing:
        raise ValueError("A reviewer with this email already exists.")

    reviewer = Reviewer(
        name=name,
        email=email,
        whatsapp_number=whatsapp_number,
        institution=institution,
        expertise_tags=expertise_tags,
    )
    db.add(reviewer)
    db.commit()
    db.refresh(reviewer)
    return reviewer


def send_welcome_email(reviewer: Reviewer) -> None:
    if not settings.SENDGRID_API_KEY:
        return
    message = Mail(
        from_email=settings.SENDGRID_FROM_EMAIL,
        to_emails=reviewer.email,
        subject="Welcome to the Academic Journal Review Panel",
        html_content=(
            f"<p>Dear {reviewer.name},</p>"
            f"<p>Thank you for registering as a reviewer. "
            f"You will receive review invitations matching your expertise: "
            f"<strong>{', '.join(reviewer.expertise_tags)}</strong>.</p>"
            f"<p>Best regards,<br>Editorial Team</p>"
        ),
    )
    sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
    sg.send(message)


# ── Listing / detail ─────────────────────────────────────

def list_reviewers(
    db: Session,
    *,
    expertise_tag: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> List[Reviewer]:
    query = db.query(Reviewer)
    if expertise_tag:
        query = query.filter(Reviewer.expertise_tags.any(expertise_tag))
    if is_active is not None:
        query = query.filter(Reviewer.is_active == is_active)
    return query.order_by(Reviewer.name).all()


def get_reviewer_detail(db: Session, reviewer_id: uuid.UUID):
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        return None

    history = []
    for r in reviewer.reviews:
        submission = r.submission
        history.append(
            {
                "review_id": r.id,
                "submission_id": r.submission_id,
                "paper_title": submission.paper_title if submission else "N/A",
                "status": r.status.value,
                "assigned_at": r.assigned_at,
                "completed_at": r.completed_at,
            }
        )

    return {
        "id": reviewer.id,
        "name": reviewer.name,
        "email": reviewer.email,
        "whatsapp_number": reviewer.whatsapp_number,
        "institution": reviewer.institution,
        "expertise_tags": reviewer.expertise_tags or [],
        "current_load": reviewer.current_load,
        "max_assignments": reviewer.max_assignments,
        "is_active": reviewer.is_active,
        "created_at": reviewer.created_at,
        "review_history": history,
    }


# ── Update ───────────────────────────────────────────────

def update_reviewer(
    db: Session,
    reviewer_id: uuid.UUID,
    *,
    expertise_tags: Optional[List[str]] = None,
    max_assignments: Optional[int] = None,
    is_active: Optional[bool] = None,
) -> Optional[Reviewer]:
    reviewer = db.query(Reviewer).filter(Reviewer.id == reviewer_id).first()
    if reviewer is None:
        return None
    if expertise_tags is not None:
        reviewer.expertise_tags = expertise_tags
    if max_assignments is not None:
        reviewer.max_assignments = max_assignments
    if is_active is not None:
        reviewer.is_active = is_active
    db.commit()
    db.refresh(reviewer)
    return reviewer


# ── Assignment ───────────────────────────────────────────

def _generate_review_link_token() -> str:
    return secrets.token_urlsafe(48)


def assign_reviewers(
    db: Session,
    submission_id: uuid.UUID,
    reviewer_ids: List[uuid.UUID],
) -> List[Review]:
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        raise ValueError("Submission not found.")

    created_reviews: List[Review] = []
    for rid in reviewer_ids:
        reviewer = db.query(Reviewer).filter(Reviewer.id == rid).first()
        if reviewer is None:
            raise ValueError(f"Reviewer {rid} not found.")
        if reviewer.current_load >= reviewer.max_assignments:
            raise ValueError(
                f"Reviewer {reviewer.name} has reached max assignments "
                f"({reviewer.max_assignments})."
            )

        review = Review(
            submission_id=submission_id,
            reviewer_id=rid,
            link_token=_generate_review_link_token(),
            link_expires_at=datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS),
            status=ReviewStatus.pending,
        )
        db.add(review)

        reviewer.current_load += 1
        created_reviews.append(review)

    submission.status = SubmissionStatus.under_review
    db.commit()

    for review in created_reviews:
        db.refresh(review)

    return created_reviews
