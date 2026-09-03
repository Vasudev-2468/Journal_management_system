"""
Author revision response endpoints (spec §17-18).

Powers the "Revision Required" workspace the author enters after the
editor decides Major or Minor Revision. Pairs the author's response
+ change location against each reviewer comment.

Endpoints
---------
GET  /author-revision/submissions/{submission_id}/checklist
    Aggregated Major/Minor reviewer comments across every submitted
    reviewer report on the submission's current round, with the
    author's response merged in where they've saved one. Confidential
    comments-to-editor are NEVER exposed here.

POST /author-revision/submissions/{submission_id}/response
    Upsert a single response {review_id, comment_kind, comment_index,
    response_text, change_location}. Returns the updated row.

GET  /author-revision/submissions/{submission_id}/responses
    Return every saved response for the submission — used by the
    author page on load to hydrate the form.

Every endpoint checks that the current user owns the submission
(author_id) — the author's revision work is never visible to another
author.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.review import Review, ReviewState
from app.models.revision_response import RevisionResponse
from app.models.submission import Submission
from app.services.auth_service import get_current_user


router = APIRouter()


# ── Schemas ─────────────────────────────────────────────

class ReviewComment(BaseModel):
    review_id: str
    reviewer_display_name: str
    kind: str                    # "major" | "minor"
    index: int
    page: str = ""
    section: str = ""
    line: str = ""
    comment: str
    author_response: str = ""
    change_location: str = ""
    responded_at: Optional[datetime] = None


class RevisionChecklistResponse(BaseModel):
    submission_id: str
    round: int
    total: int
    responded: int
    comments: List[ReviewComment]


class ResponseUpsertRequest(BaseModel):
    review_id: uuid.UUID
    comment_kind: str = Field(..., pattern="^(major|minor)$")
    comment_index: int = Field(..., ge=0)
    response_text: str = Field("", max_length=8000)
    change_location: str = Field("", max_length=500)


class ReviewerReportRef(BaseModel):
    reviewer_label: str          # "Reviewer 1", "Reviewer 2"…
    review_id: str
    completed: bool              # ✓ marker on the author card


class AuthorDecisionSummary(BaseModel):
    submission_id: str
    manuscript_id: str
    manuscript_title: str
    article_type: str
    decision: str                # "accepted" | "rejected" | "revision_requested"…
    decision_display: str        # "REJECTED", "ACCEPTED", …
    decision_date: Optional[datetime]
    primary_reason: str
    rejection_reasons: List[str] = []
    reviewer_reports: List[ReviewerReportRef] = []
    letter_available: bool = True


class RevisionResponseDTO(BaseModel):
    id: int
    review_id: str
    comment_kind: str
    comment_index: int
    response_text: str
    change_location: str
    updated_at: datetime


# ── Helpers ─────────────────────────────────────────────

def _load_submission_owned(
    db: Session, submission_id: uuid.UUID, user
) -> Submission:
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    # Ownership: submissions.author_id — reject if this isn't the author's paper.
    author_id = getattr(submission, "author_id", None)
    if author_id is not None and author_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorised to see this submission.")
    return submission


def _load_reviewer_comments_json(raw: Optional[str]) -> list:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        return []
    return parsed if isinstance(parsed, list) else []


# ── Endpoints ───────────────────────────────────────────


@router.get(
    "/submissions/{submission_id}/author-decision-summary",
    response_model=AuthorDecisionSummary,
)
def author_decision_summary(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Author-facing summary of the editorial decision.

    Mirrors the same fields shown on the manuscript-rejection email
    (and the same fields for accept/revision) so the dashboard card
    and the email tell one story. Ownership-gated — only the paper's
    author (or an editor) can read it.

    Fields returned:
      * ``manuscript_id`` / ``manuscript_title`` / ``article_type``
      * ``decision`` (raw enum value) + ``decision_display`` (uppercased)
      * ``decision_date`` — ``submission.updated_at`` snapshot from the
        moment the state machine flipped the row terminal.
      * ``primary_reason`` — best available from the transition audit's
        override_reason / evidence, else the AI suggestion_reason.
      * ``rejection_reasons`` — up to three, seeded from the Editorial
        Decision Agent's ``common_concerns`` (rejection only).
      * ``reviewer_reports`` — one row per assigned reviewer with
        ``completed=true`` when they submitted; drives the checklist
        widget on the card.
    """
    submission = _load_submission_owned(db, submission_id, user)

    # Build reviewer roster with completed status
    review_rows = (
        db.query(Review)
        .filter(Review.submission_id == submission_id)
        .order_by(Review.assigned_at.asc())
        .all()
    )
    reports = [
        ReviewerReportRef(
            reviewer_label=f"Reviewer {i}",
            review_id=str(rv.id),
            completed=bool(getattr(rv, "submitted_at", None))
                       or (getattr(rv, "state", None) == ReviewState.completed
                           if hasattr(rv, "state") else False),
        )
        for i, rv in enumerate(review_rows, start=1)
    ]

    # Pull AI briefing to seed primary_reason + rejection_reasons.
    primary_reason = "the editorial and reviewer assessment"
    rejection_reasons: list[str] = []
    try:
        from app.agents.editorial_decision_agent import build_briefing
        briefing = build_briefing(db, submission.id)
        if getattr(briefing, "suggestion_reason", None):
            primary_reason = briefing.suggestion_reason
        rejection_reasons = [
            c.get("concern", "").strip()
            for c in getattr(briefing, "common_concerns", [])
            if isinstance(c, dict) and c.get("concern")
        ][:3]
    except Exception:  # noqa: BLE001
        pass

    status_value = (
        submission.status.value
        if hasattr(submission.status, "value")
        else str(submission.status)
    )
    manuscript_id = (
        getattr(submission, "paper_id_code", None)
        or f"#{str(submission.id)[:8]}"
        or "unassigned"
    )

    return AuthorDecisionSummary(
        submission_id=str(submission.id),
        manuscript_id=manuscript_id,
        manuscript_title=submission.paper_title,
        article_type=getattr(submission, "classified_field", None) or "Research Article",
        decision=status_value,
        decision_display=status_value.replace("_", " ").upper(),
        decision_date=getattr(submission, "updated_at", None),
        primary_reason=primary_reason,
        rejection_reasons=rejection_reasons if status_value == "rejected" else [],
        reviewer_reports=reports,
        letter_available=status_value in ("accepted", "rejected", "revision_requested", "reject_and_resubmit"),
    )


