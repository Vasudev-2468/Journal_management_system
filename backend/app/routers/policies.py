"""JG-102 + JG-103 — CMS-driven policy pages.

Public GET by slug; editor-gated PATCH. Individual public routes (
/publication-ethics, /open-access, /copyright) live in the frontend and
hydrate from GET /policies/{slug}.
"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.policy_page import PolicyPage
from app.models.user import User, UserRole
from app.schemas.policy_page import PolicyPageCreate, PolicyPageRead, PolicyPageUpdate
from app.services.editor_auth import require_editor_mfa
from app.services.permissions import ACTION_CONFIGURE_JOURNAL, require_permission

router = APIRouter()

# Roles allowed to edit policy content. Matches the identity-edit gate in
# journals.py; JG-407 formalises this into a proper permission matrix.
_POLICY_EDIT_ROLES = {UserRole.admin, UserRole.editor}


def _require_policy_editor(user: User = Depends(require_permission(ACTION_CONFIGURE_JOURNAL))) -> User:
    if user.role not in _POLICY_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Only editors_in_chief and admins can edit policies")
    return user


@router.get("/", response_model=List[PolicyPageRead])
def list_policies(db: Session = Depends(get_db)):
    """Return every published policy — used by nav dropdowns / sitemaps."""
    return (
        db.query(PolicyPage)
        .filter(PolicyPage.is_published.is_(True))
        .order_by(PolicyPage.slug.asc())
        .all()
    )


@router.get("/{slug}", response_model=PolicyPageRead)
def get_policy(slug: str, db: Session = Depends(get_db)):
    page = db.query(PolicyPage).filter(PolicyPage.slug == slug).first()
    if page is None or not page.is_published:
        raise HTTPException(status_code=404, detail="Policy not found")
    return page


@router.post("/", response_model=PolicyPageRead, status_code=201)
def create_policy(
    payload: PolicyPageCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_policy_editor),
):
    slug = payload.slug.strip().lower()
    if not slug:
        raise HTTPException(status_code=422, detail="slug is required")
    existing = db.query(PolicyPage).filter(PolicyPage.slug == slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Policy with slug '{slug}' already exists.")

    body_serialised = [
        section.model_dump() if hasattr(section, "model_dump") else section
        for section in payload.body
    ]
    now = datetime.utcnow()
    page = PolicyPage(
        slug=slug,
        title=payload.title,
        subtitle=payload.subtitle,
        body=body_serialised,
        footer_note=payload.footer_note,
        version=1,
        is_published=payload.is_published,
        last_reviewed_at=now,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.delete("/{slug}", status_code=204)
def delete_policy(
    slug: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_policy_editor),
):
    page = db.query(PolicyPage).filter(PolicyPage.slug == slug).first()
    if page is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(page)
    db.commit()
    return None


@router.patch("/{slug}", response_model=PolicyPageRead)
def update_policy(
    slug: str,
    payload: PolicyPageUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_policy_editor),
):
    page = db.query(PolicyPage).filter(PolicyPage.slug == slug).first()
    if page is None:
        raise HTTPException(status_code=404, detail="Policy not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return page

    # Fix R6 — `body` and `is_published` are NOT NULL on the model, so an
    # explicit `null` in the payload must be a 422, not a 500. Reject early.
    for required in ("body", "is_published"):
        if required in updates and updates[required] is None:
            raise HTTPException(
                status_code=422,
                detail=f"Field '{required}' cannot be null.",
            )

    # `body` comes as a list of PolicySection Pydantic objects; store as JSON.
    if "body" in updates:
        updates["body"] = [section.model_dump() if hasattr(section, "model_dump") else section
                           for section in updates["body"]]

    for key, value in updates.items():
        setattr(page, key, value)

    # Version increment + review timestamp on every real save.
    page.version = (page.version or 1) + 1
    page.last_reviewed_at = datetime.utcnow()

    db.commit()
    db.refresh(page)
    return page
