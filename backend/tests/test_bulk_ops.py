"""Tests for the editor-gated ``/bulk-ops`` router.

* submission update patches each row's status
* unknown ids are skipped, not errored
* announcement publish toggles the flag
* announcement delete removes rows
* every action leaves a ``bulk_ops.*`` audit row
"""

from __future__ import annotations

import os
import uuid

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping bulk-ops tests.",
)


def _make_submission(db_session, *, author_email="bulk@example.com"):
    """Insert one submission with a unique paper_id_code and return it."""
    from app.models.submission import Submission, SubmissionStatus

    stub_id = uuid.uuid4()
    sub = Submission(
        id=stub_id,
        author_name="Bulk Ops Author",
        author_email=author_email,
        paper_title=f"Bulk Ops Paper {stub_id}",
        abstract="abstract",
        keywords=[],
        status=SubmissionStatus.pending_classification,
        paper_id_code=f"JGAIR-BULK-{stub_id.hex[:8]}",
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


def _make_announcement(db_session, *, is_published=False, kind_suffix=""):
    from app.models.announcement import Announcement

    ann = Announcement(
        title=f"Bulk Ann {kind_suffix or uuid.uuid4().hex[:6]}",
        body="Body content.",
        kind="news",
        is_published=is_published,
    )
    db_session.add(ann)
    db_session.commit()
    db_session.refresh(ann)
    return ann


def _assert_audit_row(db_session, *, action_prefix):
    from app.models.audit_log import AuditLog

    row = (
        db_session.query(AuditLog)
        .filter(AuditLog.action.like(f"{action_prefix}%"))
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert row is not None, f"expected audit row with action prefix {action_prefix!r}"
    assert row.action.startswith("bulk_ops.")


# ── Submissions ────────────────────────────────────────────


def test_bulk_submissions_update_patches_status_and_skips_unknown(
    db_session, authorised_editor_client
):
    sub_a = _make_submission(db_session, author_email="a@bulk.example.com")
    sub_b = _make_submission(db_session, author_email="b@bulk.example.com")

    payload = {
        "ids": [str(sub_a.id), str(sub_b.id), str(uuid.uuid4())],
        "patch": {"status": "under_review"},
    }
    resp = authorised_editor_client.post(
        "/bulk-ops/submissions/update", json=payload
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["updated"] == 2
    assert body["skipped"] == 1

    from app.models.submission import Submission, SubmissionStatus

    db_session.expire_all()
    for s_id in (sub_a.id, sub_b.id):
        row = db_session.query(Submission).filter(Submission.id == s_id).first()
        assert row is not None
        assert row.status == SubmissionStatus.under_review

    _assert_audit_row(db_session, action_prefix="bulk_ops.submissions.")


# ── Announcements ──────────────────────────────────────────


def test_bulk_announcements_publish_toggles_flag(
    db_session, authorised_editor_client
):
    a1 = _make_announcement(db_session, is_published=False, kind_suffix="p1")
    a2 = _make_announcement(db_session, is_published=False, kind_suffix="p2")

    resp = authorised_editor_client.post(
        "/bulk-ops/announcements/publish",
        json={"ids": [a1.id, a2.id], "is_published": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["updated"] == 2

    from app.models.announcement import Announcement

    db_session.expire_all()
    for a_id in (a1.id, a2.id):
        row = (
            db_session.query(Announcement)
            .filter(Announcement.id == a_id)
            .first()
        )
        assert row is not None
        assert row.is_published is True

    _assert_audit_row(db_session, action_prefix="bulk_ops.announcements.publish")


def test_bulk_announcements_delete_removes_rows(
    db_session, authorised_editor_client
):
    a1 = _make_announcement(db_session, is_published=True, kind_suffix="d1")
    a2 = _make_announcement(db_session, is_published=True, kind_suffix="d2")

    resp = authorised_editor_client.post(
        "/bulk-ops/announcements/delete",
        json={"ids": [a1.id, a2.id]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] == 2

    from app.models.announcement import Announcement

    db_session.expire_all()
    remaining = (
        db_session.query(Announcement)
        .filter(Announcement.id.in_([a1.id, a2.id]))
        .count()
    )
    assert remaining == 0

    _assert_audit_row(db_session, action_prefix="bulk_ops.announcements.delete")
