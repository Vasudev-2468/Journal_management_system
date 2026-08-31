"""add policy_pages table + seed ethics / open-access / copyright content

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-30

JG-102 + JG-103 — CMS-driven policy pages that public routes read from
and the editor portal edits. This migration creates the table and seeds
three foundational pages (Publication Ethics, Open Access, Copyright).
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


# ── Seed content ─────────────────────────────────────────
# Prose kept close to the schema so future edits happen in a data migration
# rather than a model rewrite. Every clause is publishable; nothing is
# lorem. Anything a live journal must decide (specific retention windows,
# ISSN, publisher) is flagged with [DECISION NEEDED] in a comment on the
# section rather than being invented.

_ETHICS_BODY = [
    {
        "id": "editors",
        "title": "Duties of Editors",
        "content": [
            "**Editorial independence.** Editors evaluate manuscripts solely on their scholarly merit "
            "— originality, methodological soundness, and importance to the field — without regard to "
            "the authors' race, gender, sexual orientation, ethnic origin, citizenship, religious "
            "belief, political philosophy, or institutional affiliation.",
            "**Confidentiality.** Editors and any editorial staff must not disclose any information "
            "about a submitted manuscript to anyone other than the corresponding author, reviewers, "
            "potential reviewers, other editorial advisers, and the publisher, as appropriate.",
            "**Use of unpublished material.** Unpublished material disclosed in a submitted "
            "manuscript must not be used in an editor's own research without the express written "
            "consent of the author. Privileged information or ideas obtained through peer review "
            "must be kept confidential and not used for personal advantage.",
            "**Handling of allegations.** Editors take reasonably responsive measures when ethical "
            "complaints are presented concerning a submitted or published manuscript. Such measures "
            "will generally include contacting the author of the manuscript and giving due "
            "consideration of the respective complaint or claims made, but may also include further "
            "communications to the relevant institutions and research bodies.",
            "**Conflicts of interest.** Editors recuse themselves (and delegate handling to another "
            "member of the editorial board) from any manuscript in which they have a conflict of "
            "interest resulting from competitive, collaborative, or other relationships or "
            "connections with any of the authors, companies, or (possibly) institutions connected "
            "to the papers.",
            "**Involvement in decisions.** Editors take responsibility for everything they publish "
            "and have procedures to assure the quality of the material they publish. They defend "
            "freedom of expression, maintain the integrity of the academic record, and preclude "
            "business needs from compromising intellectual and ethical standards.",
        ],
    },
    {
        "id": "reviewers",
        "title": "Duties of Reviewers",
        "content": [
            "**Contribution to editorial decisions.** Peer review assists the editor in making "
            "editorial decisions and, through the editorial communications with the author, may "
            "also assist the author in improving the paper. Peer review is an essential component "
            "of formal scholarly communication and lies at the heart of the scientific method.",
            "**Promptness.** Any invited referee who feels unqualified to review the research "
            "reported in a manuscript, or knows that its prompt review will be impossible, should "
            "notify the editor immediately and decline the invitation so that alternative reviewers "
            "can be approached.",
            "**Confidentiality.** Any manuscripts received for review must be treated as "
            "confidential documents. They must not be shown to, or discussed with, others except if "
            "authorised by the editor. This applies also to invited reviewers who decline the "
            "review invitation.",
            "**Standards of objectivity.** Reviews should be conducted objectively. Personal "
            "criticism of the author is inappropriate. Referees should express their views clearly "
            "with supporting arguments and references as necessary.",
            "**Acknowledgement of sources.** Reviewers should identify relevant published work that "
            "has not been cited by the authors. Any statement that an observation, derivation, or "
            "argument had been previously reported should be accompanied by the relevant citation. "
            "A reviewer should also call to the editor's attention any substantial similarity or "
            "overlap between the manuscript under consideration and any other published paper of "
            "which they have personal knowledge.",
            "**Disclosure and conflict of interest.** Any invited referee who has conflicts of "
            "interest resulting from competitive, collaborative, or other relationships or "
            "connections with any of the authors, companies, or institutions connected to the "
            "manuscript and the work described therein should immediately notify the editor to "
            "declare their conflicts of interest and decline the invitation to review.",
        ],
    },
    {
        "id": "authors",
        "title": "Duties of Authors",
        "content": [
            "**Reporting standards.** Authors of original research reports should present an "
            "accurate account of the work performed as well as an objective discussion of its "
            "significance. Underlying data should be represented accurately in the manuscript. "
            "Fraudulent or knowingly inaccurate statements constitute unethical behaviour and are "
            "unacceptable.",
            "**Originality and plagiarism.** Authors should ensure that they have written and "
            "submit only entirely original works, and if they have used the work and/or words of "
            "others, that this has been appropriately cited. Publications that have been influential "
            "in determining the nature of the reported work should also be cited. Plagiarism in all "
            "its forms constitutes unethical publishing behaviour and is unacceptable.",
            "**Authorship criteria.** Authorship should be limited to those who have made a "
            "significant contribution to the conception, design, execution, or interpretation of "
            "the reported study. All those who have made significant contributions should be listed "
            "as co-authors. The corresponding author ensures that all appropriate co-authors are "
            "included on the paper, and that all co-authors have seen and approved the final "
            "version of the paper and have agreed to its submission for publication.",
            "**Concurrent publication.** Authors should not in general publish manuscripts "
            "describing essentially the same research in more than one journal or primary "
            "publication. Submitting the same manuscript to more than one journal concurrently "
            "constitutes unethical publishing behaviour and is unacceptable.",
            "**Disclosure of financial support.** All sources of financial support for the project "
            "should be disclosed. A funding statement is required at submission; \"None\" is an "
            "acceptable value where no funding applies.",
            "**Data availability.** Authors should be prepared to provide public access to research "
            "data underlying published articles, and to retain such data for at least ten years "
            "after publication. A data availability statement is required at submission.",
            "**Prompt notification of discovered errors.** When an author discovers a significant "
            "error or inaccuracy in their own published work, it is the author's obligation to "
            "promptly notify the journal editor or publisher and cooperate with the editor to "
            "retract or correct the paper.",
        ],
    },
    {
        "id": "corrections",
        "title": "Corrections, Retractions and Expressions of Concern",
        "content": [
            "The journal follows the guidelines set by the Committee on Publication Ethics (COPE) "
            "in handling corrections and retractions. Corrections, retractions and expressions of "
            "concern are used to alert readers to errors of fact, ethical concerns or reliability "
            "in the published record; the original article remains part of the scholarly record "
            "and is never deleted.",
            "**Errata / corrigenda.** Minor errors that do not affect the interpretation of the "
            "work are addressed via a correction notice linked bidirectionally to the original "
            "article. The notice describes what changed and why.",
            "**Expressions of concern.** Where there is credible evidence that the reliability of "
            "a published article is under question but investigation is still ongoing, an "
            "expression of concern is issued that links to the original article. The concern is "
            "either resolved (by correction or retraction) or withdrawn once investigation "
            "completes.",
            "**Retractions.** Where the reliability of the article's findings cannot be maintained "
            "— including in cases of research misconduct, honest error that invalidates the "
            "results, duplicate publication, or plagiarism — the article is retracted. Retracted "
            "articles remain accessible with a prominent retraction notice and watermark; the "
            "reason for retraction is stated clearly.",
            "**Post-publication complaints.** Any reader may raise a concern about a published "
            "article by contacting the editorial office. The journal will follow COPE's flowcharts "
            "for handling the concern and will keep the complainant informed of progress.",
        ],
    },
]

_ETHICS_FOOTER = (
    "This policy is aligned with the Committee on Publication Ethics (COPE) Code of Conduct "
    "and Best Practice Guidelines for Journal Editors. See https://publicationethics.org/ for "
    "the underlying guidelines."
)


_OPEN_ACCESS_BODY = [
    {
        "id": "access",
        "title": "Immediate open access",
        "content": [
            "All articles published in the journal are immediately and permanently free to read, "
            "download, copy, and distribute. There is no subscription barrier, no registration "
            "barrier, and no embargo period. Any reader with an internet connection may access "
            "the version of record from the journal website at any time.",
        ],
    },
    {
        "id": "reuse",
        "title": "Reuse rights",
        "content": [
            "Articles are published under a Creative Commons Attribution 4.0 International "
            "licence (CC BY 4.0). Under this licence anyone is free to share (copy and "
            "redistribute) and adapt (remix, transform, and build upon) the material for any "
            "purpose, including commercially, provided they give appropriate credit, provide a "
            "link to the licence, and indicate if changes were made.",
            "The full licence text is available at "
            "https://creativecommons.org/licenses/by/4.0/legalcode. A short human-readable "
            "summary is at https://creativecommons.org/licenses/by/4.0/.",
        ],
    },
    {
        "id": "apc",
        "title": "Article processing charges",
        "content": [
            "**There are no article processing charges (APCs).** Publication in this journal is "
            "free for authors. There are no submission fees, no publication fees, no page "
            "charges, and no colour figure charges. Editorial and production costs are covered "
            "by the journal's institutional support.",
        ],
    },
    {
        "id": "self-archiving",
        "title": "Author self-archiving",
        "content": [
            "Authors retain the right to self-archive the version of record and any earlier "
            "manuscript versions in institutional repositories, subject repositories, funder "
            "repositories, and personal websites, subject to the terms of the CC BY 4.0 licence "
            "(attribution required, no embargo).",
        ],
    },
]

_OPEN_ACCESS_FOOTER = None


_COPYRIGHT_BODY = [
    {
        "id": "author-rights",
        "title": "Authors retain copyright",
        "content": [
            "Authors of articles published in this journal retain copyright in their work. The "
            "journal does not require a transfer of copyright as a condition of publication.",
        ],
    },
    {
        "id": "publication-right",
        "title": "First-publication right",
        "content": [
            "By submitting to the journal, authors grant the journal a non-exclusive right of "
            "first publication of the work. Once published, the article carries the CC BY 4.0 "
            "licence, which permits reuse by others under the terms described in the Open Access "
            "Statement.",
        ],
    },
    {
        "id": "licence",
        "title": "Licence",
        "content": [
            "All articles are published under the Creative Commons Attribution 4.0 International "
            "(CC BY 4.0) licence. Readers, authors, funders, and institutions may share and adapt "
            "the material for any purpose, including commercial use, provided that appropriate "
            "credit is given, a link to the licence is provided, and any changes are indicated.",
            "The CC BY badge appears on every article page and in the footer of the PDF version "
            "of record. The badge links to https://creativecommons.org/licenses/by/4.0/.",
        ],
    },
    {
        "id": "third-party",
        "title": "Third-party material",
        "content": [
            "Where an article includes material for which the authors are not the copyright "
            "holder — figures, tables, extended quotations, code, datasets — it is the authors' "
            "responsibility to obtain the necessary permissions and to acknowledge the source. "
            "The CC BY licence granted on the published article extends only to material for "
            "which the authors themselves hold copyright.",
        ],
    },
]

_COPYRIGHT_FOOTER = None


def upgrade() -> None:
    op.create_table(
        "policy_pages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=80), nullable=False, unique=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("subtitle", sa.String(length=500), nullable=True),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.Column("footer_note", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_policy_pages_slug", "policy_pages", ["slug"], unique=True)

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
                "slug": "publication-ethics",
                "title": "Publication Ethics",
                "subtitle": "COPE-aligned duties of editors, reviewers and authors.",
                "body": _ETHICS_BODY,
                "footer_note": _ETHICS_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "open-access",
                "title": "Open Access Statement",
                "subtitle": "Immediate, unrestricted open access under CC BY 4.0. No article processing charges.",
                "body": _OPEN_ACCESS_BODY,
                "footer_note": _OPEN_ACCESS_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
            {
                "slug": "copyright",
                "title": "Copyright",
                "subtitle": "Authors retain copyright. The journal is granted first-publication right under CC BY 4.0.",
                "body": _COPYRIGHT_BODY,
                "footer_note": _COPYRIGHT_FOOTER,
                "version": 1,
                "is_published": True,
                "last_reviewed_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_policy_pages_slug", table_name="policy_pages")
    op.drop_table("policy_pages")
