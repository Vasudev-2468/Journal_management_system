import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class NotificationChannel(str, enum.Enum):
    email = "email"
    whatsapp = "whatsapp"


class NotificationStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_email = Column(String(255))
    recipient_whatsapp = Column(String(30))
    channel = Column(
        Enum(NotificationChannel, name="notification_channel"), nullable=False
    )
    trigger_event = Column(String(255), nullable=False, index=True)
    message_body = Column(Text, nullable=False)
    status = Column(
        Enum(NotificationStatus, name="notification_status"),
        nullable=False,
        default=NotificationStatus.pending,
        index=True,
    )
    sent_at = Column(DateTime)
    error_message = Column(Text)

    def __repr__(self):
        return f"<Notification(id={self.id}, channel={self.channel}, status={self.status})>"
