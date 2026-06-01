from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.article import Article
from app.schemas.article import ArticleCreate, ArticleUpdate
from app.services.article_service import ArticleService

router = APIRouter()


@router.post("/")
def create_article(article: ArticleCreate, db: Session = Depends(get_db)):
    svc = ArticleService(db)
    return svc.create_article(article=article)


@router.get("/{article_id}")
def read_article(article_id: int, db: Session = Depends(get_db)):
    svc = ArticleService(db)
    result = svc.get_article(article_id=article_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return result


@router.put("/{article_id}")
def update_article(article_id: int, article: ArticleUpdate, db: Session = Depends(get_db)):
    svc = ArticleService(db)
    result = svc.update_article(article_id=article_id, article=article)
    if result is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return result


@router.delete("/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    svc = ArticleService(db)
    result = svc.delete_article(article_id=article_id)
    if not result:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"message": "Article deleted successfully"}