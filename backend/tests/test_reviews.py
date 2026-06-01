from fastapi import FastAPI, HTTPException
from sqlalchemy.orm import Session
from app.models.review import Review
from app.schemas.review import ReviewCreate, ReviewUpdate
from app.database import get_db

app = FastAPI()

@app.post("/reviews/", response_model=Review)
def create_review(review: ReviewCreate, db: Session = Depends(get_db)):
    # TODO: Implement logic to create a new review
    pass

@app.get("/reviews/{review_id}", response_model=Review)
def read_review(review_id: int, db: Session = Depends(get_db)):
    # TODO: Implement logic to retrieve a review by ID
    pass

@app.put("/reviews/{review_id}", response_model=Review)
def update_review(review_id: int, review: ReviewUpdate, db: Session = Depends(get_db)):
    # TODO: Implement logic to update an existing review
    pass

@app.delete("/reviews/{review_id}", response_model=dict)
def delete_review(review_id: int, db: Session = Depends(get_db)):
    # TODO: Implement logic to delete a review by ID
    pass