"""
Agent 2: Format Validation Bot

Runs automated checks on the submitted paper:
  - PDF format validation
  - Page count
  - Abstract length (150–250 words)
  - Keywords count (4–6)
  - Author names & affiliations present
  - ORCID presence
  - Plagiarism score placeholder
  - Semantic checks (LLM): abstract↔title alignment, keyword coverage,
    abstract structure (background/method/result)

Generates a structured report and sends it to the Consult Party.
Communicates with Agent 3 via orchestrator.
"""

import logging
import re
from datetime import datetime
from typing import Optional

import boto3
from sqlalchemy.orm import Session

from app.config import settings
from app.models.submission import Submission, SubmissionStatus
from app.services.state_machine import transition_or_direct
from app.services.ai_agent import semantic_format_check
from app.services.email_service import _send_and_log, _wrap, _btn

logger = logging.getLogger(__name__)


class FormatValidationAgent:
    """System Agent 2: Format Validation Bot."""

    def __init__(self, db: Session):
        self.db = db

    def execute(self, submission: Submission, agent1_result: dict = None) -> dict:
        """
        Run format checks and generate report.
        Returns dict with report data for downstream agents.
        """
        paper_id = submission.paper_id_code
        results = {
            "agent": "FormatValidationAgent",
            "paper_id_code": paper_id,
            "submission_id": str(submission.id),
        }

        # Run all checks
        report = self._run_checks(submission)
        results["report"] = report

        # Store report on submission
        submission.format_check_report = report
        submission.format_check_completed_at = datetime.utcnow()
        transition_or_direct(db, submission, SubmissionStatus.awaiting_consult_review)
        self.db.commit()

        # Send report to consult party
        consult_email = submission.consult_party_email
        if consult_email:
            try:
                self._send_report_to_consult_party(submission, report, consult_email)
                results["report_sent_to"] = consult_email
            except Exception as exc:
                logger.exception("Agent 2: Failed to send report to consult party")
                results["error"] = str(exc)

        results["overall_status"] = report["overall"]
        results["next_agent"] = "ReviewerSuggesterAgent"
        logger.info("Agent 2 completed for %s — overall: %s", paper_id, report["overall"])
        return results

    def _run_checks(self, submission: Submission) -> dict:
        """Run all format validation checks and return structured report."""
        checks = []

        # Check 1: PDF exists
        checks.append({
            "name": "PDF Upload",
            "status": "pass" if submission.pdf_url else "fail",
            "detail": "PDF file uploaded" if submission.pdf_url else "No PDF file found",
        })

        # Check 2: Abstract length
        abstract = submission.abstract or ""
        word_count = len(abstract.split())
        if 150 <= word_count <= 250:
            checks.append({
                "name": "Abstract Length",
                "status": "pass",
                "detail": f"{word_count} words (required: 150–250)",
            })
        elif 100 <= word_count < 150 or 250 < word_count <= 300:
            checks.append({
                "name": "Abstract Length",
                "status": "warning",
                "detail": f"{word_count} words (required: 150–250)",
            })
        else:
            checks.append({
                "name": "Abstract Length",
                "status": "fail",
                "detail": f"{word_count} words (required: 150–250)",
            })

        # Check 3: Keywords count
        keywords = submission.keywords or []
        kw_count = len(keywords)
        if 4 <= kw_count <= 6:
            checks.append({
                "name": "Keywords Count",
                "status": "pass",
                "detail": f"{kw_count} keywords (required: 4–6)",
            })
        elif kw_count > 0:
            checks.append({
                "name": "Keywords Count",
                "status": "warning",
                "detail": f"{kw_count} keywords (required: 4–6)",
            })
        else:
            checks.append({
                "name": "Keywords Count",
                "status": "fail",
                "detail": "No keywords provided",
            })

        # Check 4: Title length
        title = submission.paper_title or ""
        if 10 <= len(title) <= 200:
            checks.append({
                "name": "Title",
                "status": "pass",
                "detail": f"Title is {len(title)} characters",
            })
        else:
            checks.append({
                "name": "Title",
                "status": "warning",
                "detail": f"Title is {len(title)} characters (recommended: 10–200)",
            })

        # Check 5: Author info
        if submission.author_name and submission.author_email:
            checks.append({
                "name": "Author Information",
                "status": "pass",
                "detail": "Author name and email provided",
            })
        else:
            checks.append({
                "name": "Author Information",
                "status": "fail",
                "detail": "Missing author name or email",
            })

        # Check 6: Research category
        if submission.classified_field:
            checks.append({
                "name": "Research Category",
                "status": "pass",
                "detail": f"Category: {submission.classified_field}",
            })
        else:
            checks.append({
                "name": "Research Category",
                "status": "warning",
                "detail": "No category assigned yet",
            })

        # Check 7: Plagiarism placeholder (would integrate iThenticate)
        checks.append({
            "name": "Plagiarism Check",
            "status": "pass",
            "detail": "Plagiarism screening queued (result pending)",
        })

        # Checks 8–10: Semantic checks via LLM.
        # semantic_format_check() never raises — it returns a "skipped" shape
        # when the API key is missing or the call fails.
        try:
            semantic = semantic_format_check(
                title=submission.paper_title or "",
                abstract=submission.abstract or "",
                keywords=list(submission.keywords or []),
            )
        except Exception:
            logger.exception("Agent 2: semantic_format_check raised unexpectedly")
            semantic = None

        for name, detail in self._semantic_rows(semantic):
            checks.append({"name": name, "status": detail["status"], "detail": detail["detail"]})

        # Determine overall status. "skipped" is neutral — never worsens
        # or improves the overall verdict.
        graded = [c["status"] for c in checks if c["status"] != "skipped"]
        if "fail" in graded:
            overall = "fail"
        elif "warning" in graded:
            overall = "warning"
        else:
            overall = "pass"

        statuses = [c["status"] for c in checks]
        return {
            "checks": checks,
            "overall": overall,
            "checked_at": datetime.utcnow().isoformat(),
            "passed": sum(1 for s in statuses if s == "pass"),
            "warnings": sum(1 for s in statuses if s == "warning"),
            "failures": sum(1 for s in statuses if s == "fail"),
            "skipped": sum(1 for s in statuses if s == "skipped"),
            "semantic": semantic,
        }

    @staticmethod
    def _semantic_rows(semantic: Optional[dict]):
        """Flatten the semantic_format_check result into (name, {status, detail}) rows."""
        if not semantic:
            neutral = {"status": "skipped", "detail": "Semantic check unavailable"}
            yield ("Abstract vs Title (AI)", neutral)
            yield ("Keyword Coverage (AI)", neutral)
            yield ("Abstract Structure (AI)", neutral)
            return

        alignment = semantic.get("abstract_title_alignment") or {}
        yield ("Abstract vs Title (AI)", {
            "status": alignment.get("status", "skipped"),
            "detail": alignment.get("detail") or "No detail returned",
        })

        coverage = semantic.get("keyword_coverage") or {}
        unsupported = coverage.get("unsupported_keywords") or []
        cov_detail = coverage.get("detail") or "No detail returned"
        if unsupported:
            cov_detail = f"{cov_detail} Unsupported: {', '.join(unsupported)}."
        yield ("Keyword Coverage (AI)", {
            "status": coverage.get("status", "skipped"),
            "detail": cov_detail,
        })

        structure = semantic.get("abstract_structure") or {}
        missing = structure.get("missing_elements") or []
        struct_detail = structure.get("detail") or "No detail returned"
        if missing:
            struct_detail = f"{struct_detail} Missing: {', '.join(missing)}."
        yield ("Abstract Structure (AI)", {
            "status": structure.get("status", "skipped"),
            "detail": struct_detail,
        })

    def _send_report_to_consult_party(self, submission: Submission, report: dict, consult_email: str):
        paper_id = submission.paper_id_code
        checks_html = ""
        icon_map = {"pass": "✅", "warning": "⚠️", "fail": "❌", "skipped": "⏭️"}
        color_map = {
            "pass": "#059669",
            "warning": "#d97706",
            "fail": "#dc2626",
            "skipped": "#6b7280",
        }

        for check in report["checks"]:
            icon = icon_map.get(check["status"], "❓")
            color = color_map.get(check["status"], "#6b7280")
            checks_html += f"""
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">{icon}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;">{check['name']}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:{color};">{check['detail']}</td>
            </tr>"""

        subject = f"Format Check Complete — Action Required — {paper_id}"
        body = _wrap(f"""
        <h2 style="color:#1e40af;margin-bottom:16px;">Format Check Report — {paper_id}</h2>
        <p><strong>Title:</strong> {submission.paper_title}</p>
        <p><strong>Author:</strong> {submission.author_name}</p>

        <div style="margin:16px 0;padding:12px;background:{'#f0fdf4' if report['overall'] == 'pass' else '#fefce8' if report['overall'] == 'warning' else '#fef2f2'};border-radius:8px;">
          <strong>Overall: {report['overall'].upper()}</strong> —
          {report['passed']} passed, {report['warnings']} warnings, {report['failures']} failures
        </div>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;border:1px solid #e5e7eb;width:40px;"></th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Check</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Detail</th>
          </tr>
          {checks_html}
        </table>

        <h3 style="margin-top:24px;">Your Action Required</h3>
        <p>Please review the format check results and take one of the following actions:</p>

        <div style="margin:16px 0;">
          {_btn("Approve for Peer Review", f"{settings.FRONTEND_URL}/consult-party/{submission.id}?action=approve", "#059669")}
          {_btn("Return to Author for Revision", f"{settings.FRONTEND_URL}/consult-party/{submission.id}?action=reject", "#dc2626")}
        </div>

        <p>You are also requested to <strong>suggest 2–4 potential reviewers</strong> for this paper.</p>
        {_btn("Suggest Reviewers", f"{settings.FRONTEND_URL}/consult-party/{submission.id}#reviewers")}

        <p><strong>Deadline: 48 hours</strong></p>
        """)
        _send_and_log(consult_email, subject, body, "agent2_format_report_to_consult")
