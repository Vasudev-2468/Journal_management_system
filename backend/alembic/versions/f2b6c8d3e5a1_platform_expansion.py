"""platform expansion — revision versioning, files, production, special issues, admin

Revision ID: f2b6c8d3e5a1
Revises: e9a1c4b2d7f5
Create Date: 2026-08-31

Adds tables for the 12 top-priority gap-closing features:
  - manuscript_versions + manuscript_files (revision system + multi-file uploads)
  - production_records (post-acceptance production pipeline)
  - special_issues (themed collections + guest editors)
  - email_templates (editor-editable canned emails)
  - audit_logs (structured admin action trail)
  - article_references (per-article reference list)

Also seeds four legal policy pages (privacy, terms, cookies, accessibility)
and eight starter email templates so the platform ships with sensible defaults.
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import column, table


revision = "f2b6c8d3e5a1"
down_revision = "e9a1c4b2d7f5"
branch_labels = None
depends_on = None


# ── Seed content ────────────────────────────────────────

_PRIVACY_BODY = [
    {
        "id": "collection",
        "title": "What we collect",
        "content": [
            "Account data — name, email, affiliation, ORCID, country, and any profile fields "
            "you provide when registering as an author, reviewer, or editor. "
            "Manuscript data — the files and metadata you submit. "
            "Operational data — sign-in timestamps, IP addresses used for authentication and "
            "audit, and correspondence you send through the platform.",
        ],
    },
    {
        "id": "use",
        "title": "How we use it",
        "content": [
            "We use your data to run the journal — authenticate you, route your manuscript "
            "through peer review, send you decision letters, and publish accepted work. "
            "We do not sell personal data. We do not run behavioural advertising.",
        ],
    },
    {
        "id": "retention",
        "title": "Retention",
        "content": [
            "Editorial records for submitted manuscripts are retained for at least ten years "
            "after publication for research integrity purposes. Account data is retained until "
            "you request deletion or your account is closed.",
        ],
    },
    {
        "id": "rights",
        "title": "Your rights",
        "content": [
            "You can request access to your data, correction of inaccuracies, deletion of your "
            "account, or a portable export by contacting the editorial office.",
        ],
    },
]

_TERMS_BODY = [
    {
        "id": "acceptance",
        "title": "Acceptance",
        "content": [
            "By using this website or submitting content to the journal, you agree to these "
            "terms. If you do not agree, please do not use the service.",
        ],
    },
    {
        "id": "content-rights",
        "title": "Your content",
        "content": [
            "You retain copyright in your manuscript. On acceptance, you grant the journal a "
            "non-exclusive right of first publication under the CC BY 4.0 licence described in "
            "the Copyright and Open Access policies.",
        ],
    },
    {
        "id": "acceptable-use",
        "title": "Acceptable use",
        "content": [
            "You agree not to submit content that infringes copyright, contains malware, "
            "violates research ethics, or has been fabricated. Repeated abuse leads to account "
            "termination.",
        ],
    },
    {
        "id": "disclaimer",
        "title": "Disclaimer",
        "content": [
            "The service is provided on an as-is basis. The journal is not liable for any "
            "indirect or consequential loss arising from use of the platform or the content "
            "it hosts.",
        ],
    },
]

_COOKIE_BODY = [
    {
        "id": "what",
        "title": "What we use cookies for",
        "content": [
            "Only strictly necessary cookies. We store a signed authentication token so you can "
            "stay logged in, and remember a small number of UI preferences (theme, dismissed "
            "banners). We do not use marketing or third-party tracking cookies.",
        ],
    },
    {
        "id": "control",
        "title": "Controlling cookies",
        "content": [
            "You can clear our cookies from your browser at any time. Clearing the authentication "
            "cookie signs you out; the site will continue to work read-only for public pages.",
        ],
    },
]

_ACCESSIBILITY_BODY = [
    {
        "id": "commitment",
        "title": "Our commitment",
        "content": [
            "We aim to conform to WCAG 2.1 AA. Every public page is keyboard-navigable, all "
            "form fields are labelled, and interactive controls carry role and aria attributes.",
        ],
    },
    {
        "id": "known-limitations",
        "title": "Known limitations",
        "content": [
            "Some legacy PDFs may not be fully tagged for screen readers — where this is the "
            "case, an accessible HTML view of the article's abstract, references and metadata "
            "is available on the article page.",
        ],
    },
    {
        "id": "feedback",
        "title": "Feedback",
        "content": [
            "If you encounter an accessibility barrier, contact the editorial office and we will "
            "prioritise a fix.",
        ],
    },
]


_EMAIL_TEMPLATES = [
    (
        "submission_confirmation",
        "Manuscript submission received — {{paper_id_code}}",
        (
            "Dear {{author_name}},\n\n"
            "Thank you for submitting \"{{paper_title}}\" to the journal. Your manuscript ID is "
            "{{paper_id_code}}. Our editorial office is running the initial screening; you will "
            "hear back within 5 working days.\n\n"
            "The editorial office"
        ),
        "Sent to the author on successful submission.",
        "author_name, paper_title, paper_id_code",
    ),
    (
        "editor_assigned",
        "Editor assigned to your manuscript {{paper_id_code}}",
        (
            "Dear {{author_name}},\n\n"
            "{{editor_name}} has been assigned as the handling editor for \"{{paper_title}}\".\n\n"
            "The editorial office"
        ),
        "Author notification when a handling editor takes the paper.",
        "author_name, paper_title, paper_id_code, editor_name",
    ),
    (
        "reviewer_invitation",
        "Invitation to review a manuscript — {{paper_id_code}}",
        (
            "Dear {{reviewer_name}},\n\n"
            "We would like to invite you to review \"{{paper_title}}\" for our journal. Please "
            "use the secure link below to accept the invitation and access the manuscript.\n\n"
            "{{review_link}}\n\n"
            "Deadline: {{deadline}}. The editorial office"
        ),
        "Sent to a reviewer when they are invited.",
        "reviewer_name, paper_title, paper_id_code, review_link, deadline",
    ),
    (
        "reviewer_reminder",
        "Reminder: review due for {{paper_id_code}}",
        (
            "Dear {{reviewer_name}},\n\n"
            "This is a friendly reminder that the review for \"{{paper_title}}\" is due on "
            "{{deadline}}. You can access the manuscript here:\n\n{{review_link}}\n\n"
            "Thank you for your time. The editorial office"
        ),
        "Sent close to the review deadline.",
        "reviewer_name, paper_title, paper_id_code, review_link, deadline",
    ),
    (
        "review_received",
        "Review received — thank you",
        (
            "Dear {{reviewer_name}},\n\n"
            "Thank you for submitting your review of \"{{paper_title}}\". Your work is greatly "
            "appreciated.\n\n"
            "The editorial office"
        ),
        "Acknowledgement to the reviewer.",
        "reviewer_name, paper_title",
    ),
    (
        "revision_request",
        "Revision required — {{paper_id_code}}",
        (
            "Dear {{author_name}},\n\n"
            "The editors have reviewed \"{{paper_title}}\" and request a revision. Please see "
            "the anonymised reviewer comments in your author dashboard and upload the revised "
            "manuscript together with a response-to-reviewers document.\n\n"
            "{{editor_comments}}\n\n"
            "The editorial office"
        ),
        "Sent to the author on a revision decision.",
        "author_name, paper_title, paper_id_code, editor_comments",
    ),
    (
        "acceptance",
        "Manuscript accepted — {{paper_id_code}}",
        (
            "Dear {{author_name}},\n\n"
            "We are delighted to inform you that \"{{paper_title}}\" has been accepted for "
            "publication. The production team will contact you with the copy-edited proof.\n\n"
            "The editorial office"
        ),
        "Acceptance letter.",
        "author_name, paper_title, paper_id_code",
    ),
    (
        "rejection",
        "Editorial decision on {{paper_id_code}}",
        (
            "Dear {{author_name}},\n\n"
            "After careful consideration and expert review, we regret that we cannot accept "
            "\"{{paper_title}}\" for publication. We wish you the best in placing the work "
            "elsewhere.\n\n"
            "{{editor_comments}}\n\n"
            "The editorial office"
        ),
        "Rejection letter.",
        "author_name, paper_title, paper_id_code, editor_comments",
    ),
]


def upgrade() -> None:
    # ── manuscript_versions ─────────────────────────────
    op.create_table(
        "manuscript_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "submission_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False, server_default="original"),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("response_to_reviewers", sa.Text(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "submission_id", "version_number", name="uq_manuscript_versions_submission_version"
        ),
    )
    op.create_index(
        "ix_manuscript_versions_submission_id", "manuscript_versions", ["submission_id"]
    )

    # ── manuscript_files ────────────────────────────────
    op.create_table(
        "manuscript_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("manuscript_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=30), nullable=False, server_default="other"),
        sa.Column("original_filename", sa.String(length=400), nullable=False),
        sa.Column("stored_url", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_manuscript_files_version_id", "manuscript_files", ["version_id"])

    # ── production_records ──────────────────────────────
    op.create_table(
        "production_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "submission_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("stage", sa.String(length=40), nullable=False, server_default="copy_editing"),
        sa.Column("copy_edit_notes", sa.Text(), nullable=True),
        sa.Column("typesetting_notes", sa.Text(), nullable=True),
        sa.Column("proof_pdf_url", sa.String(length=1024), nullable=True),
        sa.Column("author_corrections", sa.Text(), nullable=True),
        sa.Column("final_pdf_url", sa.String(length=1024), nullable=True),
        sa.Column("doi", sa.String(length=200), nullable=True, unique=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_production_records_stage", "production_records", ["stage"])

    # ── special_issues ──────────────────────────────────
    op.create_table(
        "special_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=120), nullable=False, unique=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("guest_editors", sa.Text(), nullable=True),
        sa.Column("topics", sa.Text(), nullable=True),
        sa.Column("cover_image_url", sa.String(length=500), nullable=True),
        sa.Column("submission_deadline", sa.DateTime(), nullable=True),
        sa.Column("publication_date", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_special_issues_slug", "special_issues", ["slug"])

    # ── email_templates ─────────────────────────────────
    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=80), nullable=False, unique=True),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("placeholders", sa.String(length=800), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_by", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_email_templates_slug", "email_templates", ["slug"])

    # ── audit_logs ──────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=True),
        sa.Column("target_id", sa.String(length=120), nullable=True),
        sa.Column("ip_address", sa.String(length=50), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_actor_email", "audit_logs", ["actor_email"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_target_type", "audit_logs", ["target_type"])
    op.create_index("ix_audit_logs_target_id", "audit_logs", ["target_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ── article_references ──────────────────────────────
    op.create_table(
        "article_references",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "article_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("doi", sa.String(length=200), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_article_references_article_id", "article_references", ["article_id"])

    # ── Seed legal policy pages ─────────────────────────
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
                "slug": "privacy-policy",
                "title": "Privacy Policy",
                "subtitle": "How the journal collects, uses, and protects personal data.",
                "body": _PRIVACY_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "terms-of-use",
                "title": "Terms of Use",
                "subtitle": "Terms governing the use of this website and platform.",
                "body": _TERMS_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "cookie-policy",
                "title": "Cookie Policy",
                "subtitle": "Only strictly necessary cookies — no advertising trackers.",
                "body": _COOKIE_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "accessibility-statement",
                "title": "Accessibility Statement",
                "subtitle": "Our commitment to WCAG 2.1 AA and how to reach us about issues.",
                "body": _ACCESSIBILITY_BODY,
                "footer_note": None,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
        ],
    )

    # ── Seed email templates ────────────────────────────
    email_templates = table(
        "email_templates",
        column("slug", sa.String),
        column("subject", sa.String),
        column("body", sa.Text),
        column("description", sa.String),
        column("placeholders", sa.String),
        column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        email_templates,
        [
            {
                "slug": t[0],
                "subject": t[1],
                "body": t[2],
                "description": t[3],
                "placeholders": t[4],
                "is_active": True,
            }
            for t in _EMAIL_TEMPLATES
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM policy_pages WHERE slug IN ("
        "'privacy-policy','terms-of-use','cookie-policy','accessibility-statement')"
    )
    op.drop_index("ix_article_references_article_id", table_name="article_references")
    op.drop_table("article_references")
    for idx in (
        "ix_audit_logs_created_at",
        "ix_audit_logs_target_id",
        "ix_audit_logs_target_type",
        "ix_audit_logs_action",
        "ix_audit_logs_actor_email",
        "ix_audit_logs_actor_id",
    ):
        op.drop_index(idx, table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_email_templates_slug", table_name="email_templates")
    op.drop_table("email_templates")
    op.drop_index("ix_special_issues_slug", table_name="special_issues")
    op.drop_table("special_issues")
    op.drop_index("ix_production_records_stage", table_name="production_records")
    op.drop_table("production_records")
    op.drop_index("ix_manuscript_files_version_id", table_name="manuscript_files")
    op.drop_table("manuscript_files")
    op.drop_index("ix_manuscript_versions_submission_id", table_name="manuscript_versions")
    op.drop_table("manuscript_versions")
