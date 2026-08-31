from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.user import User
from app.schemas.article import ArticleCreate, ArticleUpdate, ArticleRead
from app.services.article_service import ArticleService
from app.services.auth_service import get_current_user
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


def _to_read(article: Article) -> ArticleRead:
    """Build the response DTO with a human-readable author display line.

    R7 — ArticleRead now carries author_display so the frontend has an
    actual byline (previously the schema rewrite dropped a phantom
    `authors: List[str]` and never replaced it, so /articles/:id rendered
    anonymously).
    """
    display: str | None = None
    author = getattr(article, "author", None)
    if author is not None:
        display = (
            getattr(author, "full_name", None)
            or " ".join(filter(None, [getattr(author, "first_name", None),
                                       getattr(author, "last_name", None)])).strip()
            or getattr(author, "username", None)
        )
    return ArticleRead(
        id=article.id,
        title=article.title,
        abstract=article.abstract,
        content=article.content,
        journal_id=article.journal_id,
        author_id=article.author_id,
        author_display=display,
    )


@router.get("/", response_model=list[ArticleRead])
def list_articles(db: Session = Depends(get_db)):
    rows = db.query(Article).options(joinedload(Article.author)).all()
    return [_to_read(a) for a in rows]


@router.get("/{article_id}", response_model=ArticleRead)
def read_article(article_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return _to_read(row)


@router.post("/", response_model=ArticleRead)
def create_article(
    article: ArticleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create an article. Author is the authenticated user."""
    created = ArticleService(db).create_article(article=article, author_id=user.id)
    # Reload with the author relationship joined so the response carries the byline.
    row = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == created.id)
        .first()
    )
    return _to_read(row)


@router.put("/{article_id}", response_model=ArticleRead)
def update_article(
    article_id: int,
    article: ArticleUpdate,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
):
    updated = ArticleService(db).update_article(article_id=article_id, article=article)
    if updated is None:
        raise HTTPException(status_code=404, detail="Article not found")
    row = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    return _to_read(row)


@router.delete("/{article_id}")
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
):
    result = ArticleService(db).delete_article(article_id=article_id)
    if not result:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"message": "Article deleted successfully"}
