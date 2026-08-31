from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, Boolean, JSON

from app.database import Base


class PolicyPage(Base):
    """CMS-driven policy page shared by JG-102 (Ethics), JG-103 (OA + Copyright),
    JG-104 (Archiving), JG-106 (Peer Review) and JG-408 (Privacy).

    body is a structured list of sections:
      [{"id": "editors", "title": "Editors", "content": [
          "clause one prose…",
          "clause two prose…",
      ]}, …]
    Renderers walk the structure and generate anchor links + a ToC.
    """
    __tablename__ = "policy_pages"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    subtitle = Column(String(500), nullable=True)
    # JSON body — see docstring for shape.
    body = Column(JSON, nullable=False, default=list)
    # Optional plain-text footer note (e.g. "This policy is aligned with…").
    footer_note = Column(Text, nullable=True)

    version = Column(Integer, nullable=False, default=1)
    is_published = Column(Boolean, nullable=False, default=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
