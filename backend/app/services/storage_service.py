"""
Unified cloud/local storage service.

- AWS S3 when credentials are configured in .env
- Local filesystem fallback for development (files saved to /app/uploads/)
"""

import io
import logging
import os
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger(__name__)

LOCAL_UPLOADS_DIR = Path("/app/uploads")


def _s3_configured() -> bool:
    return bool(
        settings.AWS_ACCESS_KEY_ID
        and settings.AWS_SECRET_ACCESS_KEY
        and settings.AWS_S3_BUCKET_NAME
    )


def _s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def upload_bytes(content: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload bytes to S3 (if configured) or local filesystem.
    Returns the storage URL / path string saved in the DB.
    """
    if _s3_configured():
        try:
            _s3_client().upload_fileobj(
                io.BytesIO(content),
                settings.AWS_S3_BUCKET_NAME,
                key,
                ExtraArgs={"ContentType": content_type},
            )
            url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
            logger.info("Uploaded to S3: %s", url)
            return url
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed for %s: %s — falling back to local", key, exc)

    # Local fallback
    local_path = LOCAL_UPLOADS_DIR / key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    logger.info("Saved locally: %s", local_path)
    return f"/uploads/{key}"


def upload_fileobj(file_obj, key: str, content_type: str = "application/pdf") -> str:
    """Upload a file-like object."""
    content = file_obj.read()
    return upload_bytes(content, key, content_type)


def upload_manuscript_file(
    filename: str,
    content: bytes,
    content_type: str = "application/octet-stream",
    subdir: str = "manuscript-uploads",
) -> str:
    """
    Generic manuscript-file uploader used by ``/uploads/manuscript-file``.

    Stores the payload under ``<subdir>/<uuid>/<safe-filename>`` so uploads
    from different authors never collide, and returns the storage URL
    (S3 URL or ``/uploads/…`` local path).

    Kept separate from ``upload_bytes``/``upload_fileobj`` so the existing
    PDF pipeline is untouched.
    """
    import re
    import uuid as _uuid

    # Sanitise the original filename — strip anything but the basic charset,
    # so a hostile name can't traverse the storage layout.
    base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] or "file"
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:120] or "file"
    key = f"{subdir}/{_uuid.uuid4()}/{safe}"
    return upload_bytes(content, key, content_type)


def storage_backend() -> str:
    return "s3" if _s3_configured() else "local"
