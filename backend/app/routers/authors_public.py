"""Public author profile — read-only, unauthenticated.

Exposes ONLY the fields that are safe for anyone on the internet to see —
never the user's email, hashed password, MFA secrets, TOTP secrets, or
lockout state. The response shape is deliberately narrower than the
authenticated `/users/*` endpoints so that a mistake in the User schema
cannot leak a private attribute here.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article
from app.models.user import User, UserRole

router = APIRouter()


class AuthorPublicArticle(BaseModel):
    id: int
    title: str
    abstract: Optional[str] = None
    journal_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AuthorPublicProfile(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: str
    orcid: Optional[str] = None
    institution: Optional[str] = None
    country: Optional[str] = None
    department: Optional[str] = None
    research_areas: Optional[str] = None
    bio: Optional[str] = None
    articles: List[AuthorPublicArticle] = []

    model_config = ConfigDict(from_attributes=True)


@router.get("/{user_id}", response_model=AuthorPublicProfile)
def get_author_public(user_id: int, db: Session = Depends(get_db)):
    """Return a public-safe author profile plus a lightweight article list.

    Never exposes: email, hashed_password, mfa_* fields, totp_* fields,
    whatsapp_number, or lockout timers. If the user is not an active author,
    or does not exist, returns 404 — never leak the specific reason (so an
    attacker cannot use this endpoint to test which emails are registered
    editors vs. authors).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.is_active is False:
        raise HTTPException(status_code=404, detail="Author not found")

    # Only surface accounts that authors would reasonably expect to be
    # publicly discoverable — anyone with a byline. Editors, admins, and
    # section editors are addressable via the editorial-board endpoint.
    if user.role not in (UserRole.author, UserRole.section_editor, UserRole.editor):
        raise HTTPException(status_code=404, detail="Author not found")

    articles = (
        db.query(Article)
        .filter(Article.author_id == user.id)
        .order_by(Article.id.desc())
        .all()
    )

    return AuthorPublicProfile(
        id=user.id,
        full_name=user.full_name,
        username=user.username,
        orcid=user.orcid,
        institution=user.institution,
        country=user.country,
        department=user.department,
        research_areas=user.research_areas,
        bio=user.bio,
        articles=[
            AuthorPublicArticle(
                id=a.id,
                title=a.title,
                abstract=a.abstract,
                journal_id=a.journal_id,
            )
            for a in articles
        ],
    )
