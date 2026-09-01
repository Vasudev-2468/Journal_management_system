"""Tests for the editor-gated ``/csv-export`` router.

* submissions endpoint returns ``text/csv``, an attachment disposition,
  and a header row starting with ``paper_id_code``
* reviewers and announcements endpoints share the same shape contract
* audit-log ``limit`` honours the query parameter
"""

from __future__ import annotations

import os
import uuid

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping csv-export tests.",
)


def _assert_csv_response(resp, *, kind: str):
    assert resp.status_code == 200, resp.text
    # Router sets Content-Type both via media_type and explicit headers.
    assert "text/csv" in resp.headers.get("content-type", "")
    disp = resp.headers.get("content-disposition", "")
    assert "attachment" in disp
    assert "filename" in disp
    assert kind in disp


# ── Submissions ────────────────────────────────────────────


def _seed_submission(db_session):
    from app.models.submission import Submission, SubmissionStatus

    stub_id = uuid.uuid4()
    row = Submission(
        id=stub_id,
        author_name="CSV Author",
        author_email="csv@example.com",
        paper_title="CSV Export Paper",
        abstract="abs",
        keywords=[],
        status=SubmissionStatus.pending_classification,
        paper_id_code=f"JGAIR-CSV-{stub_id.hex[:8]}",
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_submissions_csv_starts_with_paper_id_code_column(
    db_session, authorised_editor_client
):
    _seed_submission(db_session)
    resp = authorised_editor_client.get("/csv-export/submissions")
    _assert_csv_response(resp, kind="submissions")
    # First line of the payload is the header row.
    first_line = resp.text.splitlines()[0]
    assert first_line.startswith("paper_id_code")


def test_reviewers_csv_response_shape(
    db_session, authorised_editor_client
):
    from app.models.reviewer import Reviewer

    r = Reviewer(
        name="CSV Reviewer",
        email=f"csv-reviewer-{uuid.uuid4().hex[:6]}@example.com",
        expertise_tags=["AI"],
    )
    db_session.add(r)
    db_session.commit()

    resp = authorised_editor_client.get("/csv-export/reviewers")
    _assert_csv_response(resp, kind="reviewers")
    header = resp.text.splitlines()[0]
    assert "name" in header
    assert "email" in header


def test_announcements_csv_response_shape(
    db_session, authorised_editor_client
):
    from app.models.announcement import Announcement

    ann = Announcement(
        title=f"CSV Ann {uuid.uuid4().hex[:6]}",
        body="body",
        kind="news",
        is_published=True,
    )
    db_session.add(ann)
    db_session.commit()

    resp = authorised_editor_client.get("/csv-export/announcements")
    _assert_csv_response(resp, kind="announcements")
    header = resp.text.splitlines()[0]
    assert header.startswith("id,title")


def test_audit_log_limit_is_respected(
    db_session, authorised_editor_client
):
    from app.models.audit_log import AuditLog

    # Seed enough rows to overshoot the tested limit.
    for _ in range(8):
        db_session.add(
            AuditLog(actor_email="csv@example.com", action="csv.test.seed")
        )
    db_session.commit()

    resp = authorised_editor_client.get(
        "/csv-export/audit-log", params={"limit": 5}
    )
    _assert_csv_response(resp, kind="audit-log")
    lines = resp.text.splitlines()
    # Header + at most 5 data rows.
    assert 1 <= len(lines) - 1 <= 5
