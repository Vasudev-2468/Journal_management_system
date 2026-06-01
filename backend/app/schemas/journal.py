from pydantic import BaseModel
from typing import List, Optional

class JournalBase(BaseModel):
    title: str
    description: str
    issn: str

class JournalCreate(JournalBase):
    pass

class JournalUpdate(JournalBase):
    title: Optional[str] = None
    description: Optional[str] = None
    issn: Optional[str] = None

class Journal(JournalBase):
    id: int

    class Config:
        orm_mode = True

class JournalList(BaseModel):
    journals: List[Journal]