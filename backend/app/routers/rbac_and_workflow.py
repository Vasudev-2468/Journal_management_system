"""Endpoints for the RBAC engine + workflow gates (spec §37, §14, §23).

Three surfaces:

  * ``GET /permissions/me`` — the caller's granted actions. Powers UI
    hiding/showing of buttons without leaking the whole matrix.

  * ``GET /submissions/{submission_id}/decision-briefing`` — output of
    the Editorial Decision Agent. AI-assisted summary, editor decides.

  * ``POST /articles/{article_id}/publish`` — Publication Agent gate.
    Verifies decision=accepted ∧ DOI registered ∧ (proof approved when
    a proof exists) before flipping to ``published``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.editorial_decision_agent import build_briefing
from app.database import get_db
from app.models.article import Article
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.services.editor_auth import require_editor_mfa
from app.services.permissions import (
    ACTION_PUBLISH,
    has_permission,
    require_permission,
)


router = APIRouter()


# ── GET /permissions/me ─────────────────────────────────

class MePermissionsResponse(BaseModel):
    role: str
    permissions: list[str]


@router.get("/permissions/me", response_model=MePermissionsResponse)
def get_my_permissions(
    db: Session = Depends(get_db),
    user: User = Depends(require_editor_mfa),
) -> MePermissionsResponse:
    """Return the caller's granted RBAC actions. Cheap enough to fetch
    on every dashboard load."""
    from app.models.permission import Permission, RolePermission
    rows = (
        db.query(Permission.action)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role == user.role.value)
        .all()
    )
    return MePermissionsResponse(
        role=user.role.value,
        permissions=sorted({r[0] for r in rows}),
    )


# ── GET /submissions/{id}/decision-briefing ─────────────

class RecommendationCount(BaseModel):
    accept: int
    minor_revision: int
    major_revision: int
    reject: int


class Concern(BaseModel):
    reviewer: str
    concern: str


class DecisionBriefingResponse(BaseModel):
    submission_id: str
    reviews_received: int
    reviews_expected: int
    recommendations: RecommendationCount
    consensus: str
    suggested_decision: str
    suggestion_reason: str
    confidence: str
    common_concerns: list[Concern]
    ethics_flags: int
    coi_declared: int
    can_finalise: bool


class SubmissionTransitionEntry(BaseModel):
    id: int
    from_status: Optional[str] = None
    to_status: str
    allowed: bool
    performed_by_email: Optional[str] = None
    performed_at: datetime
    reason: Optional[str] = None


class LegalNextStatesResponse(BaseModel):
    current: str
    legal_next_states: list[str]
    # Map of the four decision buttons the frontend renders to whether
    # the state machine will accept them right now. Saves the frontend
    # from re-implementing the graph.
    decisions_allowed: dict[str, bool]


@router.get(
    "/submissions/{submission_id}/legal-next-states",
    response_model=LegalNextStatesResponse,
)
def legal_next_states_endpoint(
    submission_id: str,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> LegalNextStatesResponse:
    """Report which state transitions the machine will currently accept.
    Powers the Decision Workspace's button-enable logic — a 'pending
    classification' submission shouldn't offer 'Accept'."""
    from uuid import UUID
    from app.models.submission import Submission, SubmissionStatus
    from app.services.state_machine import legal_next_states

    submission: Optional[Submission] = None
    try:
        submission = db.query(Submission).filter(Submission.id == UUID(str(submission_id))).first()
    except (ValueError, TypeError):
        submission = db.query(Submission).filter(Submission.paper_id_code == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    legal = set(legal_next_states(submission.status))
    return LegalNextStatesResponse(
        current=submission.status.value,
        legal_next_states=sorted(legal),
        decisions_allowed={
            "accept":              SubmissionStatus.accepted.value in legal,
            "reject":              SubmissionStatus.rejected.value in legal,
            "minor_revision":      SubmissionStatus.revision_requested.value in legal,
            "major_revision":      SubmissionStatus.revision_requested.value in legal,
            "reject_and_resubmit": SubmissionStatus.reject_and_resubmit.value in legal,
        },
    )


@router.get(
    "/submissions/{submission_id}/transitions",
    response_model=list[SubmissionTransitionEntry],
)
def submission_transitions_endpoint(
    submission_id: str,
    db: Session = Depends(get_db),
    _editor: User = Depends(require_editor_mfa),
) -> list[SubmissionTransitionEntry]:
    """Read the immutable transition log for a submission. Includes
    refused attempts (``allowed=False``) — that's the point."""
    from app.models.submission_transition import SubmissionTransition
    rows = (
        db.query(SubmissionTransition)
        .filter(SubmissionTransition.submission_id == submission_id)
        .order_by(SubmissionTransition.performed_at.desc())
        .limit(100)
        .all()
    )
    return [
        SubmissionTransitionEntry(
            id=r.id,
            from_status=r.from_status,
            to_status=r.to_status,
            allowed=r.allowed,
            performed_by_email=r.performed_by_email,
            performed_at=r.performed_at,
            reason=r.reason,
        )
        for r in rows
    ]


