import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.pdf_processor import extract_metadata_from_local
from app.services.submission_service import (
    create_submission,
    get_submission_status,
    list_submissions,
    override_classification,
    upload_pdf_to_s3,
)
from app.schemas.submission import (
    ClassificationOverrideRequest,
    ClassificationOverrideResponse,
    PaginatedSubmissions,
    SubmissionCreatedResponse,
    SubmissionStatusResponse,
)
from app.tasks import process_new_submission
from app.agents.agent0_author_profile import AuthorProfileAgent
from app.models.user import User
from app.config import settings
from jose import JWTError, jwt

router = APIRouter()

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"application/pdf"}


def get_verified_author(request: Request, db: Session = Depends(get_db)) -> User:
    """Dependency: require a fully MFA-verified author token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required to submit papers.")

    token = auth_header[7:]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        mfa_status = payload.get("author_mfa", "")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    if mfa_status != "fully_verified":
        raise HTTPException(
            status_code=403,
            detail="Two-step verification (Email + WhatsApp) is required before submitting papers.",
            headers={"X-Author-MFA-Required": "true"},
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    # Run Agent 0: validate profile completeness
    agent = AuthorProfileAgent(db)
    profile_check = agent.execute(user)
    if not profile_check["profile_complete"]:
        missing = ", ".join(profile_check["missing_fields"])
        raise HTTPException(
            status_code=400,
            detail=f"Please complete your profile before submitting. Missing: {missing}",
        )

    return user


# ── POST /submissions/parse-metadata ────────────────────

@router.post("/parse-metadata")
async def parse_pdf_metadata(pdf_file: UploadFile = File(...)):
    """Extract title, abstract, and keywords from an uploaded PDF (pre-submission, no auth required)."""
    import os
    import tempfile

    if pdf_file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="Only PDF files are accepted.")

    contents = await pdf_file.read()
    if len(contents) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 10 MB limit.")

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        tmp.write(contents)
        tmp.close()
        return extract_metadata_from_local(tmp.name)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {exc}")
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


# ── POST /submissions/submit ────────────────────────────

@router.post("/submit", response_model=SubmissionCreatedResponse, status_code=201)
async def submit_paper(
    paper_title: str = Form(...),
    author_name: str = Form(...),
    author_email: str = Form(...),
    abstract: str = Form(...),
    keywords: str = Form(...),
    research_category: str = Form(...),
    ai_usage_disclosure: bool = Form(...),
    pdf_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_author: User = Depends(get_verified_author),
):
    # Validate content type
    if pdf_file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Only PDF files are accepted.",
        )

    # Validate file size (read once, then reset)
    contents = await pdf_file.read()
    if len(contents) > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {MAX_PDF_SIZE // (1024 * 1024)} MB.",
        )
    await pdf_file.seek(0)

    # Generate submission ID upfront for the S3 key
    submission_id = uuid.uuid4()

    # Upload to S3
    try:
        pdf_s3_key = upload_pdf_to_s3(pdf_file, submission_id)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to upload PDF to storage: {exc}",
        )

    # Parse keywords
    keyword_list = [kw.strip() for kw in keywords.split(",") if kw.strip()]

    # Persist submission
    submission = create_submission(
        db,
        paper_title=paper_title,
        author_name=author_name,
        author_email=author_email,
        abstract=abstract,
        keywords=keyword_list,
        research_category=research_category,
        pdf_s3_key=pdf_s3_key,
    )

    # Send immediate acknowledgement emails (non-blocking)
    try:
        from app.services.email_service import send_author_acknowledgment, notify_editor_new_submission
        import threading
        paper_id_str = str(getattr(submission, 'paper_id_code', None) or submission.id)
        threading.Thread(
            target=send_author_acknowledgment,
            args=(author_email, author_name, paper_title, paper_id_str),
            daemon=True,
        ).start()
        threading.Thread(
            target=notify_editor_new_submission,
            args=(
                settings.SENDGRID_FROM_EMAIL,
                paper_title,
                str(submission.id),
                research_category,
                0.0,
                f"{settings.FRONTEND_URL}/editor",
            ),
            daemon=True,
        ).start()
    except Exception:
        pass  # emails are best-effort; don't fail the submission

    # Trigger async processing pipeline. A broker outage must not fail
    # or hang the synchronous submit — the row is already persisted, so
    # we dispatch the enqueue on a daemon thread. If the broker is down,
    # ``.delay()`` can block for tens of seconds retrying the connection;
    # putting it off-thread keeps the HTTP response snappy either way.
    import logging, threading
    _log = logging.getLogger(__name__)
    def _enqueue(sub_id: str):
        try:
            process_new_submission.delay(sub_id)
        except Exception as exc:
            _log.warning(
                "Celery broker unreachable; submission %s persisted but pipeline not enqueued: %s",
                sub_id, exc,
            )
    threading.Thread(target=_enqueue, args=(str(submission.id),), daemon=True).start()

    return SubmissionCreatedResponse(
        submission_id=submission.id,
        message="Submission received. Processing has started.",
        estimated_processing_time="2–5 minutes",
    )


# ── GET /submissions/my-submissions  (author: own list) ──

@router.get("/my-submissions")
def get_my_submissions(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Return all submissions belonging to the authenticated author."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        payload = jwt.decode(auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token.")

    from app.models.submission import Submission as Sub
    query = db.query(Sub).filter(Sub.author_email == email)
    total = query.count()
    rows  = query.order_by(Sub.submitted_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = [
        {
            "id":             str(s.id),
            "paper_id_code":  s.paper_id_code,
            "paper_title":    s.paper_title,
            "status":         s.status.value,
            "classified_field": s.classified_field,
            "submitted_at":   s.submitted_at.isoformat(),
            "updated_at":     s.updated_at.isoformat() if s.updated_at else None,
            "review_count":   len(s.reviews) if s.reviews else 0,
            "keywords":       s.keywords or [],
        }
        for s in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── GET /submissions/my-submissions/{id}  (author: detail) ─

@router.get("/my-submissions/{submission_id}")
def get_my_submission_detail(
    submission_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return full detail for one of the authenticated author's submissions."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        payload = jwt.decode(auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token.")

    from app.models.submission import Submission as Sub
    s = db.query(Sub).filter(Sub.paper_id_code == submission_id, Sub.author_email == email).first()
    if not s:
        try:
            uid = uuid.UUID(submission_id)
            s = db.query(Sub).filter(Sub.id == uid, Sub.author_email == email).first()
        except ValueError:
            pass
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found.")

    return {
        "id":                     str(s.id),
        "paper_id_code":          s.paper_id_code,
        "paper_title":            s.paper_title,
        "abstract":               s.abstract,
        "keywords":               s.keywords or [],
        "status":                 s.status.value,
        "classified_field":       s.classified_field,
        "classification_confidence": s.classification_confidence,
        "submitted_at":           s.submitted_at.isoformat(),
        "updated_at":             s.updated_at.isoformat() if s.updated_at else None,
        "review_count":           len(s.reviews) if s.reviews else 0,
        "format_check_report":    s.format_check_report,
        "consult_party_decision": s.consult_party_decision,
        "consult_party_comments": s.consult_party_comments,
    }


# ── GET /submissions/{submission_id}/status ──────────────

@router.get("/{submission_id}/status", response_model=SubmissionStatusResponse)
def get_status(submission_id: uuid.UUID, db: Session = Depends(get_db)):
    result = get_submission_status(db, submission_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return result


# ── GET /submissions/ (editor only) ─────────────────────

@router.get("/", response_model=PaginatedSubmissions)
def list_all_submissions(
    status: Optional[str] = Query(None),
    field: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return list_submissions(
        db,
        status=status,
        field=field,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


# ── PATCH /submissions/{id}/override-classification ─────

@router.patch(
    "/{submission_id}/override-classification",
    response_model=ClassificationOverrideResponse,
)
def override_submission_classification(
    submission_id: uuid.UUID,
    body: ClassificationOverrideRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    submission = override_classification(
        db,
        submission_id,
        body.classified_field,
        body.classification_confidence,
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    return ClassificationOverrideResponse(
        submission_id=submission.id,
        classified_field=submission.classified_field,
        classification_confidence=submission.classification_confidence,
        message="Classification overridden successfully.",
    )
