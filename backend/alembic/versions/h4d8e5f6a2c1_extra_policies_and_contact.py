"""extra policies, contact fields on journals, plagiarism_checks, 2 more email templates

Revision ID: h4d8e5f6a2c1
Revises: g3c7d8e4b6f2
Create Date: 2026-08-31

Consolidated follow-up migration that closes the remaining gaps left by the
platform-expansion pass:

  1. Adds six nullable contact-block columns to ``journals`` (phone, address,
     twitter_url, linkedin_url, email_editorial, email_publisher).
  2. Creates the ``plagiarism_checks`` table used to persist every /ai/plagiarism
     screening — text hash, score, top-match article, actor, timestamp.
  3. Seeds five additional COPE-aligned policy pages: ai-use, data-availability,
     ethical-approval, human-animal-research, duplicate-publication.
  4. Seeds two more starter email templates: proof_notification and
     publication_notification.

Nothing here changes any pre-existing row; every insert is idempotent-safe on a
fresh schema because there was previously no row with the target slug.
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import column, table


revision = "h4d8e5f6a2c1"
down_revision = "g3c7d8e4b6f2"
branch_labels = None
depends_on = None


# ── Seed content: new policy pages ──────────────────────

_AI_USE_BODY = [
    {
        "id": "disclosure",
        "title": "Disclosure of AI assistance",
        "content": [
            "Authors must disclose any use of generative artificial intelligence tools — including "
            "large language models, code-generation assistants, and image or figure generators — "
            "in the preparation of the manuscript. The disclosure should name the tool and version, "
            "describe which sections or artefacts benefited from it (drafting, translation, code, "
            "figures), and state how the output was verified.",
        ],
    },
    {
        "id": "authorship",
        "title": "AI is not an author",
        "content": [
            "Generative AI tools cannot be listed as authors. Authorship carries responsibility for "
            "the work and accountability for its integrity — obligations a software system cannot "
            "meet. Human authors bear full responsibility for the accuracy, originality, and "
            "ethical soundness of every claim, figure, and line of code in the submission, "
            "including anything derived from AI output.",
        ],
    },
    {
        "id": "prohibited",
        "title": "Prohibited uses",
        "content": [
            "AI must not be used to fabricate data, invent citations, or produce figures that "
            "misrepresent experimental results. Peer reviewers must not paste confidential "
            "manuscript text into external AI tools, as doing so leaks the material to a third "
            "party. Editors will treat undisclosed use of AI on any of these points as a serious "
            "breach of research integrity.",
        ],
    },
]

_DATA_AVAILABILITY_BODY = [
    {
        "id": "statement-required",
        "title": "Data-availability statement required",
        "content": [
            "Every manuscript reporting original research must include a data-availability "
            "statement in a dedicated section before the reference list. The statement identifies "
            "where the underlying data, code, and analysis scripts can be accessed — repository "
            "name, DOI or accession number, and any access conditions.",
        ],
    },
    {
        "id": "sharing-preferred",
        "title": "Open data preferred",
        "content": [
            "Authors are encouraged to deposit data in a recognised public repository (Zenodo, "
            "Dryad, figshare, OSF, a domain-specific archive) under a permissive licence, and to "
            "cite the deposited dataset in the reference list. Datasets should be released no "
            "later than the article's publication date.",
        ],
    },
    {
        "id": "restricted-data",
        "title": "When data cannot be shared",
        "content": [
            "Where data cannot be openly shared — because of participant privacy, ethical "
            "restrictions, third-party licensing, or national-security controls — the statement "
            "must say so and give the specific reason. It should describe any managed-access "
            "procedure the authors will honour for reviewers and future readers.",
        ],
    },
]

_ETHICAL_APPROVAL_BODY = [
    {
        "id": "irb-iacuc",
        "title": "IRB / IACUC reference required",
        "content": [
            "Any research involving human participants, human tissue, identifiable personal data, "
            "or vertebrate animals must have been reviewed and approved by an appropriate ethics "
            "committee before the work began. The manuscript must state the name of the approving "
            "committee, the approval reference number, and the date of approval.",
        ],
    },
    {
        "id": "consent",
        "title": "Informed consent",
        "content": [
            "For research involving human participants, authors must confirm that written informed "
            "consent was obtained from every participant (or from a legally authorised "
            "representative). Where individually identifying material — images, video, direct "
            "quotations, genetic data — is presented, the consent must explicitly cover that use.",
        ],
    },
    {
        "id": "waiver",
        "title": "Waivers and exemptions",
        "content": [
            "Where formal ethics review was waived — for anonymised secondary-data analysis, or "
            "for a category the local framework classifies as exempt — the manuscript must state "
            "the waiver, name the body that granted it, and give the waiver reference. Silence on "
            "this point is not acceptable and will delay review.",
        ],
    },
]

_HUMAN_ANIMAL_RESEARCH_BODY = [
    {
        "id": "helsinki",
        "title": "Human subjects — Declaration of Helsinki",
        "content": [
            "Research involving human participants must be conducted in accordance with the World "
            "Medical Association's Declaration of Helsinki. Authors must confirm compliance in the "
            "methods section and describe the safeguards applied to protect participant welfare, "
            "privacy, and autonomy.",
        ],
    },
    {
        "id": "clinical-trials",
        "title": "Clinical-trial registration",
        "content": [
            "Reports of clinical trials must include the trial's registration in a WHO-recognised "
            "public registry (ClinicalTrials.gov, ISRCTN, ANZCTR, or similar), with the "
            "registration identifier, and must follow the CONSORT reporting guideline for the "
            "trial type. Prospective registration is expected; retrospective registration must be "
            "disclosed with a reason.",
        ],
    },
    {
        "id": "animal-welfare",
        "title": "Animal research — ARRIVE guidelines",
        "content": [
            "Research involving vertebrate animals or higher cephalopods must comply with the "
            "ARRIVE 2.0 reporting guidelines and any local animal-welfare legislation. Manuscripts "
            "must state the housing conditions, the anaesthetic and analgesic protocols used, and "
            "the humane endpoints applied. The 3Rs (replacement, reduction, refinement) should be "
            "addressed in the methods.",
        ],
    },
]

_DUPLICATE_PUBLICATION_BODY = [
    {
        "id": "originality",
        "title": "Originality expected",
        "content": [
            "Manuscripts submitted to the journal must be original work that has not been "
            "published elsewhere and is not simultaneously under consideration by another journal. "
            "By submitting, the corresponding author confirms this on behalf of all authors.",
        ],
    },
    {
        "id": "simultaneous-submission",
        "title": "Simultaneous submission",
        "content": [
            "Simultaneous submission of the same manuscript, or of substantially overlapping "
            "manuscripts, to more than one journal is unethical and is grounds for immediate "
            "rejection. If discovered post-publication, it is grounds for retraction and, at the "
            "editor's discretion, a submission ban for the authors involved.",
        ],
    },
    {
        "id": "prior-dissemination",
        "title": "Preprints and conference papers",
        "content": [
            "Deposit of a preprint on a recognised preprint server is not treated as prior "
            "publication and does not disqualify a submission — authors should link the preprint "
            "on the submission form. Conference abstracts and short conference papers are also "
            "acceptable prior dissemination; authors should disclose them and describe the "
            "substantive new material the journal submission contributes.",
        ],
    },
    {
        "id": "self-plagiarism",
        "title": "Redundant publication and self-plagiarism",
        "content": [
            "Reusing substantial portions of the authors' own previously published text, figures, "
            "or data without clear citation and, where required, permission from the original "
            "publisher is redundant publication and is not acceptable. When the new manuscript "
            "genuinely builds on earlier work, the relationship must be described transparently.",
        ],
    },
]

_POLICY_FOOTER = (
    "This policy is aligned with the Committee on Publication Ethics (COPE) guidelines. "
    "See https://publicationethics.org/ for the underlying framework."
)


# ── Seed content: additional email templates ──────────

_EMAIL_TEMPLATES = [
    (
        "proof_notification",
        "Your proof is ready for review — {{paper_title}}",
        (
            "Dear {{author_name}},\n\n"
            "The typeset proof of your accepted manuscript, \"{{paper_title}}\", is now available "
            "for your review. Please open your author dashboard, download the PDF, and check "
            "carefully for any typographical errors, incorrect author names or affiliations, "
            "misplaced figure captions, or reference-list issues.\n\n"
            "Because the article carries the DOI {{doi}}, any changes at this stage are limited "
            "to genuine corrections — new material or reworked passages cannot be introduced. "
            "Please return your corrections within 5 working days so we can keep the publication "
            "schedule on track.\n\n"
            "Thank you for your care in the final stages of production.\n\n"
            "The editorial office"
        ),
        "Sent to the corresponding author once the typeset proof PDF is ready.",
        "author_name, paper_title, doi",
    ),
    (
        "publication_notification",
        "Your article is now published — {{paper_title}}",
        (
            "Dear {{author_name}},\n\n"
            "We are delighted to let you know that your article, \"{{paper_title}}\", has been "
            "published and is now openly available on the journal website. The permanent "
            "identifier for the version of record is:\n\n"
            "    https://doi.org/{{doi}}\n\n"
            "The article is released under the CC BY 4.0 licence — you are welcome to share the "
            "DOI link on institutional pages, social media, and preprint servers. Full-text HTML, "
            "the PDF version of record, and citation exports are all reachable from the article "
            "page.\n\n"
            "Thank you for choosing our journal to disseminate your work. We look forward to your "
            "next submission.\n\n"
            "The editorial office"
        ),
        "Sent when the article's version of record is published and the DOI is live.",
        "author_name, paper_title, doi",
    ),
]


def upgrade() -> None:
    # ── 1. journals: contact block ───────────────────────
    op.add_column("journals", sa.Column("phone", sa.String(length=50), nullable=True))
    op.add_column("journals", sa.Column("address", sa.String(length=500), nullable=True))
    op.add_column("journals", sa.Column("twitter_url", sa.String(length=300), nullable=True))
    op.add_column("journals", sa.Column("linkedin_url", sa.String(length=300), nullable=True))
    op.add_column("journals", sa.Column("email_editorial", sa.String(length=200), nullable=True))
    op.add_column("journals", sa.Column("email_publisher", sa.String(length=200), nullable=True))

    # ── 2. plagiarism_checks ─────────────────────────────
    op.create_table(
        "plagiarism_checks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=True),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "top_match_id",
            sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_plagiarism_checks_submission_id", "plagiarism_checks", ["submission_id"])
    op.create_index("ix_plagiarism_checks_text_hash", "plagiarism_checks", ["text_hash"])
    op.create_index("ix_plagiarism_checks_top_match_id", "plagiarism_checks", ["top_match_id"])
    op.create_index(
        "ix_plagiarism_checks_created_by_user_id", "plagiarism_checks", ["created_by_user_id"]
    )
    op.create_index("ix_plagiarism_checks_created_at", "plagiarism_checks", ["created_at"])

    # ── 3. seed extra policy pages ───────────────────────
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
                "slug": "ai-use",
                "title": "Use of Artificial Intelligence",
                "subtitle": "What authors must disclose and what AI tools may not be used for.",
                "body": _AI_USE_BODY,
                "footer_note": _POLICY_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "data-availability",
                "title": "Data Availability",
                "subtitle": "A data-availability statement is required at submission.",
                "body": _DATA_AVAILABILITY_BODY,
                "footer_note": _POLICY_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "ethical-approval",
                "title": "Ethical Approval",
                "subtitle": "IRB / IACUC review must be documented in the manuscript.",
                "body": _ETHICAL_APPROVAL_BODY,
                "footer_note": _POLICY_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "human-animal-research",
                "title": "Human and Animal Research",
                "subtitle": "Declaration of Helsinki for humans; ARRIVE 2.0 for animals.",
                "body": _HUMAN_ANIMAL_RESEARCH_BODY,
                "footer_note": _POLICY_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "duplicate-publication",
                "title": "Duplicate and Redundant Publication",
                "subtitle": "Simultaneous submission is grounds for rejection.",
                "body": _DUPLICATE_PUBLICATION_BODY,
                "footer_note": _POLICY_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
        ],
    )

    # ── 4. seed extra email templates ────────────────────
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
        "DELETE FROM email_templates WHERE slug IN ("
        "'proof_notification','publication_notification')"
    )
    op.execute(
        "DELETE FROM policy_pages WHERE slug IN ("
        "'ai-use','data-availability','ethical-approval',"
        "'human-animal-research','duplicate-publication')"
    )
    for idx in (
        "ix_plagiarism_checks_created_at",
        "ix_plagiarism_checks_created_by_user_id",
        "ix_plagiarism_checks_top_match_id",
        "ix_plagiarism_checks_text_hash",
        "ix_plagiarism_checks_submission_id",
    ):
        op.drop_index(idx, table_name="plagiarism_checks")
    op.drop_table("plagiarism_checks")
    op.drop_column("journals", "email_publisher")
    op.drop_column("journals", "email_editorial")
    op.drop_column("journals", "linkedin_url")
    op.drop_column("journals", "twitter_url")
    op.drop_column("journals", "address")
    op.drop_column("journals", "phone")
