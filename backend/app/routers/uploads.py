"""
Generic manuscript-file upload endpoint.

Used by the author-facing FileDropzone widget (revision UI + supplementary
files in the submission wizard) to POST any allowed file type up to 25 MB.
The endpoint stores the payload via ``storage_service.upload_manuscript_file``
and returns a compact JSON descriptor the frontend keeps in state.

The existing ``/submissions/*`` PDF pipeline is deliberately not reused —
it is PDF-only and tied to a submission_id, which we do not have yet at
draft time.

Register in ``main.py`` with e.g.::

    from app.routers import uploads
    app.include_router(uploads.router, prefix="/uploads", tags=["Uploads"])
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.malware_scan import scan_bytes
from app.services.storage_service import upload_manuscript_file

router = APIRouter()

# 25 MB cap — matches the frontend widget's default ``maxSizeMB``.
MAX_UPLOAD_SIZE = 25 * 1024 * 1024

# Small allowlist of things a manuscript revision might legitimately carry:
# the manuscript itself, response letters, figures, source archives, tabular
# data, LaTeX sources, quick video demos of methods, and structured/plain
# text.  Anything else (executables, HTML pages, arbitrary binaries) is
# rejected with 415 so authors don't accidentally attach the wrong thing.
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/svg+xml",
    "application/zip",
    "application/x-zip-compressed",
    "text/csv",
    "text/tab-separated-values",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/x-tex",
    "application/x-latex",
    "text/x-tex",
    "video/mp4",
    "video/quicktime",  # .mov
    "application/json",
    "text/plain",
}


@router.post("/manuscript-file")
async def upload_manuscript_file_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Accept one manuscript-related file and persist it via the shared storage layer."""
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported content type '{file.content_type}'. Allowed types: "
                "pdf, jpeg, png, tiff, svg, zip, csv, tsv, docx, tex, mp4, mov, json, txt."
            ),
        )

    contents = await file.read()
    size = len(contents)
    if size == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
        )

    original_filename = file.filename or "upload"

    # Malware scan hook — no-op when no scanner is configured. Blocks on hit.
    scan_result = scan_bytes(contents, filename=original_filename)
    if not scan_result.get("ok", True):
        raise HTTPException(
            status_code=422,
            detail=f"Malware scan rejected the file: {scan_result.get('detail', 'infected')}",
        )

    try:
        stored_url = upload_manuscript_file(
            filename=original_filename,
            content=contents,
            content_type=content_type,
        )
    except Exception as exc:  # storage failure — bubble up as 502
        raise HTTPException(
            status_code=502,
            detail=f"Failed to store uploaded file: {exc}",
        )

    return {
        "stored_url": stored_url,
        "mime_type": content_type,
        "size_bytes": size,
        "original_filename": original_filename,
    }
