from sqlalchemy import Column, Integer, String, Text, ForeignKey
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

    author = relationship("User", back_populates="articles")
    journal = relationship("Journal", back_populates="articles")
    ai_analysis = relationship("AIAnalysis", back_populates="article", uselist=False)