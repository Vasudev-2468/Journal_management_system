from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, Enum as SAEnum
import enum
from app.database import Base


class CVRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class CVRequest(Base):
    __tablename__ = "cv_requests"

    id = Column(Integer, primary_key=True, index=True)
    member_name = Column(String, nullable=False)
    member_email = Column(String, nullable=False)
    requester_name = Column(String, nullable=False)
    requester_email = Column(String, nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(SAEnum(CVRequestStatus), default=CVRequestStatus.pending, nullable=False)
    approval_token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
