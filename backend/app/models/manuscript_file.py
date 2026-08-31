"""Files attached to a specific manuscript version.

`kind` names the role: manuscript, figure, supplementary, response, cover_letter,
dataset, video, revised, other.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from sqlalchemy.orm import relationship

from app.database import Base


MANUSCRIPT_FILE_KINDS = (
    "manuscript",
    "figure",
    "supplementary",
    "response",
    "cover_letter",
    "dataset",
    "video",
    "revised",
    "other",
)


class ManuscriptFile(Base):
    __tablename__ = "manuscript_files"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(
        Integer,
        ForeignKey("manuscript_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind = Column(String(30), nullable=False, default="other")
    original_filename = Column(String(400), nullable=False)
    stored_url = Column(String(1024), nullable=False)
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    checksum = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    version = relationship("ManuscriptVersion", back_populates="files")
