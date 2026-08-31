from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class JournalBase(BaseModel):
    title: str
    description: Optional[str] = None


class JournalIdentityFields(BaseModel):
    """Publication identity — the JG-101 fields."""
    issn_online: Optional[str] = None
    issn_print: Optional[str] = None
    abbreviation: Optional[str] = None
    subject_area: Optional[str] = None
    language: Optional[str] = None
    start_year: Optional[int] = None
    frequency: Optional[str] = None
    publisher_name: Optional[str] = None
    publisher_address: Optional[str] = None
    licence: str = 'CC-BY-4.0'
    doi_prefix: Optional[str] = None
    oai_identifier_prefix: Optional[str] = None
    # Contact block (h4d8e5f6a2c1) — surfaced by the public ContactPage.
    phone: Optional[str] = None
    address: Optional[str] = None
    twitter_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    email_editorial: Optional[str] = None
    email_publisher: Optional[str] = None


class JournalCreate(JournalBase, JournalIdentityFields):
    pass


class JournalUpdate(BaseModel):
    """PATCH-shape: every field optional so an editor can update one at a time."""
    title: Optional[str] = None
    description: Optional[str] = None
    issn_online: Optional[str] = None
    issn_print: Optional[str] = None
    abbreviation: Optional[str] = None
    subject_area: Optional[str] = None
    language: Optional[str] = None
    start_year: Optional[int] = None
    frequency: Optional[str] = None
    publisher_name: Optional[str] = None
    publisher_address: Optional[str] = None
    licence: Optional[str] = None
    doi_prefix: Optional[str] = None
    oai_identifier_prefix: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    twitter_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    email_editorial: Optional[str] = None
    email_publisher: Optional[str] = None


class Journal(JournalBase, JournalIdentityFields):
    id: int
    is_active: bool = False

    model_config = ConfigDict(from_attributes=True)


class JournalList(BaseModel):
    journals: List[Journal]
