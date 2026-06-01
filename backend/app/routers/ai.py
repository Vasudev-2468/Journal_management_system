from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
def ai_status():
    return {"status": "AI service available"}