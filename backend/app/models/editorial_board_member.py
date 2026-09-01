"""Editorial board roster maintained from the editor dashboard.

`category` is the coarse grouping that drives how the public page organises
members into sections. `role` remains the free-form label shown under the
member's name (e.g. "Section Editor — Generative AI").
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text

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
    # Extended profile fields (JG-BM2): added for the redesigned Add
    # Board Member wizard so we don't rely on a JSON catch-all for the
    # editor-assignment settings the routing layer will read directly.
    phone = Column(String(50), nullable=True)
    keywords = Column(Text, nullable=True)
    years_editorial_experience = Column(Integer, nullable=True)
    max_active_manuscripts = Column(Integer, nullable=True)

    # Uploaded documents — URLs returned by storage_service.upload_manuscript_file.
    # certification_file_ids is a JSON array of {file_url, label} entries so
    # a member can attach multiple certifications on the self-fill page.
    photo_file_url = Column(String(1000), nullable=True)
    resume_file_url = Column(String(1000), nullable=True)
    certification_files = Column(JSON, nullable=True)

    # Invitation lifecycle: editor sends an invite → invitee opens the
    # signed link → invitee submits the profile. Mirrors the reviewer
    # onboarding shape so the two flows read the same at the DB layer.
    invited_email = Column(String(255), nullable=True, index=True)
    invitation_sent_at = Column(DateTime, nullable=True)
    invitation_completed_at = Column(DateTime, nullable=True)
    invitation_revoked_at = Column(DateTime, nullable=True)
    invitation_token_iat = Column(DateTime, nullable=True)

    sort_order = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Multi-journal scaffolding (additive). NULL = primary journal.
    # See app.services.tenancy.
    journal_id = Column(Integer, ForeignKey("journals.id"), nullable=True, index=True)
