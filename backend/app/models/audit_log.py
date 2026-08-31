"""Structured audit trail for editor and admin actions."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, JSON

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, nullable=True, index=True)
    actor_email = Column(String(255), nullable=True, index=True)
    action = Column(String(120), nullable=False, index=True)
    target_type = Column(String(80), nullable=True, index=True)
    target_id = Column(String(120), nullable=True, index=True)
    ip_address = Column(String(50), nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
