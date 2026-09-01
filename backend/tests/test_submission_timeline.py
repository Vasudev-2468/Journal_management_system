"""Tests for the ``/submission-timeline`` router.

The endpoint follows the "own-or-editor" pattern:

* an author gets 200 for a submission they own and sees a ``submitted``
  event
* another author probing the id is rejected (router folds the
  "not yours" branch into a 404 that's indistinguishable from a
  genuine miss)
* any editorial-role viewer can pull the timeline for any submission
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping submission-timeline tests.",
)


@pytest.fixture()
def _author_submission(db_session, test_author):
    """Insert a submission owned by ``test_author.email``."""
    from app.models.submission import Submission, SubmissionStatus

    stub_id = uuid.uuid4()
    sub = Submission(
        id=stub_id,
        author_name=test_author.full_name or test_author.username,
        author_email=test_author.email,
        paper_title="Timeline Own Paper",
        abstract="abs",
        keywords=[],
        status=SubmissionStatus.pending_classification,
        paper_id_code=f"JGAIR-TL-{stub_id.hex[:8]}",
        submitted_at=datetime.utcnow(),
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


@pytest.fixture()
def _other_submission(db_session):
    from app.models.submission import Submission, SubmissionStatus

    stub_id = uuid.uuid4()
    sub = Submission(
        id=stub_id,
        author_name="Other Author",
        author_email="somebody-else@example.com",
        paper_title="Timeline Other Paper",
        abstract="abs",
        keywords=[],
        status=SubmissionStatus.pending_classification,
        paper_id_code=f"JGAIR-TLO-{stub_id.hex[:8]}",
        submitted_at=datetime.utcnow(),
    )
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    return sub


def test_owning_author_sees_submitted_event(
    db_session, _author_submission, authorised_author_client
):
    resp = authorised_author_client.get(
        f"/submission-timeline/{_author_submission.id}"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "events" in body
    kinds = [e["kind"] for e in body["events"]]
    assert "submitted" in kinds


def test_other_authors_submission_is_hidden(
    db_session, _other_submission, authorised_author_client
):
    resp = authorised_author_client.get(
        f"/submission-timeline/{_other_submission.id}"
    )
    # Router deliberately folds "not yours" into a 404 so an author
    # probing UUIDs cannot enumerate. Accept 403 too in case the guard
    # is retuned in a future sweep.
    assert resp.status_code in (403, 404)


def test_editor_can_view_any_submission(
    db_session, _other_submission, authorised_editor_client
):
    resp = authorised_editor_client.get(
        f"/submission-timeline/{_other_submission.id}"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    kinds = [e["kind"] for e in body["events"]]
    assert "submitted" in kinds