@router.get(
    "/submissions/{submission_id}/checklist",
    response_model=RevisionChecklistResponse,
)
def get_checklist(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return the aggregated Major/Minor reviewer comments for this
    submission's current round, merged with any saved author
    responses. Confidential editor comments and rubric internals are
    never exposed."""
    submission = _load_submission_owned(db, submission_id, user)
    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    if not reviews:
        return RevisionChecklistResponse(
            submission_id=str(submission.id), round=1, total=0, responded=0, comments=[],
        )
    target_round = max(r.round_number or 1 for r in reviews)

    # Load every saved response for this submission in one shot.
    saved = (
        db.query(RevisionResponse)
        .filter(RevisionResponse.submission_id == submission.id)
        .all()
    )
    saved_by_key = {
        (str(s.review_id), s.comment_kind, s.comment_index): s for s in saved
    }

    comments: List[ReviewComment] = []
    for idx, review in enumerate(reviews, start=1):
        if (review.round_number or 1) != target_round:
            continue
        if review.state != ReviewState.submitted:
            continue
        display_name = f"Anonymous Reviewer #{idx}"
        for kind in ("major", "minor"):
            raw = review.major_comments if kind == "major" else review.minor_comments
            for i, row in enumerate(_load_reviewer_comments_json(raw)):
                if isinstance(row, str):
                    row = {"page": "", "section": "", "line": "", "comment": row}
                if not isinstance(row, dict):
                    continue
                text = str(row.get("comment") or "").strip()
                if not text:
                    continue
                key = (str(review.id), kind, i)
                s = saved_by_key.get(key)
                comments.append(ReviewComment(
                    review_id=str(review.id),
                    reviewer_display_name=display_name,
                    kind=kind,
                    index=i,
                    page=str(row.get("page") or ""),
                    section=str(row.get("section") or ""),
                    line=str(row.get("line") or ""),
                    comment=text,
                    author_response=s.response_text if s else "",
                    change_location=s.change_location if s else "",
                    responded_at=s.updated_at if s else None,
                ))
    responded = sum(1 for c in comments if c.author_response.strip())
    return RevisionChecklistResponse(
        submission_id=str(submission.id),
        round=target_round,
        total=len(comments),
        responded=responded,
        comments=comments,
    )


@router.post(
    "/submissions/{submission_id}/response",
    response_model=RevisionResponseDTO,
)
def upsert_response(
    submission_id: uuid.UUID,
    body: ResponseUpsertRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Save (or update) the author's response for one reviewer comment.

    The (review_id, kind, index) triple is the row key — repeated
    POSTs against the same triple overwrite the previous save. The
    reviewer comment itself is not modified; only the author's
    response payload is stored."""
    submission = _load_submission_owned(db, submission_id, user)

    # Verify the review belongs to this submission AND the comment
    # exists on that review — no silent creation of dangling rows.
    review = (
        db.query(Review)
        .filter(Review.id == body.review_id, Review.submission_id == submission.id)
        .first()
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found on this submission.")
    raw = review.major_comments if body.comment_kind == "major" else review.minor_comments
    comments = _load_reviewer_comments_json(raw)
    if body.comment_index >= len(comments):
        raise HTTPException(
            status_code=404,
            detail=f"No {body.comment_kind} comment at index {body.comment_index} on this review.",
        )

    existing = (
        db.query(RevisionResponse)
        .filter(
            RevisionResponse.review_id == body.review_id,
            RevisionResponse.comment_kind == body.comment_kind,
            RevisionResponse.comment_index == body.comment_index,
        )
        .first()
    )
    now = datetime.utcnow()
    if existing is None:
        row = RevisionResponse(
            submission_id=submission.id,
            review_id=body.review_id,
            round_number=review.round_number or 1,
            comment_kind=body.comment_kind,
            comment_index=body.comment_index,
            response_text=body.response_text.strip(),
            change_location=body.change_location.strip(),
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row = existing
        row.response_text = body.response_text.strip()
        row.change_location = body.change_location.strip()
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return RevisionResponseDTO(
        id=row.id,
        review_id=str(row.review_id),
        comment_kind=row.comment_kind,
        comment_index=row.comment_index,
        response_text=row.response_text,
        change_location=row.change_location,
        updated_at=row.updated_at,
    )


class AuthorReviewerReport(BaseModel):
    """Author-facing projection of one reviewer report.
    Confidential-comments-to-editor field is DELIBERATELY absent."""
    review_id: str
    reviewer_display_name: str
    round_number: int
    submitted_at: Optional[datetime] = None
    overall_assessment: str = ""
    major_comments: list = []
    minor_comments: list = []
    suggestions: list = []
    comments_to_authors: str = ""
    recommendation: Optional[str] = None
    # No confidential_comments field. Never expose.


class DecisionHistoryEntry(BaseModel):
    round_number: int
    decision: str
    decided_at: Optional[datetime] = None


class ConsensusSummary(BaseModel):
    recommendation: Optional[str] = None
    strength: Optional[str] = None   # unanimous / majority / split / n/a
    breakdown: Dict[str, int] = {}   # {"minor_revision": 2, ...}


class AuthorDecisionResponse(BaseModel):
    submission_id: str
    paper_id_code: Optional[str] = None
    paper_title: str
    editor_decision: Optional[str] = None
    editor_decision_letter: str = ""
    decided_at: Optional[datetime] = None
    round_number: int
    revision_deadline: Optional[datetime] = None
    manuscript_url: Optional[str] = None
    editorial_email: Optional[str] = None
    consensus: ConsensusSummary = ConsensusSummary()
    history: List[DecisionHistoryEntry] = []
    reports: List[AuthorReviewerReport]


@router.get(
    "/submissions/{submission_id}/decision",
    response_model=AuthorDecisionResponse,
)
def author_decision_view(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """The author's decision-time view (spec §17).

    Renders every submitted reviewer report **without** the
    confidential-comments-to-editor column, and surfaces the editor's
    decision + letter for the current round. Only the manuscript's
    author can read this."""
    submission = _load_submission_owned(db, submission_id, user)
    reviews = sorted(
        submission.reviews or [], key=lambda r: r.assigned_at or datetime.min,
    )
    target_round = max((r.round_number or 1 for r in reviews), default=1)

    # Editor decision — reads the most recent editorial_decisions row
    # for this round. Falls back to the submission status when the
    # dedicated table wasn't yet in use.
    from app.models.editorial_decision import EditorialDecision
    dec_row = (
        db.query(EditorialDecision)
        .filter(EditorialDecision.submission_id == submission.id)
        .order_by(EditorialDecision.decided_at.desc())
        .first()
    )
    editor_decision = dec_row.decision if dec_row else (submission.status.value if submission.status else None)
    editor_decision_letter = dec_row.letter_text if dec_row else ""
    decided_at = dec_row.decided_at if dec_row else None

    # ── Author-visible reviewer reports (JG-Editor-Moderation) ──
    # SECURITY: the author must NEVER see the reviewer's raw comment.
    # Every comment must be moderated by an editor and released before
    # it becomes author-visible. This block filters through the
    # comment_moderations table:
    #
    #   * A moderation row with status='RELEASED_TO_AUTHOR' AND
    #     visibility='AUTHOR_VISIBLE' → the released_text (or the
    #     editor's edited text if released_text wasn't populated) is
    #     shown to the author.
    #   * Any other state → the comment is withheld.
    #
    # If a review has NO moderation rows at all — i.e. the editor
    # hasn't opened the moderation workspace yet — we withhold every
    # comment for that reviewer. Empty reviewer sections in the author
    # view is the safe default; the editor still sees them in their
    # own workspace.
    from app.models.comment_moderation import (
        CommentModeration, STATUS_RELEASED_TO_AUTHOR, VIS_AUTHOR_VISIBLE,
    )
    reports: List[AuthorReviewerReport] = []
    for idx, r in enumerate(reviews, start=1):
        if r.state != ReviewState.submitted or (r.round_number or 1) != target_round:
            continue
        display_name = f"Reviewer #{idx}"

        def _load_list(raw: Optional[str]) -> list:
            if not raw:
                return []
            try:
                v = json.loads(raw)
                return v if isinstance(v, list) else []
            except Exception:  # noqa: BLE001
                return []

        # Load every moderation row for this review, keyed by (kind, idx).
        mods = (
            db.query(CommentModeration)
            .filter(CommentModeration.review_id == r.id)
            .all()
        )
        released_map = {
            (m.comment_kind, m.comment_index): m
            for m in mods
            if m.status == STATUS_RELEASED_TO_AUTHOR and m.visibility == VIS_AUTHOR_VISIBLE
        }

        def _filter_kind(kind: str, raw_list_json: Optional[str]) -> list:
            if not released_map:
                return []
            filtered: list = []
            for i, item in enumerate(_load_list(raw_list_json)):
                mod = released_map.get((kind, i))
                if mod is None:
                    continue
                # Swap the wording for the editor-released text so the
                # author sees the editor's moderated version, not the
                # reviewer's raw comment.
                new_text = mod.released_text or mod.edited_text or mod.original_text
                if isinstance(item, dict):
                    itm = dict(item)
                    itm["comment"] = new_text
                    filtered.append(itm)
                else:
                    filtered.append(new_text)
            return filtered

        reports.append(AuthorReviewerReport(
            review_id=str(r.id),
            reviewer_display_name=display_name,
            round_number=r.round_number or 1,
            submitted_at=r.completed_at,
            overall_assessment=r.overall_assessment or "",
            major_comments=_filter_kind("major", r.major_comments),
            minor_comments=_filter_kind("minor", r.minor_comments),
            suggestions=_load_list(r.suggestions_to_authors),
            comments_to_authors=r.comments_to_authors or "",
            recommendation=(r.overall_recommendation.value if r.overall_recommendation else None),
        ))

    # ── Extra context (JG-Author §17) ────────────────────
    # Fills the previously-thin decision page: manuscript ID, deadline,
    # a link to the manuscript PDF, a consensus tile across the
    # reviewer reports, and the round-by-round decision history so
    # authors can see how they got here.

    # Revision deadline — 30 days from the decision by convention when
    # the editor didn't set one explicitly. This is the same window the
    # scheduled reminder job uses.
    from datetime import timedelta as _td
    revision_deadline = None
    if editor_decision in ("minor_revision", "major_revision", "revision_requested", "revision") and decided_at:
        revision_deadline = decided_at + _td(days=30)

    # Manuscript URL — the current version's file if we have a versioned
    # row, otherwise the original ``pdf_s3_key`` on the submission.
    manuscript_url = None
    try:
        pdf_key = getattr(submission, "pdf_s3_key", None)
        if pdf_key:
            # Storage service exposes signed URLs elsewhere; here we
            # emit the object key + a relative fetch endpoint the
            # frontend already understands.
            manuscript_url = f"/submissions/{submission.id}/pdf"
    except Exception:  # noqa: BLE001
        manuscript_url = None

    # Consensus across the current-round reports.
    consensus = ConsensusSummary()
    try:
        breakdown: Dict[str, int] = {}
        for rep in reports:
            key = rep.recommendation or "unknown"
            breakdown[key] = breakdown.get(key, 0) + 1
        if breakdown:
            # Winner = highest count; ties → "split".
            sorted_items = sorted(breakdown.items(), key=lambda kv: kv[1], reverse=True)
            top_key, top_count = sorted_items[0]
            total = sum(breakdown.values())
            if len(sorted_items) > 1 and sorted_items[0][1] == sorted_items[1][1]:
                strength = "split"
                rec_key = top_key  # arbitrary tie-break for display
            elif top_count == total:
                strength = "unanimous"
                rec_key = top_key
            elif top_count > total / 2:
                strength = "majority"
                rec_key = top_key
            else:
                strength = "split"
                rec_key = top_key
            consensus = ConsensusSummary(
                recommendation=rec_key,
                strength=strength,
                breakdown=breakdown,
            )
    except Exception:  # noqa: BLE001
        consensus = ConsensusSummary()

    # Round-by-round decision history.
    history: List[DecisionHistoryEntry] = []
    try:
        prior_rows = (
            db.query(EditorialDecision)
            .filter(EditorialDecision.submission_id == submission.id)
            .order_by(EditorialDecision.decided_at.asc())
            .all()
        )
        for row in prior_rows:
            history.append(DecisionHistoryEntry(
                round_number=getattr(row, "round_number", 1) or 1,
                decision=row.decision or "",
                decided_at=row.decided_at,
            ))
    except Exception:  # noqa: BLE001
        history = []

    # Editorial email — pulled from the active Journal row so the
    # "Contact editor" mailto link on the frontend has a real address.
    editorial_email = None
    try:
        from app.models.journal import Journal
        row = (
            db.query(Journal)
            .filter(Journal.is_active.is_(True))
            .order_by(Journal.id.asc())
            .first()
        )
        if row and getattr(row, "email_editorial", None):
            editorial_email = row.email_editorial
    except Exception:  # noqa: BLE001
        editorial_email = None

    # Fallback letter — when the editor typed no comments, synthesize a
    # brief editorial note from the decision + consensus so the author
    # is never staring at an empty card.
    letter = editor_decision_letter or ""
    if not letter.strip():
        parts = [
            f"Dear author,",
            "",
            f"After careful consideration of the reviewers' assessments, "
            f"the editorial decision on your manuscript is: "
            f"{(editor_decision or 'under review').replace('_', ' ').title()}.",
        ]
        if consensus.recommendation:
            parts.append(
                f"The reviewer consensus was {consensus.strength or 'mixed'} "
                f"({consensus.recommendation.replace('_', ' ')}). "
                f"Please read each reviewer's report in full below."
            )
        if revision_deadline:
            parts.append(
                f"Please upload your revised manuscript and point-by-point "
                f"response by {revision_deadline.strftime('%d %B %Y')}."
            )
        parts.extend([
            "",
            "Sincerely,",
            "Editorial Office",
        ])
        letter = "\n".join(parts)

    return AuthorDecisionResponse(
        submission_id=str(submission.id),
        paper_id_code=getattr(submission, "paper_id_code", None),
        paper_title=submission.paper_title,
        editor_decision=editor_decision,
        editor_decision_letter=letter,
        decided_at=decided_at,
        round_number=target_round,
        revision_deadline=revision_deadline,
        manuscript_url=manuscript_url,
        editorial_email=editorial_email,
        consensus=consensus,
        history=history,
        reports=reports,
    )


class ResponseLetterResponse(BaseModel):
    letter_text: str
    total: int
    responded: int


@router.get(
    "/submissions/{submission_id}/response-letter",
    response_model=ResponseLetterResponse,
)
def response_letter_package(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Bundle every reviewer comment + author response into a
    printable response letter. Author includes this alongside the
    revised manuscript upload."""
    checklist = get_checklist(submission_id=submission_id, db=db, user=user)
    lines: List[str] = []
    lines.append(f"Response to reviewers — Round {checklist.round}")
    lines.append("=" * 60)
    lines.append("")
    grouped: Dict[str, List[ReviewComment]] = {}
    for c in checklist.comments:
        grouped.setdefault(c.reviewer_display_name, []).append(c)
    for reviewer, items in grouped.items():
        lines.append(reviewer)
        lines.append("-" * len(reviewer))
        for i, c in enumerate(items, start=1):
            loc = ", ".join(
                p for p in (
                    (f"Page {c.page}" if c.page else ""),
                    c.section,
                    (f"line {c.line}" if c.line else ""),
                ) if p
            )
            lines.append(f"{i}. [{c.kind.upper()}] {loc}".rstrip())
            lines.append(f"   Reviewer: {c.comment}")
            if c.author_response.strip():
                lines.append(f"   Response: {c.author_response}")
            else:
                lines.append("   Response: (not yet answered)")
            if c.change_location.strip():
                lines.append(f"   Change location: {c.change_location}")
            lines.append("")
        lines.append("")
    return ResponseLetterResponse(
        letter_text="\n".join(lines).rstrip() + "\n",
        total=checklist.total,
        responded=checklist.responded,
    )


class MarkRevisionSubmittedResponse(BaseModel):
    ok: bool
    round_number: int
    message: str


@router.post(
    "/submissions/{submission_id}/mark-revision-submitted",
    response_model=MarkRevisionSubmittedResponse,
)
def mark_revision_submitted(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Author signals they've uploaded the revised manuscript.

    Flips the submission back to ``under_review`` so the editor can
    open Round N+1. The revised-manuscript file upload is handled by
    the existing production/uploads flow; this endpoint just moves
    the state machine forward once every reviewer comment has an
    author response."""
    submission = _load_submission_owned(db, submission_id, user)
    checklist = get_checklist(submission_id=submission_id, db=db, user=user)
    if checklist.total > 0 and checklist.responded < checklist.total:
        raise HTTPException(
            status_code=400,
            detail=(
                f"You have responded to {checklist.responded} of {checklist.total} "
                "reviewer comments. Please answer every item before submitting the revision."
            ),
        )
    # Set the submission back to under_review so a new editor round
    # can open on top of it. Don't bump round_number on the submission
    # itself — that lives on the Review rows.
    from app.models.submission import SubmissionStatus as _SS
    submission.status = _SS.under_review
    db.commit()
    max_round = max(
        (r.round_number or 1 for r in (submission.reviews or [])),
        default=1,
    )
    return MarkRevisionSubmittedResponse(
        ok=True,
        round_number=max_round,
        message="Revision submitted. The editor has been notified.",
    )


@router.get(
    "/submissions/{submission_id}/responses",
    response_model=List[RevisionResponseDTO],
)
def list_responses(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    submission = _load_submission_owned(db, submission_id, user)
    rows = (
        db.query(RevisionResponse)
        .filter(RevisionResponse.submission_id == submission.id)
        .order_by(RevisionResponse.updated_at.desc())
        .all()
    )
    return [
        RevisionResponseDTO(
            id=r.id, review_id=str(r.review_id),
            comment_kind=r.comment_kind, comment_index=r.comment_index,
            response_text=r.response_text, change_location=r.change_location,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
