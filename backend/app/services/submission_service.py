import uuid
from typing import Optional
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.services.storage_service import upload_fileobj
from sqlalchemy import func

from app.config import settings
from app.models.submission import Submission, SubmissionStatus
from app.models.notification import Notification, NotificationChannel, NotificationStatus


def upload_pdf_to_s3(file: UploadFile, submission_id: uuid.UUID) -> str:
    """Upload a PDF to cloud storage (S3 or local fallback) and return the storage URL."""
    key = f"submissions/{submission_id}/original.pdf"
    return upload_fileobj(file.file, key, content_type="application/pdf")


def create_submission(
    db: Session,
    *,
    paper_title: str,
    author_name: str,
    author_email: str,
    abstract: str,
    keywords: list[str],
    research_category: str,
    pdf_s3_key: str,
) -> Submission:
    submission = Submission(
        author_name=author_name,
        author_email=author_email,
        paper_title=paper_title,
        abstract=abstract,
        keywords=keywords,
        classified_field=research_category,
        pdf_url=pdf_s3_key,
        status=SubmissionStatus.pending_classification,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def get_submission_status(db: Session, submission_id: uuid.UUID):
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        return None
    review_count = len(submission.reviews) if submission.reviews else 0
    return {
        "submission_id": submission.id,
        "status": submission.status.value,
        "classified_field": submission.classified_field,
        "review_count": review_count,
    }


def list_submissions(
    db: Session,
    *,
    status: Optional[str] = None,
    field: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(Submission)

    if status:
        query = query.filter(Submission.status == status)
    if field:
        query = query.filter(Submission.classified_field == field)
    if date_from:
        query = query.filter(Submission.submitted_at >= date_from)
    if date_to:
        query = query.filter(Submission.submitted_at <= date_to)

    total = query.count()
    submissions = (
        query.order_by(Submission.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for s in submissions:
        items.append(
            {
                "id": s.id,
                "author_name": s.author_name,
                "author_email": s.author_email,
                "paper_title": s.paper_title,
                "classified_field": s.classified_field,
                "status": s.status.value,
                "submitted_at": s.submitted_at,
                "reviewer_count": len(s.reviews) if s.reviews else 0,
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


def override_classification(
    db: Session,
    submission_id: uuid.UUID,
    classified_field: str,
    classification_confidence: float,
) -> Optional[Submission]:
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        return None

    old_field = submission.classified_field
    submission.classified_field = classified_field
    submission.classification_confidence = classification_confidence

    # Log override as a notification
    notification = Notification(
        recipient_email=submission.author_email,
        channel=NotificationChannel.email,
        trigger_event="classification_override",
        message_body=(
            f"Classification overridden for '{submission.paper_title}': "
            f"'{old_field}' → '{classified_field}' (confidence {classification_confidence})"
        ),
        status=NotificationStatus.pending,
    )
    db.add(notification)
    db.commit()
    db.refresh(submission)
    return submission
