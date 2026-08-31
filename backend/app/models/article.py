from sqlalchemy import Column, Integer, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import relationship
from app.database import Base

class Article(Base):
    __tablename__ = 'articles'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    abstract = Column(Text)
    content = Column(Text)
    author_id = Column(Integer, ForeignKey('users.id'))
    journal_id = Column(Integer, ForeignKey('journals.id'))

    # Postgres full-text search vector. Kept fresh at write time by the
    # database itself (see migration j6f0a8b9c4e3): the column is
    # ``GENERATED ALWAYS AS`` a ``to_tsvector('english', …)`` over
    # coalesced title/abstract/content, backed by a GIN index. Declared
    # here for ORM read-side visibility only — writes must not set it
    # (the DB rejects them), so it is intentionally omitted from the
    # article schemas.
    search_vector = Column(TSVECTOR)

    author = relationship("User", back_populates="articles")
    journal = relationship("Journal", back_populates="articles")
    ai_analysis = relationship("AIAnalysis", back_populates="article", uselist=False)


# GIN index on the tsvector so ``@@`` matches are indexed. Named to match
# the migration so a `create_all` in tests reuses the same name.
Index("ix_articles_search_vector", Article.search_vector, postgresql_using="gin")