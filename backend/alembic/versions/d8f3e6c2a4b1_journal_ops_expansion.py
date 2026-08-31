"""journal ops expansion: volumes/issues, contact, announcements, board, extra policies

Revision ID: d8f3e6c2a4b1
Revises: c5e7f2a1b3d9
Create Date: 2026-08-31

Fills the running-journal gaps identified against ganitam-math.com:
  - Volumes + Issues + issue↔article link with DOI/pages/category
  - Contact-message inbox
  - Announcements / Call-for-Papers CMS entries
  - Editorial board roster maintained from the editor dashboard
  - Four additional seeded policy pages (plagiarism / peer-review /
    archiving / corrections-retractions).
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import column, table


revision = "d8f3e6c2a4b1"
down_revision = "c5e7f2a1b3d9"
branch_labels = None
depends_on = None


# ── Seed content for the four additional policy pages ────

_PLAGIARISM_BODY = [
    {
        "id": "standards",
        "title": "Standards",
        "content": [
            "All submitted manuscripts are screened for text similarity before peer review. "
            "The journal treats plagiarism — including verbatim copying, close paraphrasing "
            "without attribution, redundant/self-plagiarism, and image or data reuse without "
            "acknowledgement — as a serious breach of publication ethics.",
        ],
    },
    {
        "id": "screening",
        "title": "Screening tools",
        "content": [
            "Manuscripts are screened using Turnitin or an equivalent similarity-detection "
            "service. The editorial office reviews the similarity report in context — high "
            "similarity in the methods section, boilerplate, or properly quoted material is "
            "assessed differently from overlap in original results or discussion.",
        ],
    },
    {
        "id": "consequences",
        "title": "Consequences",
        "content": [
            "Manuscripts with significant unattributed overlap are returned to the authors for "
            "correction or rejected without review. Confirmed misconduct after publication "
            "leads to a correction, expression of concern, or retraction following COPE "
            "flowcharts, with a notice to the authors' institution where warranted.",
        ],
    },
]

_PEER_REVIEW_BODY = [
    {
        "id": "model",
        "title": "Review model",
        "content": [
            "The journal operates a **double-blind peer review** process. Author and reviewer "
            "identities are hidden from each other throughout the review. Each manuscript is "
            "evaluated by at least three independent reviewers with subject-matter expertise.",
        ],
    },
    {
        "id": "stages",
        "title": "Review stages",
        "content": [
            "**Editorial screening.** The editorial office checks scope, format, ethics "
            "declarations, and similarity before assigning reviewers.",
            "**Reviewer assignment.** The handling editor invites reviewers whose expertise "
            "matches the manuscript. Conflicts of interest are declared and honoured.",
            "**Reviewer reports.** Reviewers assess originality, methodology, clarity, and "
            "significance and recommend accept / minor revision / major revision / reject.",
            "**Editor decision.** The handling editor weighs the reports and communicates a "
            "decision to the authors with anonymised reviewer comments.",
        ],
    },
    {
        "id": "expectations",
        "title": "Expectations of reviewers",
        "content": [
            "Reviewers are expected to declare conflicts, treat the manuscript as confidential, "
            "provide constructive comments, and respond within the requested deadline. "
            "Reviewers should not use privileged information from the manuscript for their own "
            "research and must never share it with third parties.",
        ],
    },
]

_ARCHIVING_BODY = [
    {
        "id": "commitment",
        "title": "Long-term preservation commitment",
        "content": [
            "Every published article is preserved for the long term through multiple, "
            "geographically distributed archives so that the version of record remains "
            "accessible even if the journal or its publisher ceases operations.",
        ],
    },
    {
        "id": "partners",
        "title": "Preservation partners",
        "content": [
            "**CLOCKSS** — a dark archive maintained by a community of research libraries; "
            "content is released to the public only if a defined trigger event occurs.",
            "**Portico** — a community-supported preservation service; the journal deposits "
            "the version of record on publication.",
            "**Internet Archive** — a public digital library that keeps a searchable copy "
            "of the journal's content.",
        ],
    },
    {
        "id": "identifiers",
        "title": "Persistent identifiers",
        "content": [
            "Every article is assigned a Crossref DOI at publication. The DOI resolves to the "
            "version of record regardless of any change in the journal's hosting URL. Article "
            "metadata is registered with Crossref and made available to indexing services.",
        ],
    },
]

_CORRECTIONS_BODY = [
    {
        "id": "principles",
        "title": "Principles",
        "content": [
            "The published version of an article is the version of record. Corrections, "
            "expressions of concern, and retractions are handled transparently in line with "
            "COPE guidelines. The original article is never deleted; a corrections notice is "
            "linked bidirectionally to the affected article.",
        ],
    },
    {
        "id": "corrections",
        "title": "Corrections and errata",
        "content": [
            "Minor errors that do not affect the interpretation of results are addressed with "
            "an erratum linked to the original article. The erratum states what changed and why.",
        ],
    },
    {
        "id": "expressions",
        "title": "Expressions of concern",
        "content": [
            "When credible evidence exists that the reliability of an article is under question "
            "but investigation is incomplete, an expression of concern is issued that links to "
            "the original article. It is resolved by a correction, retraction, or withdrawal of "
            "the concern once investigation completes.",
        ],
    },
    {
        "id": "retractions",
        "title": "Retractions",
        "content": [
            "Where the reliability of an article's findings cannot be maintained — because of "
            "research misconduct, honest error that invalidates the results, duplicate "
            "publication, or plagiarism — the article is retracted. Retracted articles remain "
            "accessible with a prominent retraction notice and watermark; the reason for "
            "retraction is stated clearly.",
        ],
    },
    {
        "id": "how-to-report",
        "title": "How to report a concern",
        "content": [
            "Anyone may raise a concern about a published article by contacting the editorial "
            "office. The journal follows COPE flowcharts and keeps the complainant informed of "
            "progress.",
        ],
    },
]


def upgrade() -> None:
    # ── Volumes ──────────────────────────────────────────
    op.create_table(
        "volumes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "journal_id",
            sa.Integer(),
            sa.ForeignKey("journals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("journal_id", "number", name="uq_volumes_journal_number"),
    )
    op.create_index("ix_volumes_journal_id", "volumes", ["journal_id"])

    # ── Issues ───────────────────────────────────────────
    op.create_table(
        "issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "volume_id",
            sa.Integer(),
            sa.ForeignKey("volumes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=True),
        sa.Column("theme", sa.String(length=300), nullable=True),
        sa.Column("month", sa.String(length=20), nullable=True),
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="planned",
        ),
        sa.Column("editorial_note", sa.Text(), nullable=True),
        sa.Column("deadline", sa.String(length=80), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("volume_id", "number", name="uq_issues_volume_number"),
    )
    op.create_index("ix_issues_volume_id", "issues", ["volume_id"])

    # ── Issue↔Article link ───────────────────────────────
    op.create_table(
        "issue_articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "issue_id",
            sa.Integer(),
            sa.ForeignKey("issues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "article_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("doi", sa.String(length=200), nullable=True, unique=True),
        sa.Column("category", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("issue_id", "article_id", name="uq_issue_articles_issue_article"),
    )
    op.create_index("ix_issue_articles_issue_id", "issue_articles", ["issue_id"])
    op.create_index("ix_issue_articles_article_id", "issue_articles", ["article_id"])

    # ── Contact messages ─────────────────────────────────
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Announcements ────────────────────────────────────
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False, server_default="news"),
        sa.Column("link_url", sa.String(length=500), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("published_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Editorial board members ──────────────────────────
    op.create_table(
        "editorial_board_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=150), nullable=False),
        sa.Column("affiliation", sa.String(length=300), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("orcid", sa.String(length=50), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("expertise", sa.String(length=500), nullable=True),
        sa.Column("photo_url", sa.String(length=500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Seed the four additional policy pages ────────────
    policy_pages = table(
        "policy_pages",
        column("slug", sa.String),
        column("title", sa.String),
        column("subtitle", sa.String),
        column("body", sa.JSON),
        column("footer_note", sa.Text),
        column("version", sa.Integer),
        column("is_published", sa.Boolean),
        column("last_reviewed_at", sa.DateTime),
    )

    now = datetime.utcnow()

    op.bulk_insert(
        policy_pages,
        [
            {
                "slug": "plagiarism-policy",
                "title": "Plagiarism Policy",
                "subtitle": "How the journal detects and responds to plagiarism.",
                "body": _PLAGIARISM_BODY,
                "footer_note": (
                    "This policy is aligned with the Committee on Publication Ethics (COPE) "
                    "guidance on handling plagiarism."
                ),
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "peer-review-process",
                "title": "Peer Review Process",
                "subtitle": "Double-blind peer review with a minimum of three reviewers.",
                "body": _PEER_REVIEW_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "archiving-policy",
                "title": "Archiving Policy",
                "subtitle": "Long-term preservation through CLOCKSS, Portico, and the Internet Archive.",
                "body": _ARCHIVING_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "corrections-retractions",
                "title": "Corrections & Retractions",
                "subtitle": "Corrections, expressions of concern, and retractions handled per COPE flowcharts.",
                "body": _CORRECTIONS_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM policy_pages WHERE slug IN ("
        "'plagiarism-policy','peer-review-process','archiving-policy','corrections-retractions')"
    )
    op.drop_table("editorial_board_members")
    op.drop_table("announcements")
    op.drop_table("contact_messages")
    op.drop_index("ix_issue_articles_article_id", table_name="issue_articles")
    op.drop_index("ix_issue_articles_issue_id", table_name="issue_articles")
    op.drop_table("issue_articles")
    op.drop_index("ix_issues_volume_id", table_name="issues")
    op.drop_table("issues")
    op.drop_index("ix_volumes_journal_id", table_name="volumes")
    op.drop_table("volumes")
