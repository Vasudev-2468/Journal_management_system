"""JG-403 — Reader-facing article reviews.

Distinct from the peer-review flow at ``/reviews/*`` (which is token-gated
and tied to a Submission). This router exposes a lightweight rating +
notes CRUD keyed by ``article_id``.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.article_review import ArticleReview
from app.models.user import User
from app.schemas.article_review import (
    ArticleReviewCreate,
    ArticleReviewRead,
    ArticleReviewUpdate,
)
from app.services.auth_service import get_current_user

router = APIRouter()


def _display_name(user: User | None) -> str | None:
    if user is None:
        return None
    return (
        getattr(user, "full_name", None)
        or getattr(user, "username", None)
        or None
    )


def _to_read(row: ArticleReview) -> ArticleReviewRead:
    return ArticleReviewRead(
        id=row.id,
        article_id=row.article_id,
        reviewer_id=row.reviewer_id,
        reviewer_display=_display_name(row.reviewer),
        title=row.title,
        content=row.content,
        rating=row.rating,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/", response_model=List[ArticleReviewRead])
def list_all_reviews(db: Session = Depends(get_db)):
    rows = (
        db.query(ArticleReview)
        .options(joinedload(ArticleReview.reviewer))
        .order_by(ArticleReview.created_at.desc())
        .all()
    )
    return [_to_read(r) for r in rows]


@router.get("/article/{article_id}", response_model=List[ArticleReviewRead])
def list_reviews_for_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    rows = (
        db.query(ArticleReview)
        .options(joinedload(ArticleReview.reviewer))
        .filter(ArticleReview.article_id == article_id)
        .order_by(ArticleReview.created_at.desc())
        .all()
    )
    return [_to_read(r) for r in rows]


@router.get("/{review_id}", response_model=ArticleReviewRead)
def get_review(review_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(ArticleReview)
        .options(joinedload(ArticleReview.reviewer))
        .filter(ArticleReview.id == review_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return _to_read(row)


@router.post("/", response_model=ArticleReviewRead, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: ArticleReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    article = db.query(Article).filter(Article.id == payload.article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    row = ArticleReview(
        article_id=payload.article_id,
        reviewer_id=user.id,
        title=payload.title,
        content=payload.content,
        rating=payload.rating,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    row = (
        db.query(ArticleReview)
        .options(joinedload(ArticleReview.reviewer))
        .filter(ArticleReview.id == row.id)
        .first()
    )
    return _to_read(row)


@router.put("/{review_id}", response_model=ArticleReviewRead)
def update_review(
    review_id: int,
    payload: ArticleReviewUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(ArticleReview).filter(ArticleReview.id == review_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.reviewer_id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only edit your own reviews."
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    row = (
        db.query(ArticleReview)
        .options(joinedload(ArticleReview.reviewer))
        .filter(ArticleReview.id == row.id)
        .first()
    )
    return _to_read(row)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(ArticleReview).filter(ArticleReview.id == review_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.reviewer_id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only delete your own reviews."
        )
    db.delete(row)
    db.commit()
    return None
