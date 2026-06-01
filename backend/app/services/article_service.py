from sqlalchemy.orm import Session
from app.models.article import Article
from app.schemas.article import ArticleCreate, ArticleUpdate

# Article Service for handling article-related operations
class ArticleService:
    def __init__(self, db: Session):
        self.db = db

    def create_article(self, article: ArticleCreate) -> Article:
        # TODO: Implement logic to create a new article
        db_article = Article(**article.dict())
        self.db.add(db_article)
        self.db.commit()
        self.db.refresh(db_article)
        return db_article

    def get_article(self, article_id: int) -> Article:
        # TODO: Implement logic to retrieve an article by ID
        return self.db.query(Article).filter(Article.id == article_id).first()

    def update_article(self, article_id: int, article: ArticleUpdate) -> Article:
        # TODO: Implement logic to update an existing article
        db_article = self.get_article(article_id)
        if db_article:
            for key, value in article.dict(exclude_unset=True).items():
                setattr(db_article, key, value)
            self.db.commit()
            self.db.refresh(db_article)
        return db_article

    def delete_article(self, article_id: int) -> bool:
        # TODO: Implement logic to delete an article
        db_article = self.get_article(article_id)
        if db_article:
            self.db.delete(db_article)
            self.db.commit()
            return True
        return False

    def get_all_articles(self) -> list[Article]:
        # TODO: Implement logic to retrieve all articles
        return self.db.query(Article).all()