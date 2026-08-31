"""Volumes, Issues, and issue-article assignment endpoints.

Public reads (list volumes, browse issues, view issue TOC) plus editor-gated
writes for creating volumes/issues and assigning accepted articles to issues.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.volume import Issue, IssueArticle, Volume
from app.schemas.volume import (
    IssueArticleCreate,
    IssueArticleRead,
    IssueCreate,
    IssueDetail,
    IssueRead,
    IssueUpdate,
    VolumeCreate,
    VolumeRead,
    VolumeUpdate,
)
from app.services.editor_auth import require_editor_mfa

router = APIRouter()


def _issue_to_read(issue: Issue) -> IssueRead:
    return IssueRead(
        id=issue.id,
        volume_id=issue.volume_id,
        number=issue.number,
        title=issue.title,
        theme=issue.theme,
        month=issue.month,
        status=issue.status,
        editorial_note=issue.editorial_note,
        deadline=issue.deadline,
        published_at=issue.published_at,
        article_count=len(issue.article_links or []),
    )


def _volume_to_read(volume: Volume) -> VolumeRead:
    return VolumeRead(
        id=volume.id,
        journal_id=volume.journal_id,
        number=volume.number,
        year=volume.year,
        title=volume.title,
        issues=[_issue_to_read(i) for i in volume.issues],
    )


def _article_display_name(article: Article) -> Optional[str]:
    author = getattr(article, "author", None)
    if author is None:
        return None
    return (
        getattr(author, "full_name", None)
        or getattr(author, "username", None)
    )


def _issue_article_to_read(link: IssueArticle) -> IssueArticleRead:
    article = link.article
    return IssueArticleRead(
        id=link.id,
        issue_id=link.issue_id,
        article_id=link.article_id,
        sequence=link.sequence,
        page_start=link.page_start,
        page_end=link.page_end,
        doi=link.doi,
        category=link.category,
        article_title=article.title if article else None,
        article_display=_article_display_name(article) if article else None,
    )


# ── Volumes (public read, editor write) ─────────────────

@router.get("/volumes", response_model=List[VolumeRead])
def list_volumes(db: Session = Depends(get_db)):
    volumes = (
        db.query(Volume)
        .options(joinedload(Volume.issues).joinedload(Issue.article_links))
        .order_by(Volume.year.desc(), Volume.number.desc())
        .all()
    )
    return [_volume_to_read(v) for v in volumes]


@router.get("/volumes/{volume_id}", response_model=VolumeRead)
def get_volume(volume_id: int, db: Session = Depends(get_db)):
    volume = (
        db.query(Volume)
        .options(joinedload(Volume.issues).joinedload(Issue.article_links))
        .filter(Volume.id == volume_id)
        .first()
    )
    if volume is None:
        raise HTTPException(status_code=404, detail="Volume not found")
    return _volume_to_read(volume)


@router.post("/volumes", response_model=VolumeRead, status_code=status.HTTP_201_CREATED)
def create_volume(
    payload: VolumeCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    existing = (
        db.query(Volume)
        .filter(Volume.journal_id == payload.journal_id, Volume.number == payload.number)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Volume {payload.number} already exists for this journal.",
        )
    volume = Volume(
        journal_id=payload.journal_id,
        number=payload.number,
        year=payload.year,
        title=payload.title,
    )
    db.add(volume)
    db.commit()
    db.refresh(volume)
    return _volume_to_read(volume)


@router.patch("/volumes/{volume_id}", response_model=VolumeRead)
def update_volume(
    volume_id: int,
    payload: VolumeUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    volume = db.query(Volume).filter(Volume.id == volume_id).first()
    if volume is None:
        raise HTTPException(status_code=404, detail="Volume not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(volume, key, value)
    db.commit()
    db.refresh(volume)
    return _volume_to_read(volume)


@router.delete("/volumes/{volume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_volume(
    volume_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    volume = db.query(Volume).filter(Volume.id == volume_id).first()
    if volume is None:
        raise HTTPException(status_code=404, detail="Volume not found")
    db.delete(volume)
    db.commit()
    return None


# ── Issues ──────────────────────────────────────────────

@router.get("/issues", response_model=List[IssueRead])
def list_issues(
    volume_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Issue).options(joinedload(Issue.article_links))
    if volume_id:
        q = q.filter(Issue.volume_id == volume_id)
    if status_filter:
        q = q.filter(Issue.status == status_filter)
    return [_issue_to_read(i) for i in q.order_by(Issue.volume_id, Issue.number).all()]


@router.get("/issues/{issue_id}", response_model=IssueDetail)
def get_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = (
        db.query(Issue)
        .options(
            joinedload(Issue.volume),
            joinedload(Issue.article_links).joinedload(IssueArticle.article),
        )
        .filter(Issue.id == issue_id)
        .first()
    )
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    volume = issue.volume
    return IssueDetail(
        id=issue.id,
        volume_id=issue.volume_id,
        number=issue.number,
        title=issue.title,
        theme=issue.theme,
        month=issue.month,
        status=issue.status,
        editorial_note=issue.editorial_note,
        deadline=issue.deadline,
        published_at=issue.published_at,
        article_count=len(issue.article_links or []),
        volume_number=volume.number if volume else 0,
        volume_year=volume.year if volume else 0,
        articles=[_issue_article_to_read(link) for link in issue.article_links],
    )


@router.post("/issues", response_model=IssueRead, status_code=status.HTTP_201_CREATED)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    volume = db.query(Volume).filter(Volume.id == payload.volume_id).first()
    if volume is None:
        raise HTTPException(status_code=404, detail="Volume not found")
    existing = (
        db.query(Issue)
        .filter(Issue.volume_id == payload.volume_id, Issue.number == payload.number)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Issue {payload.number} already exists for volume {volume.number}.",
        )
    issue = Issue(**payload.model_dump())
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return _issue_to_read(issue)


@router.patch("/issues/{issue_id}", response_model=IssueRead)
def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(issue, key, value)
    db.commit()
    db.refresh(issue)
    return _issue_to_read(issue)


@router.delete("/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    db.delete(issue)
    db.commit()
    return None


# ── Issue-article assignment ────────────────────────────

@router.post(
    "/issues/{issue_id}/articles",
    response_model=IssueArticleRead,
    status_code=status.HTTP_201_CREATED,
)
def add_article_to_issue(
    issue_id: int,
    payload: IssueArticleCreate,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    article = db.query(Article).filter(Article.id == payload.article_id).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    existing = (
        db.query(IssueArticle)
        .filter(IssueArticle.issue_id == issue_id, IssueArticle.article_id == payload.article_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="Article is already assigned to this issue."
        )

    link = IssueArticle(issue_id=issue_id, **payload.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    link = (
        db.query(IssueArticle)
        .options(joinedload(IssueArticle.article))
        .filter(IssueArticle.id == link.id)
        .first()
    )
    return _issue_article_to_read(link)


@router.delete(
    "/issues/{issue_id}/articles/{link_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_article_from_issue(
    issue_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    _editor=Depends(require_editor_mfa),
):
    link = (
        db.query(IssueArticle)
        .filter(IssueArticle.id == link_id, IssueArticle.issue_id == issue_id)
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Issue article link not found")
    db.delete(link)
    db.commit()
    return None
