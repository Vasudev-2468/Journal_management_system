from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.journal import Journal
from ..schemas.journal import JournalCreate, JournalUpdate, Journal as JournalResponse

router = APIRouter()

@router.post("/", response_model=JournalResponse)
def create_journal(journal: JournalCreate, db: Session = Depends(get_db)):
    db_journal = Journal(**journal.dict())
    db.add(db_journal)
    db.commit()
    db.refresh(db_journal)
    return db_journal

@router.get("/{journal_id}", response_model=JournalResponse)
def read_journal(journal_id: int, db: Session = Depends(get_db)):
    journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    return journal

@router.put("/{journal_id}", response_model=JournalResponse)
def update_journal(journal_id: int, journal: JournalUpdate, db: Session = Depends(get_db)):
    db_journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if db_journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    for key, value in journal.dict(exclude_unset=True).items():
        setattr(db_journal, key, value)
    db.commit()
    db.refresh(db_journal)
    return db_journal

@router.delete("/{journal_id}", response_model=dict)
def delete_journal(journal_id: int, db: Session = Depends(get_db)):
    db_journal = db.query(Journal).filter(Journal.id == journal_id).first()
    if db_journal is None:
        raise HTTPException(status_code=404, detail="Journal not found")
    db.delete(db_journal)
    db.commit()
    return {"detail": "Journal deleted successfully"}