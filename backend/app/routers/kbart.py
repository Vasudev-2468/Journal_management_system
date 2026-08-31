"""KBART title-list export for librarians.

KBART ("Knowledge Bases And Related Tools", NISO RP-9-2014) is the
tab-separated exchange format libraries and knowledge-base vendors use
to describe electronic journal holdings. Exposing a live
``/kbart.txt`` file means link resolvers (OpenURL, EBSCO A-to-Z, ProQuest
360 Link) can ingest our coverage without manual maintenance.

The endpoint is public — the file itself is metadata, not full text, and
libraries expect to be able to fetch it with a plain ``curl``. Content
type is ``text/tab-separated-values`` per KBART recommendation 2.4.
"""

from __future__ import annotations

from typing import Iterable

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.journal import Journal
from app.models.volume import Issue, Volume


router = APIRouter()


# KBART 2.0 header row — exact order matters. Downstream parsers key
# strictly on column position, so do NOT reorder or rename these fields
# without cutting a new KBART version.
KBART_HEADER = [
    "publication_title",
    "print_identifier",
    "online_identifier",
    "date_first_issue_online",
    "num_first_vol_online",
    "num_first_issue_online",
    "date_last_issue_online",
    "num_last_vol_online",
    "num_last_issue_online",
    "title_url",
    "first_author",
    "title_id",
    "embargo_info",
    "coverage_depth",
    "notes",
    "publisher_name",
    "publication_type",
    "date_monograph_published_print",
    "date_monograph_published_online",
    "monograph_volume",
    "monograph_edition",
    "first_editor",
    "parent_publication_title_id",
    "preceding_publication_title_id",
    "access_type",
]


def _frontend_base() -> str:
    return (settings.FRONTEND_URL or "").rstrip("/") or "https://example.com"


def _sanitize(value: object) -> str:
    """Coerce a field to a safe KBART cell.

    KBART is tab-separated with newline-delimited rows, so tabs, CR, and
    LF are stripped from the value itself. Empty / None becomes ``""``.
    """
    if value is None:
        return ""
    text = str(value)
    return text.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def _row(fields: Iterable[str]) -> str:
    return "\t".join(_sanitize(f) for f in fields)


def _issue_date(issue: Issue) -> str:
    """YYYY-MM-DD (or YYYY) for an issue's coverage date.

    Prefers ``published_at``; falls back to the parent volume's ``year``
    when the issue was catalogued without a timestamp.
    """
    if issue.published_at is not None:
        return issue.published_at.strftime("%Y-%m-%d")
    if issue.volume is not None and issue.volume.year is not None:
        return str(issue.volume.year)
    return ""


@router.get("/kbart.txt")
def kbart_export(db: Session = Depends(get_db)) -> Response:
    base = _frontend_base()
    journal = (
        db.query(Journal).filter(Journal.is_active == True).first()  # noqa: E712
        or db.query(Journal).first()
    )

    publication_title = journal.title if journal else "Journal"
    print_id = journal.issn_print if journal else ""
    online_id = journal.issn_online if journal else ""
    publisher = journal.publisher_name if journal else ""

    lines: list[str] = [_row(KBART_HEADER)]

    published_issues = (
        db.query(Issue)
        .options(joinedload(Issue.volume))
        .filter(Issue.status == "published")
        .order_by(Issue.published_at.asc().nullslast(), Issue.id.asc())
        .all()
    )

    for issue in published_issues:
        volume = issue.volume
        if volume is None:
            continue
        issue_date = _issue_date(issue)
        title_url = f"{base}/issues/{volume.number}/{issue.number}"
        # One row per issue. First issue online == last issue online for
        # a per-issue export (that is how holdings are usually described
        # when we do not aggregate ranges).
        lines.append(
            _row(
                [
                    publication_title,                # publication_title
                    print_id or "",                   # print_identifier
                    online_id or "",                  # online_identifier
                    issue_date,                       # date_first_issue_online
                    volume.number,                    # num_first_vol_online
                    issue.number,                     # num_first_issue_online
                    issue_date,                       # date_last_issue_online
                    volume.number,                    # num_last_vol_online
                    issue.number,                     # num_last_issue_online
                    title_url,                        # title_url
                    "",                               # first_author (serial → blank)
                    f"issue-{issue.id}",              # title_id
                    "",                               # embargo_info
                    "fulltext",                       # coverage_depth
                    _sanitize(issue.title or ""),     # notes
                    publisher or "",                  # publisher_name
                    "serial",                         # publication_type
                    "",                               # date_monograph_published_print
                    "",                               # date_monograph_published_online
                    "",                               # monograph_volume
                    "",                               # monograph_edition
                    "",                               # first_editor
                    "",                               # parent_publication_title_id
                    "",                               # preceding_publication_title_id
                    "F",                              # access_type — F = free / open
                ]
            )
        )

    body = "\n".join(lines) + "\n"
    return Response(content=body, media_type="text/tab-separated-values")
