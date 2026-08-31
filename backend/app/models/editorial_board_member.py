"""Editorial board roster maintained from the editor dashboard.

`category` is the coarse grouping that drives how the public page organises
members into sections. `role` remains the free-form label shown under the
member's name (e.g. "Section Editor — Generative AI").
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


BOARD_CATEGORIES = (
    "editor_in_chief",
    "associate_editor",
    "managing_editor",
    "section_editor",
    "board_member",
    "advisory",
    "technical",
)


class EditorialBoardMember(Base):
    __tablename__ = "editorial_board_members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    role = Column(String(150), nullable=False)
    category = Column(String(30), nullable=False, default="board_member", index=True)
    affiliation = Column(String(300), nullable=True)
    department = Column(String(300), nullable=True)
    country = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    orcid = Column(String(50), nullable=True)
    scholar_url = Column(String(500), nullable=True)
    scopus_id = Column(String(80), nullable=True)
    institutional_profile_url = Column(String(500), nullable=True)
    qualifications = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    expertise = Column(String(500), nullable=True)
    photo_url = Column(String(500), nullable=True)
    sort_order = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
