from sqlalchemy.orm import Session
from app.models.article import Article
from app.schemas.article import ArticleCreate, ArticleUpdate


class ArticleService:
    def __init__(self, db: Session):
        self.db = db

    def create_article(self, article: ArticleCreate, author_id: int) -> Article:
        payload = article.model_dump(exclude_unset=True, exclude={"author_id"})
        db_article = Article(**payload, author_id=author_id)
        self.db.add(db_article)
        self.db.commit()
        self.db.refresh(db_article)
        return db_article

    def get_article(self, article_id: int) -> Article:
        return self.db.query(Article).filter(Article.id == article_id).first()

    def update_article(self, article_id: int, article: ArticleUpdate) -> Article:
        db_article = self.get_article(article_id)
        if db_article:
            for key, value in article.model_dump(exclude_unset=True).items():
                setattr(db_article, key, value)
            self.db.commit()
            self.db.refresh(db_article)
        return db_article

    def delete_article(self, article_id: int) -> bool:
        db_article = self.get_article(article_id)
        if db_article:
            self.db.delete(db_article)
            self.db.commit()
            return True
        return False

    def get_all_articles(self) -> list[Article]:
        return self.db.query(Article).all()
