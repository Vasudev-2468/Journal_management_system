import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.access_log import AccessLog
from app.models.production_stage import ProductionRecord
from app.models.review import Review, ReviewStatus, OverallRecommendation
from app.models.reviewer import Reviewer
from app.models.submission import Submission, SubmissionStatus


# ── Access: validate link token row ─────────────────────

def get_review_by_token(db: Session, link_token: str) -> Optional[Review]:
    return db.query(Review).filter(Review.link_token == link_token).first()


def log_access(db: Session, review: Review, ip_address: str) -> None:
    entry = AccessLog(
        review_id=review.id,
        link_token=review.link_token,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()


# ── Submit review ────────────────────────────────────────

def submit_review(
    db: Session,
    review: Review,
    *,
    score_originality: float,
    score_technical: float,
    score_relevance: float,
    score_clarity: float,
    score_references: float,
    overall_recommendation: str,
    comments_to_authors: str,
    comments_to_editor: Optional[str],
) -> Review:
    review.score_originality = score_originality
    review.score_technical = score_technical
    review.score_relevance = score_relevance
    review.score_clarity = score_clarity
    review.score_references = score_references
    review.overall_recommendation = OverallRecommendation(overall_recommendation)
    review.comments_to_authors = comments_to_authors
    review.comments_to_editor = comments_to_editor
    review.status = ReviewStatus.completed
    review.completed_at = datetime.utcnow()
    review.link_used = True

    # Decrement reviewer current_load
    if review.reviewer_id:
        reviewer = db.query(Reviewer).filter(Reviewer.id == review.reviewer_id).first()
        if reviewer and reviewer.current_load > 0:
            reviewer.current_load -= 1

    db.commit()
    db.refresh(review)
    return review


def all_reviews_completed(db: Session, submission_id: uuid.UUID) -> bool:
    pending = (
        db.query(Review)
        .filter(
            Review.submission_id == submission_id,
            Review.status != ReviewStatus.completed,
        )
        .count()
    )
    return pending == 0


# ── Editor: get reviews for a submission ─────────────────

def get_submission_reviews(db: Session, submission_id: uuid.UUID):
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        return None

    reviews = (
        db.query(Review)
        .filter(Review.submission_id == submission_id)
        .order_by(Review.assigned_at)
        .all()
    )

    details = []
    completed_scores: dict[str, list[float]] = {
        "score_originality": [],
        "score_technical": [],
        "score_relevance": [],
        "score_clarity": [],
        "score_references": [],
    }

    for r in reviews:
        reviewer_name = None
        if r.reviewer:
            reviewer_name = r.reviewer.name

        details.append(
            {
                "review_id": r.id,
                "reviewer_name": reviewer_name,
                "status": r.status.value,
                "score_originality": r.score_originality,
                "score_technical": r.score_technical,
                "score_relevance": r.score_relevance,
                "score_clarity": r.score_clarity,
                "score_references": r.score_references,
                "overall_recommendation": (
                    r.overall_recommendation.value if r.overall_recommendation else None
                ),
                "comments_to_authors": r.comments_to_authors,
                "comments_to_editor": r.comments_to_editor,
                "assigned_at": r.assigned_at,
                "completed_at": r.completed_at,
            }
        )

        if r.status == ReviewStatus.completed:
            for key in completed_scores:
                val = getattr(r, key)
                if val is not None:
                    completed_scores[key].append(val)

    avg = {}
    for key, vals in completed_scores.items():
        avg[key] = round(sum(vals) / len(vals), 2) if vals else None

    completed_count = sum(1 for r in reviews if r.status == ReviewStatus.completed)

    return {
        "submission_id": submission.id,
        "paper_title": submission.paper_title,
        "reviews": details,
        "average_scores": avg,
        "completed_count": completed_count,
        "total_count": len(reviews),
    }


# ── Editor: record decision ─────────────────────────────

def record_decision(
    db: Session,
    submission_id: uuid.UUID,
    decision: str,
) -> Optional[Submission]:
    submission = (
        db.query(Submission).filter(Submission.id == submission_id).first()
    )
    if submission is None:
        return None

    # SubmissionStatus doesn't yet split minor/major revision — JG-407 is the
    # right place to add that. For now, both collapse onto revision_requested
    # for the state machine, but the DecisionRequest schema keeps them
    # distinguishable so downstream notifications (agent5_notification,
    # email_service) can render the correct label to the author.
    status_map = {
        "accepted": SubmissionStatus.accepted,
        "rejected": SubmissionStatus.rejected,
        "revision_requested": SubmissionStatus.revision_requested,
        "minor_revision": SubmissionStatus.revision_requested,
        "major_revision": SubmissionStatus.revision_requested,
    }
    submission.status = status_map[decision]

    # JG — when an editor lands the `accepted` decision, kick off the
    # post-acceptance production pipeline so authors don't have to wait for
    # a separate editor click to move the paper into copy editing. Only
    # create a fresh row if one hasn't already been opened for this
    # submission (e.g. an editor manually seeded it via the production
    # queue), so we never clobber existing stage/notes/DOI state.
    if decision == "accepted":
        existing_production = (
            db.query(ProductionRecord)
            .filter(ProductionRecord.submission_id == submission.id)
            .first()
        )
        if existing_production is None:
            db.add(
                ProductionRecord(
                    submission_id=submission.id,
                    stage="copy_editing",
                )
            )

    db.commit()
    db.refresh(submission)
    return submission


# ── Overdue review helpers (JG editor dashboard) ────────
#
# A review is "overdue" when its assignment window has expired but the
# reviewer never submitted — i.e. status is still `pending` and
# `link_expires_at` is in the past. Editors need both a count (for the
# sidebar chip badge) and the concrete submission IDs (to filter the
# submissions list to just the ones needing intervention).

def count_overdue_reviews(db: Session) -> int:
    """Return the number of Review rows that are pending past their expiry.

    Kept in the service layer so router endpoints stay thin and can reuse
    the same predicate wherever an overdue count is displayed.
    """
    now = datetime.utcnow()
    return (
        db.query(Review)
        .filter(
            Review.status == ReviewStatus.pending,
            Review.link_expires_at < now,
        )
        .count()
    )


def submissions_with_overdue_reviews(db: Session) -> List[uuid.UUID]:
    """Return distinct submission IDs whose reviews include at least one overdue row."""
    now = datetime.utcnow()
    rows = (
        db.query(Review.submission_id)
        .filter(
            Review.status == ReviewStatus.pending,
            Review.link_expires_at < now,
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows if row[0] is not None]