"""
Editorial Board API — CV access request workflow.

Flow:
1. Visitor submits a CV request (POST /editorial/cv-request)
2. Editor receives an email with Approve / Reject links
3. Editor clicks a link (GET /editorial/cv-request/{token}/approve or /reject)
4. If approved, requester gets an email with the CV (or a download link)
"""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.cv_request import CVRequest, CVRequestStatus
from app.services.email_service import _send_and_log, _wrap, _btn

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request schema ───────────────────────────────────────

class CVAccessRequest(BaseModel):
    member_name: str
    member_email: str
    requester_name: str
    requester_email: EmailStr
    reason: str


# ── POST: submit request ────────────────────────────────

@router.post("/cv-request", status_code=201)
def request_cv_access(payload: CVAccessRequest, db: Session = Depends(get_db)):
    token = uuid.uuid4().hex

    cv_req = CVRequest(
        member_name=payload.member_name,
        member_email=payload.member_email,
        requester_name=payload.requester_name,
        requester_email=payload.requester_email,
        reason=payload.reason,
        approval_token=token,
    )
    db.add(cv_req)
    db.commit()
    db.refresh(cv_req)

    # Send authentication email to the editor. The email links are GETs that
    # land on a confirmation page — the destructive action is a POST from that
    # page, not the click itself. Email scanners (Outlook Safe Links, corporate
    # gateways) prefetch every URL and would otherwise auto-approve.
    api_base = settings.PUBLIC_API_URL.rstrip("/")
    approve_url = f"{api_base}/editorial/cv-request/{token}/approve"
    reject_url = f"{api_base}/editorial/cv-request/{token}/reject"

    subject = f"CV Access Request — {payload.member_name}"
    body = _wrap(f"""
        <p>A visitor has requested access to view the CV/resume of
           <strong>{payload.member_name}</strong>.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;width:40%;">Requester</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {payload.requester_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Email</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              <a href="mailto:{payload.requester_email}">{payload.requester_email}</a></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Board Member</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {payload.member_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;
                        border:1px solid #e5e7eb;">Reason</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">
              {payload.reason}</td>
          </tr>
        </table>

        <p>Please review and take action:</p>

        <div style="margin:16px 0;">
          {_btn("✓ Approve Access", approve_url, "#059669")}
          &nbsp;&nbsp;
          {_btn("✗ Reject", reject_url, "#dc2626")}
        </div>

        <p style="font-size:12px;color:#6b7280;">
          Approving will send the CV to the requester's email address.
        </p>
    """)

    # Send to the board member's email (so they control their own CV)
    _send_and_log(payload.member_email, subject, body, "cv_access_request")

    # Also notify the editorial office (if configured).
    if settings.EDITORIAL_INBOX_EMAIL:
        _send_and_log(settings.EDITORIAL_INBOX_EMAIL, subject, body, "cv_access_request_copy")

    return {"message": "CV access request submitted. The editor will review your request."}


# ── Approve/Reject ───────────────────────────────────────
# The email links are GETs that render a confirmation page. The actual
# decision is a POST from that page, so email-scanner prefetches (Outlook
# Safe Links, corporate gateways) cannot auto-decide.

@router.get("/cv-request/{token}/approve", response_class=HTMLResponse)
def approve_cv_request_confirm(token: str, db: Session = Depends(get_db)):
    cv_req = db.query(CVRequest).filter(CVRequest.approval_token == token).first()
    if not cv_req:
        raise HTTPException(status_code=404, detail="Request not found")
    if cv_req.status != CVRequestStatus.pending:
        return HTMLResponse(_result_page(
            "Already Processed",
            f"This CV request was already <strong>{cv_req.status.value}</strong>.",
            "#d97706",
        ))
    return HTMLResponse(_confirm_page(
        "Approve CV Access",
        f"Confirm sending {cv_req.member_name}'s CV to {cv_req.requester_name} "
        f"&lt;{cv_req.requester_email}&gt;.",
        f"/editorial/cv-request/{token}/approve",
        "Approve Access",
        "#059669",
    ))


@router.get("/cv-request/{token}/reject", response_class=HTMLResponse)
def reject_cv_request_confirm(token: str, db: Session = Depends(get_db)):
    cv_req = db.query(CVRequest).filter(CVRequest.approval_token == token).first()
    if not cv_req:
        raise HTTPException(status_code=404, detail="Request not found")
    if cv_req.status != CVRequestStatus.pending:
        return HTMLResponse(_result_page(
            "Already Processed",
            f"This CV request was already <strong>{cv_req.status.value}</strong>.",
            "#d97706",
        ))
    return HTMLResponse(_confirm_page(
        "Reject CV Request",
        f"Confirm rejecting the request from {cv_req.requester_name} "
        f"&lt;{cv_req.requester_email}&gt;.",
        f"/editorial/cv-request/{token}/reject",
        "Reject Request",
        "#dc2626",
    ))


