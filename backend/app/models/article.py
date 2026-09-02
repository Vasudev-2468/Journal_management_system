from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import relationship
from app.database import Base

class Article(Base):
    __tablename__ = 'articles'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    abstract = Column(Text)
    content = Column(Text)
    author_id = Column(Integer, ForeignKey('users.id'))
    journal_id = Column(Integer, ForeignKey('journals.id'))

    # Preprint linkage. When an author has posted the manuscript to a
    # preprint server (arXiv / bioRxiv / OSF / ChemRxiv / …) we surface a
    # "Preprint" badge on the article page so readers can jump straight to
    # the open-access version.
    #
    # ``preprint_doi`` is the canonical identifier — anything registered
    # with a DOI resolves through https://doi.org/{preprint_doi}, which is
    # what the badge links to by default. ``preprint_url`` is an optional
    # override for preprints that do not (yet) have a DOI, or when the
    # author wants a specific landing URL (e.g. an OSF project view).
    #
    # Both are nullable — the vast majority of legacy rows will not have
    # them, and the article page collapses the badge cleanly when neither
    # is set.
    preprint_doi = Column(String(200), nullable=True)
    preprint_url = Column(String(500), nullable=True)

    # Postgres full-text search vector. Kept fresh at write time by the
    # database itself (see migration j6f0a8b9c4e3): the column is
    # ``GENERATED ALWAYS AS`` a ``to_tsvector('english', …)`` over
    # coalesced title/abstract/content, backed by a GIN index. Declared
    # here for ORM read-side visibility only — writes must not set it
    # (the DB rejects them), so it is intentionally omitted from the
    # article schemas.
    search_vector = Column(TSVECTOR)

    # ── DOI lifecycle (spec §10) ─────────────────────────
    #
    # Distinct from ``preprint_doi`` — that's an external identifier the
    # author self-reports. This chain is the DOI we issue as the journal
    # of record, and it MUST NOT be minted for a manuscript that hasn't
    # been formally accepted. The eligibility + permission gates live in
    # ``services/doi_service.py`` and every state change is reflected
    # in ``doi_audit_log``.
    #
    # ``doi`` is nullable — it's populated only after the editor
    # authorises the assignment.  ``doi_status`` stays "not_eligible"
    # until the article's linked submission reaches ``accepted``.
    doi = Column(String(200), nullable=True, index=True)
    doi_status = Column(
        String(32), nullable=False, default="not_eligible",
        server_default="not_eligible", index=True,
    )
    doi_assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    doi_assigned_at = Column(DateTime, nullable=True)
    doi_registered_at = Column(DateTime, nullable=True)
    doi_registration_response = Column(Text, nullable=True)

    author = relationship("User", back_populates="articles", foreign_keys=[author_id])
    journal = relationship("Journal", back_populates="articles")
    ai_analysis = relationship("AIAnalysis", back_populates="article", uselist=False)


# GIN index on the tsvector so ``@@`` matches are indexed. Named to match
# the migration so a `create_all` in tests reuses the same name.
Index("ix_articles_search_vector", Article.search_vector, postgresql_using="gin")