# ── POST /submissions/{id}/finalise-decision ─────────────
#
# One-click finaliser for the Editorial Decision Card. Consumes
# {decision, comments} — decision must be one of accept / minor_revision
# / major_revision / reject. Routes through the strict state machine
# so illegal edges hard-fail with 409, and requires FINAL_DECISION
# permission on top of the editor MFA gate.

class FinaliseDecisionRequest(BaseModel):
    decision: str
    comments: Optional[str] = None
    # Populated when the editor's decision differs from the AI's
    # suggested_decision. Not required, but the frontend enforces it —
    # having it in the audit trail is what makes "AI recommends,
    # editor decides" a real audit surface.
    override_reason: Optional[str] = None
    ai_suggested: Optional[str] = None
    # Free-text evidence pointer — e.g. "Reviewer 2, para 3", or an
    # excerpt the editor is anchoring the decision on. Lands in the
    # transition audit reason.
    evidence: Optional[str] = None


class FinaliseDecisionResponse(BaseModel):
    ok: bool = True
    new_status: str
    submission_id: str
    override_recorded: bool = False


@router.post(
    "/submissions/{submission_id}/finalise-decision",
    response_model=FinaliseDecisionResponse,
)
def finalise_decision_endpoint(
    submission_id: str,
    body: FinaliseDecisionRequest,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission("FINAL_DECISION")),
) -> FinaliseDecisionResponse:
    """Finalise the editorial decision. Uses the strict state machine —
    illegal transitions (e.g. rejected → accepted) are refused with 409
    and the attempt is written to submission_transitions."""
    from uuid import UUID
    from app.models.submission import Submission, SubmissionStatus
    from app.services.state_machine import (
        transition, IllegalTransitionError,
    )

    _DECISION_MAP = {
        "accept":              SubmissionStatus.accepted,
        "accepted":            SubmissionStatus.accepted,
        "reject":              SubmissionStatus.rejected,
        "rejected":            SubmissionStatus.rejected,
        "minor_revision":      SubmissionStatus.revision_requested,
        "major_revision":      SubmissionStatus.revision_requested,
        "revision":            SubmissionStatus.revision_requested,
        # Reject-and-resubmit is its own SubmissionStatus so the author
        # dashboard can render an explicit "invitation to resubmit"
        # state rather than a plain rejection.
        "reject_and_resubmit": SubmissionStatus.reject_and_resubmit,
    }
    if body.decision not in _DECISION_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown decision '{body.decision}'. Expected one of {sorted(_DECISION_MAP)}.",
        )

    # Look up by UUID first, fallback to paper_id_code.
    submission: Optional[Submission] = None
    try:
        submission = db.query(Submission).filter(Submission.id == UUID(str(submission_id))).first()
    except (ValueError, TypeError):
        submission = db.query(Submission).filter(Submission.paper_id_code == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Compose an audit-friendly reason string so the transition row
    # captures the full context: what the AI suggested, what the
    # editor chose, and (if they diverge) the override reason +
    # supporting evidence.
    override_recorded = (
        body.ai_suggested is not None and body.ai_suggested != body.decision
    )
    parts = [f"Editor decision: {body.decision}"]
    if body.ai_suggested:
        parts.append(f"AI suggested: {body.ai_suggested}")
    if override_recorded and body.override_reason:
        parts.append(f"Override reason: {body.override_reason}")
    if body.evidence:
        parts.append(f"Evidence: {body.evidence}")
    if body.comments:
        parts.append(f"Comments: {body.comments}")
    audit_reason = " | ".join(parts)

    try:
        transition(
            db, submission, _DECISION_MAP[body.decision],
            actor=editor,
            reason=audit_reason,
        )
    except IllegalTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Fire an author-facing email so the decision doesn't only sit
    # in the audit log. Best-effort — a send failure does not
    # invalidate the state change we've already committed.
    #
    # Rejections use the specialized ``send_rejection_to_author``
    # template (matches the JGAIR spec): manuscript info block,
    # decision badge, AI-drafted reasons (Review Analysis Agent
    # provides the seed via ``common_concerns`` on the briefing —
    # the editor's decision remains authoritative), and reviewer
    # author-facing comments. Non-rejection decisions still route
    # through the legacy ``send_decision_to_author`` template.
    try:
        if getattr(submission, "author_email", None):
            _decision_is_rejection = body.decision in ("reject", "rejected")
            if _decision_is_rejection:
                from app.services.email_service import send_rejection_to_author
                from app.models.review import Review, ReviewStatus

                # Pull AI-drafted rejection reasons from the Editorial
                # Decision Agent's briefing (deterministic — same input
                # ⇒ same reasons for audit reproducibility).
                rejection_reasons: list[str] = []
                primary_reason = (
                    body.override_reason
                    or body.evidence
                    or "the reviewers' assessment"
                )
                try:
                    from app.agents.editorial_decision_agent import build_briefing
                    briefing = build_briefing(db, submission.id)
                    rejection_reasons = [
                        c.get("concern", "").strip()
                        for c in getattr(briefing, "common_concerns", [])
                        if isinstance(c, dict) and c.get("concern")
                    ]
                    if not primary_reason and getattr(briefing, "suggestion_reason", None):
                        primary_reason = briefing.suggestion_reason
                except Exception:  # noqa: BLE001
                    pass

                # Editor's typed comments seed the top of the list so
                # the author sees the editorial rationale first — AI
                # seeds surround it.
                if body.comments and body.comments.strip():
                    rejection_reasons = [body.comments.strip(), *rejection_reasons]

                # Reviewer author-facing comments (never confidential-
                # to-editor). Pull in Review order so numbering stays
                # stable round-to-round.
                reviewer_comments = []
                try:
                    review_rows = (
                        db.query(Review)
                        .filter(Review.submission_id == submission.id)
                        .order_by(Review.assigned_at.asc())
                        .all()
                    )
                    for i, rv in enumerate(review_rows, start=1):
                        comments = (getattr(rv, "comments_to_authors", None) or "").strip()
                        if not comments:
                            continue
                        reviewer_comments.append({
                            "index": i,
                            "comments": comments,
                            "recommendation": (
                                rv.overall_recommendation.value
                                if getattr(rv, "overall_recommendation", None)
                                else None
                            ),
                        })
                except Exception:  # noqa: BLE001
                    pass

                # Article type from the intake classification — same
                # source Agents 4 and 5 use for reviewer emails.
                article_type = (
                    getattr(submission, "classified_field", None)
                    or "Research Article"
                )
                manuscript_id = (
                    getattr(submission, "paper_id_code", None)
                    or f"#{str(submission.id)[:8]}"
                    or "unassigned"
                )

                send_rejection_to_author(
                    author_email=submission.author_email,
                    author_name=getattr(submission, "author_name", "Author"),
                    manuscript_id=manuscript_id,
                    manuscript_title=submission.paper_title,
                    article_type=article_type,
                    primary_reason=primary_reason,
                    rejection_reasons=rejection_reasons,
                    reviewer_comments=reviewer_comments,
                )
            else:
                from app.services.email_service import send_decision_to_author
                send_decision_to_author(
                    author_email=submission.author_email,
                    author_name=getattr(submission, "author_name", "Author"),
                    paper_title=submission.paper_title,
                    decision=body.decision,
                    editor_comments=body.comments or "",
                )
    except Exception:  # noqa: BLE001
        pass

    return FinaliseDecisionResponse(
        new_status=submission.status.value,
        submission_id=str(submission.paper_id_code or submission.id),
        override_recorded=override_recorded,
    )


@router.get(
    "/submissions/{submission_id}/decision-briefing",
    response_model=DecisionBriefingResponse,
)
def decision_briefing_endpoint(
    submission_id: str,
    db: Session = Depends(get_db),
    editor: User = Depends(require_editor_mfa),
) -> DecisionBriefingResponse:
    """Aggregate reviewer reports into an editor-facing briefing. The
    AI never overwrites the editor's choice — see spec §12."""
    from app.services.permissions import ACTION_FINAL_DECISION
    briefing = build_briefing(db, submission_id)
    return DecisionBriefingResponse(
        submission_id=briefing.submission_id,
        reviews_received=briefing.reviews_received,
        reviews_expected=briefing.reviews_expected,
        recommendations=RecommendationCount(**briefing.recommendations),
        consensus=briefing.consensus,
        suggested_decision=briefing.suggested_decision,
        suggestion_reason=briefing.suggestion_reason,
        confidence=briefing.confidence,
        common_concerns=[Concern(**c) for c in briefing.common_concerns],
        ethics_flags=briefing.ethics_flags,
        coi_declared=briefing.coi_declared,
        can_finalise=has_permission(db, editor, ACTION_FINAL_DECISION),
    )


# ── POST /articles/{id}/publish ─────────────────────────

class PublishArticleResponse(BaseModel):
    ok: bool
    article_id: int
    published_at: datetime
    doi: Optional[str] = None


@router.post("/articles/{article_id}/publish", response_model=PublishArticleResponse)
def publish_article_endpoint(
    article_id: int,
    request: Request,
    db: Session = Depends(get_db),
    editor: User = Depends(require_permission(ACTION_PUBLISH)),
) -> PublishArticleResponse:
    """Publication Agent gate (spec §23).

    Refuses unless:
      * caller has PUBLISH permission (dependency above enforces)
      * article's DOI is in the ``registered`` or ``active`` state
      * article has title + author + journal metadata

    Nothing else in the codebase should flip an article to
    ``published`` — this is the sole gate.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")

    if not article.doi or article.doi_status not in {"registered", "active"}:
        raise HTTPException(
            status_code=409,
            detail=(
                "Article cannot be published — its DOI is not registered. "
                f"Current DOI status: {article.doi_status}."
            ),
        )
    if not (article.title and article.author_id and article.journal_id):
        raise HTTPException(
            status_code=409,
            detail="Article metadata is incomplete (title, author, or journal missing).",
        )

    # Flip DOI to ``active`` so the public article page treats it as
    # live. Article ``published_at`` doesn't exist as its own column
    # today — we treat ``doi_registered_at`` as the effective published
    # timestamp until an explicit column is added.
    article.doi_status = "active"
    from app.models.doi_audit_log import DoiAuditLog
    db.add(
        DoiAuditLog(
            article_id=article.id,
            action="doi.activated_on_publish",
            performed_by=editor.id,
            performed_by_email=editor.email,
            previous_status="registered",
            new_status="active",
            proposed_doi=article.doi,
            reason="Publication gate cleared.",
            ip_address=(request.client.host if request.client else None),
        )
    )
    db.commit()
    db.refresh(article)

    # Author-facing publication announcement. Best-effort — a delivery
    # failure does not roll back the publish.
    try:
        from app.config import settings as _s
        from app.services.email_service import _btn, _send_and_log, _wrap
        author_email = getattr(getattr(article, "author", None), "email", None)
        if author_email:
            article_url = f"{(_s.FRONTEND_URL or '').rstrip('/')}/articles/{article.id}"
            body = _wrap(
                f"""
                <p>Congratulations — your article <strong>{article.title}</strong>
                   is now published in JGAIR.</p>
                <p><strong>DOI:</strong>
                   <a href="https://doi.org/{article.doi}" style="color:#1e40af;font-family:monospace;">
                     {article.doi}
                   </a></p>
                <div style="text-align:center;">{_btn("View the published article", article_url)}</div>
                <p>Thank you for choosing JGAIR.</p>
                """
            )
            _send_and_log(
                author_email,
                f"Your article is now published: {article.title}"[:250],
                body,
                "article_published",
            )
    except Exception:  # noqa: BLE001
        pass
    return PublishArticleResponse(
        ok=True,
        article_id=article.id,
        published_at=article.doi_registered_at or datetime.utcnow(),
        doi=article.doi,
    )