@router.post("/cv-request/{token}/approve", response_class=HTMLResponse)
def approve_cv_request(token: str, db: Session = Depends(get_db)):
    cv_req = db.query(CVRequest).filter(CVRequest.approval_token == token).first()
    if not cv_req:
        raise HTTPException(status_code=404, detail="Request not found")

    if cv_req.status != CVRequestStatus.pending:
        return HTMLResponse(_result_page(
            "Already Processed",
            f"This CV request was already <strong>{cv_req.status.value}</strong>.",
            "#d97706",
        ))

    cv_req.status = CVRequestStatus.approved
    cv_req.resolved_at = datetime.utcnow()
    db.commit()

    # Send CV notification to the requester
    subject = f"CV Access Approved — {cv_req.member_name}"
    body = _wrap(f"""
        <p>Dear {cv_req.requester_name},</p>

        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;
                    padding:16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;font-weight:700;color:#059669;font-size:15px;">
            ✓ Your CV access request has been approved
          </p>
        </div>

        <p>The editor (<strong>{cv_req.member_name}</strong>) has approved your request
           to view their CV/resume.</p>

        <p>The CV will be sent to you by the editorial office shortly at
           <strong>{cv_req.requester_email}</strong>.</p>

        <p>If you have any questions, contact us at
           <a href="mailto:{settings.EDITORIAL_INBOX_EMAIL or 'editorial@example.com'}"
              style="color:#1e40af;">{settings.EDITORIAL_INBOX_EMAIL or 'editorial@example.com'}</a>.</p>

        <p>Best regards,<br><strong>JGAIR Editorial Team</strong></p>
    """)
    _send_and_log(cv_req.requester_email, subject, body, "cv_access_approved")

    return HTMLResponse(_result_page(
        "Request Approved",
        f"The CV of <strong>{cv_req.member_name}</strong> will be shared with "
        f"<strong>{cv_req.requester_name}</strong> ({cv_req.requester_email}).",
        "#059669",
    ))


@router.post("/cv-request/{token}/reject", response_class=HTMLResponse)
def reject_cv_request(token: str, db: Session = Depends(get_db)):
    cv_req = db.query(CVRequest).filter(CVRequest.approval_token == token).first()
    if not cv_req:
        raise HTTPException(status_code=404, detail="Request not found")

    if cv_req.status != CVRequestStatus.pending:
        return HTMLResponse(_result_page(
            "Already Processed",
            f"This CV request was already <strong>{cv_req.status.value}</strong>.",
            "#d97706",
        ))

    cv_req.status = CVRequestStatus.rejected
    cv_req.resolved_at = datetime.utcnow()
    db.commit()

    # Notify requester of rejection
    subject = f"CV Access Request — {cv_req.member_name}"
    body = _wrap(f"""
        <p>Dear {cv_req.requester_name},</p>

        <p>Thank you for your interest. Unfortunately, your request to view the
           CV of <strong>{cv_req.member_name}</strong> was not approved at this time.</p>

        <p>If you have questions, please contact
           <a href="mailto:{settings.EDITORIAL_INBOX_EMAIL or 'editorial@example.com'}"
              style="color:#1e40af;">{settings.EDITORIAL_INBOX_EMAIL or 'editorial@example.com'}</a>.</p>

        <p>Best regards,<br><strong>JGAIR Editorial Team</strong></p>
    """)
    _send_and_log(cv_req.requester_email, subject, body, "cv_access_rejected")

    return HTMLResponse(_result_page(
        "Request Rejected",
        f"The CV request from <strong>{cv_req.requester_name}</strong> has been rejected.",
        "#dc2626",
    ))


# ── HTML confirmation + result pages ─────────────────────

def _confirm_page(title: str, message: str, action_url: str, button_label: str, color: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{title} — JGAIR</title>
<style>
  body {{ font-family: 'Segoe UI', Roboto, sans-serif; background: #f9fafb;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }}
  .card {{ background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08);
           max-width: 460px; padding: 40px; text-align: center; }}
  h1 {{ font-size: 22px; color: #111; margin: 0 0 12px; }}
  p {{ font-size: 14px; color: #6b7280; line-height: 1.6; }}
  button {{ background: {color}; color: #fff; border: 0; border-radius: 8px;
            padding: 12px 22px; font-size: 15px; font-weight: 600;
            cursor: pointer; margin-top: 18px; }}
</style></head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p>{message}</p>
    <form method="POST" action="{action_url}">
      <button type="submit">{button_label}</button>
    </form>
  </div>
</body></html>"""


def _result_page(title: str, message: str, color: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{title} — JGAIR</title>
<style>
  body {{ font-family: 'Segoe UI', Roboto, sans-serif; background: #f9fafb;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }}
  .card {{ background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08);
           max-width: 420px; padding: 40px; text-align: center; }}
  .icon {{ width: 64px; height: 64px; border-radius: 50%;
           background: {color}20; display: flex; align-items: center;
           justify-content: center; margin: 0 auto 20px; }}
  .icon span {{ font-size: 28px; }}
  h1 {{ font-size: 22px; color: #111; margin: 0 0 12px; }}
  p {{ font-size: 14px; color: #6b7280; line-height: 1.6; }}
</style></head>
<body>
  <div class="card">
    <div class="icon"><span>{"✓" if "Approved" in title else "✗" if "Rejected" in title else "⚠"}</span></div>
    <h1>{title}</h1>
    <p>{message}</p>
  </div>
</body></html>"""
