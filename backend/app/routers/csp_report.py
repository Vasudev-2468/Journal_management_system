"""CSP violation ingestion endpoint.

Browsers POST a JSON body here whenever the page-level Content-Security-Policy
is violated (blocked script, inline style, connect-src refusal, …). We stash
the raw payload in ``audit_logs`` with ``action='csp.violation'`` so the
security team can review anomalies without exposing anything back to the
attacker: the endpoint always answers 204 (no body, no leaked info).

The endpoint is public — CSP reports arrive unauthenticated by design, so
every browser session's CSP can point at it. The rate limiter still applies.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog

router = APIRouter()


@router.post("/csp-report", status_code=status.HTTP_204_NO_CONTENT)
async def receive_csp_report(request: Request, db: Session = Depends(get_db)):
    """Ingest a browser CSP violation report.

    Accepts both ``application/csp-report`` (the level-2 report format) and
    ``application/json`` (the newer Reporting-API ``report-to`` payloads).
    In practice both carry JSON; we just try to parse the body and, if that
    fails, we still log a stub row so we know the browser tried to talk to
    us.
    """
    raw = await request.body()
    payload: object
    if not raw:
        payload = {}
    else:
        try:
            payload = json.loads(raw.decode("utf-8", errors="replace"))
        except (ValueError, UnicodeDecodeError):
            # Retain the raw text so the security team can still eyeball
            # a malformed report — this happens with some browser bugs.
            payload = {"_unparseable": raw.decode("utf-8", errors="replace")[:4000]}

    ip = request.client.host if request.client else None

    try:
        db.add(
            AuditLog(
                action="csp.violation",
                target_type="csp",
                meta=payload,
                ip_address=ip,
            )
        )
        db.commit()
    except Exception:
        # Never fail the browser's report — a DB hiccup shouldn't cause the
        # browser to retry noisily. Roll back and move on silently.
        db.rollback()

    # 204 with no body, unconditionally. Do not leak whether the row was
    # persisted or what we thought of the payload.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
