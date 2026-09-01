"""Editorial board roster CRUD.

Public list + read; editor-gated create/update/delete.
Distinct from /editorial (the existing CV-access-request router).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.editorial_board_member import EditorialBoardMember
from app.schemas.editorial_board_member import (
    BoardCompleteProfileRequest,
    BoardCompleteProfileResponse,
    BoardFileUploadResponse,
    BoardInvitationLinkResponse,
    BoardInvitePrefill,
    BoardInviteRequest,
    BoardInviteResponse,
    EditorialBoardMemberCreate,
    EditorialBoardMemberRead,
    EditorialBoardMemberUpdate,
)
from app.services.board_service import (
    BoardInviteError,
    complete_profile,
    invite_board_member,
    mint_board_invitation_token,
    resend_board_invitation,
    resolve_pending_member,
    revoke_board_invitation,
)
from app.services.cv_parser import CvParseError, extract_board_profile, extract_text
from app.services.editor_auth import require_editor_mfa
from app.services.storage_service import upload_manuscript_file

# Reject anything larger than a few MB — a real editorial CV is well
# under this. Larger files are almost certainly scanned image PDFs that
# pdfplumber will fail on anyway.
_MAX_CV_BYTES = 5 * 1024 * 1024

router = APIRouter()


@router.get("/", response_model=List[EditorialBoardMemberRead])
def list_members(
    include_inactive: bool = Query(False),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(EditorialBoardMember)
    if not include_inactive:
        q = q.filter(EditorialBoardMember.is_active.is_(True))
    if category:
        q = q.filter(EditorialBoardMember.category == category)
    return q.order_by(
        EditorialBoardMember.sort_order, EditorialBoardMember.name
    ).all()


@router.get("/{member_id}", response_model=EditorialBoardMemberRead)
def get_member(member_id: int, db: Session = Depends(get_db)):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    return row


@router.post("/", response_model=EditorialBoardMemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: EditorialBoardMemberCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = EditorialBoardMember(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{member_id}", response_model=EditorialBoardMemberRead)
def update_member(
    member_id: int,
    payload: EditorialBoardMemberUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    row = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Board member not found")
    db.delete(row)
    db.commit()
    return None


# ── POST /board/parse-cv (editor only) ──────────────────
#
# Powers the "Upload CV" mode of the Add Board Member wizard. Accepts a
# single PDF/DOCX/TXT upload, extracts text with pdfplumber/python-docx,
# runs the text through gpt-4o-mini to pull the 15-field editorial
# profile, and returns whatever fields the model could confidently
# fill. The frontend then prefills the manual form with the result —
# the editor reviews and corrects before hitting Save. Nothing is
# persisted here; the row is created only when the editor submits the
# subsequent POST /board.

@router.post("/parse-cv")
async def parse_cv(
    file: UploadFile = File(...),
    _editor=Depends(require_editor_mfa),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_CV_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"CV must be smaller than {_MAX_CV_BYTES // (1024 * 1024)} MB.",
        )

    try:
        text = extract_text(data, file.filename or "", file.content_type)
        fields = extract_board_profile(text)
    except CvParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return {
        "fields": fields,
        "extracted_field_count": len(fields),
        "characters_read": len(text),
    }


# ── Invitation lifecycle ────────────────────────────────
#
# Editor-driven onboarding: the editor supplies a name + email + role
# + category, we mint a signed 7-day link and email it. The invitee
# lands on the public /board/complete-profile page and fills the rest.

@router.post("/invite", response_model=BoardInviteResponse, status_code=201)
def invite_endpoint(
    body: BoardInviteRequest,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    try:
        member, _token, email_sent = invite_board_member(
            db,
            name=body.name,
            email=body.email,
            category=body.category,
            role=body.role,
        )
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    msg = (
        "Invitation email is on its way."
        if email_sent
        else "Board member created, but the invitation email could not be dispatched. "
             "Check the notification log and resend."
    )
    return BoardInviteResponse(
        member_id=member.id,
        invited_email=member.invited_email or body.email,
        email_sent=email_sent,
        message=msg,
    )


@router.post("/invite/{member_id}/resend", response_model=BoardInviteResponse)
def resend_invite_endpoint(
    member_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    try:
        member, _tok, email_sent = resend_board_invitation(db, member_id)
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return BoardInviteResponse(
        member_id=member.id,
        invited_email=member.invited_email or member.email or "",
        email_sent=email_sent,
        message=("Invitation resent." if email_sent else "Failed to send email."),
    )


@router.post("/invite/{member_id}/revoke")
def revoke_invite_endpoint(
    member_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    try:
        revoke_board_invitation(db, member_id)
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "message": "Invitation revoked."}


@router.get(
    "/invite/{member_id}/link",
    response_model=BoardInvitationLinkResponse,
)
def get_invite_link_endpoint(
    member_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    """Return the current invitation URL for a pending member so the
    editor can copy it and hand-deliver on Slack / a different email /
    a phone call. Refuses if the invitation was never sent, was
    revoked, or was already completed."""
    from datetime import timedelta as _td
    from app.config import settings as _s
    member = db.query(EditorialBoardMember).filter(EditorialBoardMember.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Board member not found.")
    if member.invitation_completed_at is not None:
        raise HTTPException(status_code=400, detail="This invitation has already been used.")
    if member.invitation_revoked_at is not None:
        raise HTTPException(status_code=400, detail="This invitation has been revoked — resend to mint a fresh link.")
    if member.invitation_token_iat is None:
        raise HTTPException(status_code=400, detail="No active invitation for this member.")
    token = mint_board_invitation_token(member.id, member.invitation_token_iat)
    root = (_s.FRONTEND_URL or "").rstrip("/")
    return BoardInvitationLinkResponse(
        member_id=member.id,
        invitation_url=f"{root}/board/complete-profile/{token}",
        expires_at=member.invitation_token_iat + _td(days=7),
    )


# ── Public: complete-profile flow ───────────────────────
#
# These endpoints are anonymous — the JWT in the URL is the entire
# credential. Every failure branch returns the same 400 detail so a
# probe can't distinguish "no such invitation" from "already used"
# from "revoked".

@router.get("/complete-profile/{token}", response_model=BoardInvitePrefill)
def complete_profile_prefill(token: str, db: Session = Depends(get_db)):
    try:
        member = resolve_pending_member(db, token)
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    expires_at = None
    if member.invitation_token_iat is not None:
        from datetime import timedelta as _td
        expires_at = member.invitation_token_iat + _td(days=7)
    return BoardInvitePrefill(
        member_id=member.id,
        name=member.name,
        email=member.email or member.invited_email or "",
        category=member.category,
        role=member.role,
        invitation_expires_at=expires_at,
    )


@router.post("/complete-profile/{token}", response_model=BoardCompleteProfileResponse)
def complete_profile_submit(
    token: str,
    body: BoardCompleteProfileRequest,
    db: Session = Depends(get_db),
):
    try:
        member = resolve_pending_member(db, token)
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    complete_profile(db, member, body.model_dump(exclude_unset=True))
    return BoardCompleteProfileResponse(
        ok=True,
        message="Thank you — your editorial profile has been submitted.",
    )


# ── POST /board/upload-file (editor only) ───────────────
#
# Editor-authenticated companion to the public complete-profile upload
# path. Used by the +Add Member modal when the editor is filling a
# member's profile directly and wants to attach a photo / CV / cert
# without going through the invite-email round-trip.

@router.post("/upload-file", response_model=BoardFileUploadResponse)
async def upload_file_endpoint(
    file: UploadFile = File(...),
    _editor=Depends(require_editor_mfa),
):
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported file type. Photo: JPEG/PNG/WEBP/GIF. "
                "Documents: PDF or Word."
            ),
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )
    url = upload_manuscript_file(
        filename=file.filename or "attachment",
        content=data,
        content_type=content_type,
        subdir="board-uploads/editor",
    )
    return BoardFileUploadResponse(
        file_url=url,
        filename=file.filename or "attachment",
        size=len(data),
    )


# File uploads for the public complete-profile flow. Anonymous but
# gated on a valid invitation token: an attacker cannot POST junk to
# our storage without a live JWT.
_ALLOWED_UPLOAD_TYPES = {
    # Photo
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    # Resume + certifications
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post(
    "/complete-profile/{token}/upload",
    response_model=BoardFileUploadResponse,
)
async def complete_profile_upload(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    try:
        member = resolve_pending_member(db, token)
    except BoardInviteError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported file type. Photo: JPEG/PNG/WEBP/GIF. "
                "Documents: PDF or Word."
            ),
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )
    url = upload_manuscript_file(
        filename=file.filename or "attachment",
        content=data,
        content_type=content_type,
        subdir=f"board-uploads/{member.id}",
    )
    return BoardFileUploadResponse(
        file_url=url,
        filename=file.filename or "attachment",
        size=len(data),
    )
