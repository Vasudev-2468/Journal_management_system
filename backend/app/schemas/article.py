from pydantic import BaseModel, ConfigDict
from typing import Optional


class ArticleBase(BaseModel):
    title: str
    abstract: Optional[str] = None
    content: Optional[str] = None
    journal_id: int


class ArticleCreate(ArticleBase):
    # author_id is the FK on the model; the router fills it from the current
    # authenticated user rather than trusting the request body.
    author_id: Optional[int] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    abstract: Optional[str] = None
    content: Optional[str] = None
    journal_id: Optional[int] = None
    # Preprint linkage — an author (or editor) can attach the arXiv /
    # bioRxiv / OSF DOI, and optionally an explicit landing URL, so the
    # article page renders a "Preprint" badge pointing at the open-access
    # version. Both are optional and can be cleared by sending ``null``.
    preprint_doi: Optional[str] = None
    preprint_url: Optional[str] = None


class ArticleRead(ArticleBase):
    id: int
    author_id: Optional[int] = None
    # R7 — a human-readable byline for the article page. Populated by the
    # router from the joined User row; falls back to None when the record
    # was created before author linking existed.
    author_display: Optional[str] = None

    # Preprint linkage surfaced on the article page. ``preprint_doi``
    # resolves to https://doi.org/{doi} by default; ``preprint_url`` is
    # an optional explicit override (e.g. an OSF project landing page).
    # Both are ``None`` for the vast majority of legacy rows.
    preprint_doi: Optional[str] = None
    preprint_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
