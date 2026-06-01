"""
End-to-end test suite for the full paper submission → review → decision workflow.

Uses:
  - pytest / pytest-asyncio for async tests
  - httpx.AsyncClient talking to the real FastAPI app
  - SQLite in-memory DB (swapped via dependency override)
  - unittest.mock to patch external services (S3, SendGrid, Twilio, Anthropic,
    sentence-transformers, Celery .delay())
"""

import io
import uuid
from datetime import datetime, timedelta
from typing import List
from unittest.mock import MagicMock, patch, ANY

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.config import settings
from app.models.submission import Submission, SubmissionStatus
from app.models.reviewer import Reviewer
from app.models.review import Review, ReviewStatus, OverallRecommendation
from app.services.auth_service import create_access_token


# ═══════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════

TEST_DATABASE_URL = "sqlite://"  # in-memory

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Override the DB dependency once for all tests
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """Provide a raw DB session for direct assertions."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest_asyncio.fixture()
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Auth helper ──────────────────────────────────────────

def editor_jwt() -> str:
    """Create a valid JWT for an editor user so protected routes pass."""
    return create_access_token(data={"sub": "editor@journal.org"})


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {editor_jwt()}"}


# ── Factory helpers ──────────────────────────────────────

def make_pdf_bytes() -> bytes:
    """Return a minimal valid PDF file (enough to pass content-type checks)."""
    return (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"xref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF"
    )


def seed_reviewers(db) -> List[Reviewer]:
    """Insert 5 reviewers with embeddings so suggest endpoint has data."""
    reviewers = []
    specialties = [
        ["Artificial Intelligence — Machine Learning", "Deep Learning"],
        ["Artificial Intelligence — Natural Language Processing"],
        ["Generative AI — Large Language Models"],
        ["AI Ethics, Fairness and Explainability", "Computer Vision"],
        ["Deep Learning — Transformers and Attention Mechanisms"],
    ]
    for i, tags in enumerate(specialties):
        r = Reviewer(
            id=uuid.uuid4(),
            name=f"Reviewer {i + 1}",
            email=f"reviewer{i + 1}@university.edu",
            institution="Test University",
            expertise_tags=tags,
            embedding_vector=[float(j + i) for j in range(384)],
            max_assignments=5,
            current_load=0,
            is_active=True,
        )
        db.add(r)
        reviewers.append(r)
    db.commit()
    for r in reviewers:
        db.refresh(r)
    return reviewers


def seed_submission(db) -> Submission:
    """Insert a submission already past classification."""
    s = Submission(
        id=uuid.uuid4(),
        author_name="Test Author",
        author_email="author@example.com",
        paper_title="Test Paper on Machine Learning",
        abstract="This paper investigates novel approaches to machine learning.",
        keywords=["machine learning", "deep learning"],
        pdf_url="submissions/test/original.pdf",
        redacted_pdf_url="submissions/test/redacted.pdf",
        classified_field="Artificial Intelligence — Machine Learning",
        classification_confidence=0.92,
        status=SubmissionStatus.pending_assignment,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def seed_review_with_token(db, submission_id, reviewer_id, *, expired=False, used=False) -> Review:
    """Create a Review row with a known link_token for testing access/submit."""
    token = f"test-token-{uuid.uuid4().hex[:12]}"
    expires = datetime.utcnow() + (timedelta(days=-1) if expired else timedelta(days=14))
    review = Review(
        id=uuid.uuid4(),
        submission_id=submission_id,
        reviewer_id=reviewer_id,
        link_token=token,
        link_expires_at=expires,
        link_used=used,
        status=ReviewStatus.pending,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


# ═══════════════════════════════════════════════════════
# Tests — executed in order (pytest-ordering or naming)
# ═══════════════════════════════════════════════════════

@pytest.mark.asyncio
@patch("app.routers.submissions.process_new_submission")
@patch("app.services.submission_service.upload_pdf_to_s3", return_value="submissions/fake/original.pdf")
async def test_01_submit_paper(mock_s3, mock_task, client, db):
    """POST /submissions/submit — upload PDF, persist row, fire Celery task."""
    mock_task.delay = MagicMock()

    pdf = make_pdf_bytes()

    response = await client.post(
        "/submissions/submit",
        data={
            "paper_title": "Advances in Federated Learning",
            "author_name": "Alice Researcher",
            "author_email": "alice@university.edu",
            "abstract": "A study on federated learning privacy guarantees.",
            "keywords": "federated learning, privacy",
            "research_category": "Deep Learning — Federated Learning",
            "ai_usage_disclosure": "false",
        },
        files={"pdf_file": ("paper.pdf", io.BytesIO(pdf), "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert "submission_id" in body
    assert body["message"]

    # Verify Celery task was triggered
    mock_task.delay.assert_called_once()
    task_arg = mock_task.delay.call_args[0][0]
    assert task_arg == body["submission_id"]

    # Verify DB row
    sub = db.query(Submission).first()
    assert sub is not None
    assert sub.paper_title == "Advances in Federated Learning"
    assert sub.status == SubmissionStatus.pending_classification


@pytest.mark.asyncio
async def test_02_ai_classification(db):
    """Trigger process_new_submission directly; verify classification persisted."""
    # Seed a submission
    submission = Submission(
        id=uuid.uuid4(),
        author_name="Bob",
        author_email="bob@uni.edu",
        paper_title="Transformer Optimization",
        abstract="We propose a new attention mechanism for transformers.",
        keywords=["transformers", "attention"],
        pdf_url="submissions/test/original.pdf",
        status=SubmissionStatus.pending_classification,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    mock_classification = {
        "classified_field": "Deep Learning — Transformers and Attention Mechanisms",
        "confidence": 0.89,
        "reasoning": "Paper focuses on attention mechanisms in transformers.",
    }

    with (
        patch("app.tasks.paper_tasks.extract_abstract_and_intro", return_value={"abstract": None, "title": None}),
        patch("app.tasks.paper_tasks.classify_paper", return_value=mock_classification),
        patch("app.tasks.paper_tasks.compute_text_embedding", return_value=[0.1] * 384),
        patch("app.tasks.paper_tasks.redact_author_information", return_value="submissions/test/redacted.pdf"),
        patch("app.tasks.paper_tasks.notification_service") as mock_notify,
    ):
        # Import and call the task function synchronously (bypass Celery broker)
        from app.tasks.paper_tasks import process_new_submission

        # Patch SessionLocal to return our test session
        with patch("app.tasks.paper_tasks.SessionLocal", return_value=db):
            process_new_submission(str(submission.id))

    # Refresh and verify
    db.refresh(submission)
    assert submission.classified_field == "Deep Learning — Transformers and Attention Mechanisms"
    assert submission.classification_confidence == 0.89
    assert submission.status == SubmissionStatus.pending_assignment
    assert submission.redacted_pdf_url == "submissions/test/redacted.pdf"

    # Editor was notified
    mock_notify.notify_editor_new_submission.assert_called_once()


@pytest.mark.asyncio
@patch("app.services.ai_agent.match_reviewers")
async def test_03_reviewer_matching(mock_match, client, db):
    """GET /reviewers/suggest/{submission_id} — returns 5 ranked suggestions."""
    submission = seed_submission(db)
    reviewers = seed_reviewers(db)

    # Mock the AI matching function to return our seeded reviewers
    suggestions = [
        {
            "reviewer_id": r.id,
            "name": r.name,
            "expertise_tags": r.expertise_tags,
            "current_load": r.current_load,
            "similarity_score": round(0.95 - i * 0.05, 2),
        }
        for i, r in enumerate(reviewers)
    ]
    mock_match.return_value = suggestions

    # Mock the auth dependency to bypass real user lookup
    with patch("app.routers.reviewers.get_current_user", return_value=MagicMock()):
        response = await client.get(
            f"/reviewers/suggest/{submission.id}",
            headers=auth_headers(),
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 5
    for item in body:
        assert "reviewer_id" in item
        assert "similarity_score" in item
        assert "current_load" in item


@pytest.mark.asyncio
@patch("app.routers.reviewers.send_reviewer_invitations")
async def test_04_assign_reviewers(mock_invite_task, client, db):
    """POST /reviewers/assign — creates Review rows with link tokens."""
    mock_invite_task.delay = MagicMock()

    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    reviewer_ids = [str(reviewers[0].id), str(reviewers[1].id)]

    with patch("app.routers.reviewers.get_current_user", return_value=MagicMock()):
        response = await client.post(
            "/reviewers/assign",
            json={
                "submission_id": str(submission.id),
                "reviewer_ids": reviewer_ids,
            },
            headers=auth_headers(),
        )

    assert response.status_code == 201
    body = response.json()
    assert body["reviews_created"] == 2

    # Verify Review rows in DB
    reviews = db.query(Review).filter(Review.submission_id == submission.id).all()
    assert len(reviews) == 2

    for review in reviews:
        assert review.link_token is not None
        assert len(review.link_token) > 10
        assert review.link_used is False
        # link_expires_at should be ~14 days from now
        delta = review.link_expires_at - datetime.utcnow()
        assert 13 <= delta.days <= 14

    # Verify invitation task was queued
    mock_invite_task.delay.assert_called_once()


@pytest.mark.asyncio
async def test_05_reviewer_access(client, db):
    """GET /reviews/access/{token} — valid token returns review context."""
    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    review = seed_review_with_token(db, submission.id, reviewers[0].id)

    # Patch JWT verification to accept our test token
    with patch("app.routers.reviews.verify_review_link_token", return_value=str(review.id)):
        response = await client.get(f"/reviews/access/{review.link_token}")

    assert response.status_code == 200
    body = response.json()
    assert body["reviewer_name"] == reviewers[0].name
    assert body["paper_title"] == submission.paper_title
    assert body["redacted_pdf_url"] == submission.redacted_pdf_url


@pytest.mark.asyncio
@patch("app.routers.reviews.notify_editor_review_complete")
@patch("app.routers.reviews.all_reviews_completed", return_value=False)
async def test_06_submit_review(mock_all_done, mock_notify_task, client, db):
    """POST /reviews/submit/{token} — saves scores, marks link used."""
    mock_notify_task.delay = MagicMock()

    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    review = seed_review_with_token(db, submission.id, reviewers[0].id)

    payload = {
        "score_originality": 8.0,
        "score_technical": 7.5,
        "score_relevance": 9.0,
        "score_clarity": 7.0,
        "score_references": 8.5,
        "overall_recommendation": "minor_revision",
        "comments_to_authors": "Well-written paper with solid methodology. Minor clarifications needed in section 3.",
        "comments_to_editor": "I recommend accepting after minor fixes.",
    }

    with patch("app.routers.reviews.verify_review_link_token", return_value=str(review.id)):
        response = await client.post(
            f"/reviews/submit/{review.link_token}",
            json=payload,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["review_id"] == str(review.id)
    assert "successfully" in body["message"].lower()

    # Verify DB state
    db.refresh(review)
    assert review.link_used is True
    assert review.status == ReviewStatus.completed
    assert review.score_originality == 8.0
    assert review.score_technical == 7.5
    assert review.score_relevance == 9.0
    assert review.score_clarity == 7.0
    assert review.score_references == 8.5
    assert review.overall_recommendation == OverallRecommendation.minor_revision
    assert review.comments_to_authors is not None
    assert review.completed_at is not None

    # Editor notification triggered
    mock_notify_task.delay.assert_called()


@pytest.mark.asyncio
@patch("app.routers.reviews.send_decision_to_author")
async def test_07_editor_decision(mock_decision_task, client, db):
    """POST /reviews/{submission_id}/decision — updates status, notifies author."""
    mock_decision_task.delay = MagicMock()

    submission = seed_submission(db)
    # Move submission to under_review (the realistic pre-decision state)
    submission.status = SubmissionStatus.under_review
    db.commit()

    with patch("app.routers.reviews.get_current_user", return_value=MagicMock()):
        response = await client.post(
            f"/reviews/{submission.id}/decision",
            json={
                "decision": "accepted",
                "editor_comments": "Excellent research. Accepted for publication.",
            },
            headers=auth_headers(),
        )

    assert response.status_code == 201
    body = response.json()
    assert body["new_status"] == "accepted"
    assert str(submission.id) == body["submission_id"]

    # Verify DB
    db.refresh(submission)
    assert submission.status == SubmissionStatus.accepted

    # Author notification
    mock_decision_task.delay.assert_called_once_with(
        str(submission.id), "accepted", "Excellent research. Accepted for publication."
    )


@pytest.mark.asyncio
async def test_08_expired_token(client, db):
    """GET /reviews/access/{expired_token} — returns 410."""
    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    review = seed_review_with_token(
        db, submission.id, reviewers[0].id, expired=True
    )

    response = await client.get(f"/reviews/access/{review.link_token}")

    assert response.status_code == 410
    body = response.json()
    assert "expired" in body["detail"].lower()


# ═══════════════════════════════════════════════════════
# Bonus edge-case tests
# ═══════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_09_already_submitted_token(client, db):
    """GET /reviews/access/{used_token} — returns 409."""
    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    review = seed_review_with_token(
        db, submission.id, reviewers[0].id, used=True
    )

    response = await client.get(f"/reviews/access/{review.link_token}")

    assert response.status_code == 409
    body = response.json()
    assert "already" in body["detail"].lower()


@pytest.mark.asyncio
@patch("app.routers.submissions.process_new_submission")
@patch("app.services.submission_service.upload_pdf_to_s3", return_value="x")
async def test_10_reject_non_pdf(mock_s3, mock_task, client):
    """POST /submissions/submit with a non-PDF file — returns 422."""
    mock_task.delay = MagicMock()

    response = await client.post(
        "/submissions/submit",
        data={
            "paper_title": "T",
            "author_name": "A",
            "author_email": "a@b.com",
            "abstract": "A",
            "keywords": "x",
            "research_category": "AI",
            "ai_usage_disclosure": "false",
        },
        files={"pdf_file": ("doc.txt", io.BytesIO(b"not a pdf"), "text/plain")},
    )

    assert response.status_code == 422
    assert "PDF" in response.json()["detail"]


@pytest.mark.asyncio
async def test_11_review_link_not_found(client):
    """GET /reviews/access/{bogus} — returns 404."""
    response = await client.get("/reviews/access/nonexistent-token-abc")
    assert response.status_code == 404


@pytest.mark.asyncio
@patch("app.routers.reviews.notify_editor_review_complete")
@patch("app.routers.reviews.all_reviews_completed", return_value=False)
async def test_12_double_submit_prevented(mock_all, mock_notify, client, db):
    """POST /reviews/submit/{token} twice — second attempt returns 409."""
    mock_notify.delay = MagicMock()

    submission = seed_submission(db)
    reviewers = seed_reviewers(db)
    review = seed_review_with_token(db, submission.id, reviewers[0].id)

    payload = {
        "score_originality": 7,
        "score_technical": 7,
        "score_relevance": 7,
        "score_clarity": 7,
        "score_references": 7,
        "overall_recommendation": "accept",
        "comments_to_authors": "Great work, I recommend acceptance after careful consideration of all methodology.",
    }

    with patch("app.routers.reviews.verify_review_link_token", return_value=str(review.id)):
        # First submit — should succeed
        r1 = await client.post(f"/reviews/submit/{review.link_token}", json=payload)
        assert r1.status_code == 201

        # Second submit — should be blocked
        r2 = await client.post(f"/reviews/submit/{review.link_token}", json=payload)
        assert r2.status_code == 409
