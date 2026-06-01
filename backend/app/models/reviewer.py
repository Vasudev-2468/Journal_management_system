import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


class Reviewer(Base):
    __tablename__ = "reviewers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    whatsapp_number = Column(String(30))
    institution = Column(String(500))
    expertise_tags = Column(ARRAY(String), default=[])
    embedding_vector = Column(JSON)
    max_assignments = Column(Integer, nullable=False, default=5)
    current_load = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    reviews = relationship("Review", back_populates="reviewer")

    def __repr__(self):
        return f"<Reviewer(id={self.id}, name='{self.name}', load={self.current_load}/{self.max_assignments})>"
