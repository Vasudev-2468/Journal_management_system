from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class AIAnalysis(Base):
    __tablename__ = 'ai_analysis'

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey('articles.id'))
    summary = Column(String, nullable=False)
    plagiarism_score = Column(Integer, nullable=False)
    recommendations = Column(String, nullable=True)

    article = relationship("Article", back_populates="ai_analysis")
