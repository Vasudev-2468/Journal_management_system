"""SEO / indexing endpoints: sitemap.xml, robots.txt, OAI-PMH, Crossref XML."""

import base64
import json
from datetime import datetime
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference
from app.models.journal import Journal
from app.models.production_stage import ProductionRecord
from app.models.special_issue import SpecialIssue
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.models.volume import Issue, IssueArticle, Volume

router = APIRouter()


def _frontend_base() -> str:
    return (settings.FRONTEND_URL or "").rstrip("/") or "https://example.com"


# ── /robots.txt ──────────────────────────────────────────

@router.get("/robots.txt", response_class=Response)
def robots():
    base = _frontend_base()
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")


# ── /sitemap.xml ─────────────────────────────────────────

_STATIC_ROUTES = (
    "/",
    "/about",
    "/articles",
    "/issues",
    "/editorial-board",
    "/for-authors",
    "/for-reviewers",
    "/announcements",
    "/special-issues",
    "/contact",
    "/publication-ethics",
    "/open-access",
    "/copyright",
    "/plagiarism-policy",
    "/peer-review-process",
    "/archiving-policy",
    "/corrections-retractions",
    "/privacy-policy",
    "/terms-of-use",
    "/cookie-policy",
    "/accessibility-statement",
)


@router.get("/sitemap.xml", response_class=Response)
def sitemap(db: Session = Depends(get_db)):
    base = _frontend_base()
    now = datetime.utcnow().date().isoformat()

    parts: list[str] = ['<?xml version="1.0" encoding="UTF-8"?>',
                        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for path in _STATIC_ROUTES:
        parts.append(
            f"<url><loc>{escape(base + path)}</loc>"
            f"<lastmod>{now}</lastmod><changefreq>weekly</changefreq></url>"
        )

    for article in db.query(Article).all():
        parts.append(
            f"<url><loc>{escape(base + '/articles/' + str(article.id))}</loc>"
            f"<lastmod>{now}</lastmod><changefreq>monthly</changefreq></url>"
        )

    for issue in db.query(Issue).options(joinedload(Issue.volume)).all():
        if issue.volume is None:
            continue
        parts.append(
            f"<url><loc>"
            f"{escape(base + f'/issues/{issue.volume.number}/{issue.number}')}"
            f"</loc><lastmod>{now}</lastmod><changefreq>monthly</changefreq></url>"
        )

    # Published special-issue collection pages. ``is_published`` is
    # the is-visible-to-the-public flag; ``status`` is orthogonal
    # workflow state and we deliberately don't gate on it.
    for si in (
        db.query(SpecialIssue).filter(SpecialIssue.is_published.is_(True)).all()
    ):
        if not si.slug:
            continue
        parts.append(
            f"<url><loc>{escape(base + '/special-issues/' + si.slug)}</loc>"
            f"<lastmod>{now}</lastmod><changefreq>weekly</changefreq></url>"
        )

    # ``/announcements`` (the shared listing page) is already listed
    # in ``_STATIC_ROUTES`` above — no extra row needed here.

    # Public author profile pages. Only authors with at least one
    # article make it in; empty profiles read as thin content to
    # crawlers.
    author_ids = (
        db.query(User.id)
        .join(Article, Article.author_id == User.id)
        .filter(User.role == UserRole.author)
        .filter(User.is_active.is_(True))
        .group_by(User.id)
        .having(func.count(Article.id) > 0)
        .all()
    )
    for (uid,) in author_ids:
        parts.append(
            f"<url><loc>{escape(base + '/authors/' + str(uid))}</loc>"
            f"<lastmod>{now}</lastmod><changefreq>monthly</changefreq></url>"
        )

    parts.append("</urlset>")
    return Response(content="\n".join(parts), media_type="application/xml")


# ── /oai-pmh ─────────────────────────────────────────────

# Page size for OAI-PMH list verbs. Also fixes the semantics of the
# token-encoded cursor: token N means "return rows [N, N+_OAI_PAGE_SIZE)".
_OAI_PAGE_SIZE = 100

# Top-5 slice of ``JOURNAL_SCOPE_CATEGORIES`` (see
# ``app.services.ai_agent``), exposed as OAI setSpec/setName pairs.
# The list is intentionally hardcoded so the OAI surface doesn't drift
# with every taxonomy tweak on the AI service.
_OAI_SETS: list[tuple[str, str]] = [
    ("ai-ml", "Artificial Intelligence — Machine Learning"),
    ("ai-nlp", "Artificial Intelligence — Natural Language Processing"),
    ("genai-llm", "Generative AI — Large Language Models"),
    ("genai-diffusion", "Generative AI — Diffusion Models and Image Generation"),
    ("genai-multimodal", "Generative AI — Multimodal Systems"),
]


def _encode_oai_token(cursor: int) -> str:
    """Base64-urlsafe encoding of the ``{cursor: int}`` state.

    We wrap the cursor in JSON so the shape can grow later (from/until,
    per-set state, …) without breaking wire-compat with harvesters
    that just echo the opaque token back.
    """
    raw = json.dumps({"cursor": int(cursor)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_oai_token(token: str) -> int:
    """Inverse of :func:`_encode_oai_token`.

    Raises ``ValueError`` on any malformed token so the caller can map
    it to an OAI-flavoured ``badResumptionToken`` HTTP 400.
    """
    padded = token + "=" * (-len(token) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        payload = json.loads(raw)
        cursor = int(payload.get("cursor", 0))
    except Exception as exc:  # noqa: BLE001 — token is opaque either way
        raise ValueError("badResumptionToken") from exc
    if cursor < 0:
        raise ValueError("badResumptionToken")
    return cursor


def _oai_set_label(set_spec: str) -> Optional[str]:
    """Return the human-readable label for a known ``setSpec``, or
    ``None`` for an unknown one (the caller may still use the raw
    ``set_spec`` as the ILIKE substring)."""
    for spec, label in _OAI_SETS:
        if spec == set_spec:
            return label
    return None


def _oai_apply_set_filter(query, set_spec: Optional[str]):
    """Attach the ``set`` narrower to an Article query.

    ``classified_field`` lives on ``submissions`` — Article doesn't
    carry it directly — so we soft-join on a case-insensitive title
    match. Best-effort: submissions whose ``paper_title`` drifted from
    the eventual article title won't contribute. Unknown sets fall
    back to a raw ILIKE substring against the passed value.
    """
    if not set_spec:
        return query
    fragment = _oai_set_label(set_spec) or set_spec
    like = f"%{fragment}%"
    return (
        query.join(
            Submission,
            func.lower(Submission.paper_title) == func.lower(Article.title),
        )
        .filter(Submission.classified_field.ilike(like))
    )


@router.get("/oai-pmh", response_class=Response)
def oai_pmh(
    verb: str = Query(
        ...,
        pattern="^(Identify|ListRecords|ListIdentifiers|ListMetadataFormats|ListSets|GetRecord)$",
    ),
    identifier: Optional[str] = None,
    metadataPrefix: Optional[str] = None,
    resumptionToken: Optional[str] = None,
    set: Optional[str] = Query(  # noqa: A002 — matches the OAI-PMH spec's parameter name
        None,
        alias="set",
        description="OAI setSpec — narrows records to one classified_field group.",
    ),
    db: Session = Depends(get_db),
):
    """Minimal OAI-PMH endpoint exposing Dublin Core metadata for
    published articles.

    Supported verbs:

    - ``Identify`` / ``ListMetadataFormats`` — unchanged.
    - ``ListSets`` — returns the hardcoded top-5 ``JOURNAL_SCOPE_CATEGORIES``.
    - ``ListRecords`` / ``ListIdentifiers`` — page size 100. When more
      records remain, a ``<resumptionToken>`` element is emitted; the
      final page emits none, matching the spec-compliant "done" marker.
      An optional ``set`` param narrows to one classified_field group
      via a soft-join on ``submissions.paper_title = articles.title``.
    - ``GetRecord`` — unchanged.

    Backward-compatible: a bare
    ``verb=ListRecords&metadataPrefix=oai_dc`` still works — every
    new parameter is additive."""
    base = _frontend_base()
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    journal = db.query(Journal).first()
    journal_title = (journal.title if journal else "Journal") if journal else "Journal"

    def _envelope(inner: str) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">'
            f"<responseDate>{now}</responseDate>"
            f"<request verb=\"{verb}\">{escape(base)}/oai-pmh</request>"
            f"{inner}"
            "</OAI-PMH>"
        )

    if verb == "Identify":
        inner = (
            "<Identify>"
            f"<repositoryName>{escape(journal_title)}</repositoryName>"
            f"<baseURL>{escape(base)}/oai-pmh</baseURL>"
            "<protocolVersion>2.0</protocolVersion>"
            "<earliestDatestamp>2026-01-01T00:00:00Z</earliestDatestamp>"
            "<deletedRecord>no</deletedRecord>"
            "<granularity>YYYY-MM-DDThh:mm:ssZ</granularity>"
            "</Identify>"
        )
        return Response(content=_envelope(inner), media_type="application/xml")

    if verb == "ListMetadataFormats":
        inner = (
            "<ListMetadataFormats>"
            "<metadataFormat>"
            "<metadataPrefix>oai_dc</metadataPrefix>"
            "<schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>"
            "<metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>"
            "</metadataFormat></ListMetadataFormats>"
        )
        return Response(content=_envelope(inner), media_type="application/xml")

    if verb == "ListSets":
        set_rows = "".join(
            "<set>"
            f"<setSpec>{escape(spec)}</setSpec>"
            f"<setName>{escape(name)}</setName>"
            "</set>"
            for spec, name in _OAI_SETS
        )
        return Response(
            content=_envelope(f"<ListSets>{set_rows}</ListSets>"),
            media_type="application/xml",
        )

    def _record_xml(article: Article) -> str:
        author = getattr(article, "author", None)
        author_name = (
            getattr(author, "full_name", None)
            or getattr(author, "username", None)
            or "Anonymous"
        )
        return (
            "<record>"
            "<header>"
            f"<identifier>oai:{escape(base)}:article/{article.id}</identifier>"
            f"<datestamp>{now}</datestamp>"
            "</header>"
            "<metadata>"
            '<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">'
            f"<dc:title>{escape(article.title or '')}</dc:title>"
            f"<dc:creator>{escape(author_name)}</dc:creator>"
            f"<dc:description>{escape(article.abstract or '')}</dc:description>"
            f"<dc:publisher>{escape(journal_title)}</dc:publisher>"
            f"<dc:identifier>{escape(base)}/articles/{article.id}</dc:identifier>"
            "<dc:language>en</dc:language>"
            "<dc:rights>CC BY 4.0</dc:rights>"
            "</oai_dc:dc>"
            "</metadata>"
            "</record>"
        )

    def _paginate_articles(with_author: bool):
        """Apply the ``set`` filter, decode the resumption cursor, and
        return ``(rows, next_token, complete_size, cursor)``.
        ``next_token`` is ``None`` on the last page — the caller
        omits ``<resumptionToken>`` entirely in that case.
        """
        try:
            cursor = _decode_oai_token(resumptionToken) if resumptionToken else 0
        except ValueError:
            raise HTTPException(status_code=400, detail="badResumptionToken")

        base_q = db.query(Article)
        if with_author:
            base_q = base_q.options(joinedload(Article.author))
        base_q = _oai_apply_set_filter(base_q, set)
        # A stable ordering is essential for a cursor-based token to
        # point at a consistent window across requests.
        base_q = base_q.order_by(Article.id.asc())

        complete_size = base_q.count()
        rows = base_q.offset(cursor).limit(_OAI_PAGE_SIZE).all()
        end = cursor + len(rows)
        next_token = _encode_oai_token(end) if end < complete_size else None
        return rows, next_token, complete_size, cursor

    def _resumption_xml(next_token: Optional[str], complete_size: int, cursor: int) -> str:
        """Emit the ``<resumptionToken>`` element or empty string.

        We follow the "no element on the final page" convention (per
        the task spec). Non-final pages carry ``completeListSize`` and
        the current ``cursor`` for harvesters that surface progress.
        """
        if next_token is None:
            return ""
        return (
            f'<resumptionToken completeListSize="{complete_size}" '
            f'cursor="{cursor}">{escape(next_token)}</resumptionToken>'
        )

    if verb == "ListRecords":
        rows, next_token, complete_size, cursor = _paginate_articles(with_author=True)
        body = "".join(_record_xml(a) for a in rows)
        body += _resumption_xml(next_token, complete_size, cursor)
        return Response(
            content=_envelope(f"<ListRecords>{body}</ListRecords>"),
            media_type="application/xml",
        )

    if verb == "ListIdentifiers":
        rows, next_token, complete_size, cursor = _paginate_articles(with_author=False)
        headers = "".join(
            "<header>"
            f"<identifier>oai:{escape(base)}:article/{a.id}</identifier>"
            f"<datestamp>{now}</datestamp>"
            "</header>"
            for a in rows
        )
        headers += _resumption_xml(next_token, complete_size, cursor)
        return Response(
            content=_envelope(f"<ListIdentifiers>{headers}</ListIdentifiers>"),
            media_type="application/xml",
        )

    if verb == "GetRecord":
        if not identifier:
            raise HTTPException(status_code=400, detail="identifier is required")
        try:
            article_id = int(identifier.rsplit("/", 1)[-1])
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed identifier")
        article = db.query(Article).options(joinedload(Article.author)).filter(Article.id == article_id).first()
        if article is None:
            raise HTTPException(status_code=404, detail="Record not found")
        return Response(
            content=_envelope(f"<GetRecord>{_record_xml(article)}</GetRecord>"),
            media_type="application/xml",
        )

    raise HTTPException(status_code=400, detail="Unsupported verb")


# ── Crossref XML (stub, ready for registration) ──────────

def _resolve_publication_date(db: Session, article: Article) -> datetime:
    """Best-effort publication date for the article.

    Preference order:
      1. The article's ``IssueArticle`` linkage (``issue.published_at``) —
         the canonical publish moment once slotted into an issue.
      2. ``production_records.published_at`` — set when production reaches
         the ``published`` stage, useful before an issue linkage exists.
         Only queried when ``Article`` carries a ``submission_id`` FK
         (matching the defensive pattern used elsewhere, e.g. cited_by).
      3. Today's date — last-resort so Crossref always gets a valid date.
    """
    issue_row = (
        db.query(Issue.published_at)
        .join(IssueArticle, IssueArticle.issue_id == Issue.id)
        .filter(IssueArticle.article_id == article.id, Issue.published_at.isnot(None))
        .first()
    )
    if issue_row and issue_row[0]:
        return issue_row[0]

    submission_id_col = getattr(Article, "submission_id", None)
    if submission_id_col is not None:
        prod_row = (
            db.query(ProductionRecord.published_at)
            .join(Article, Article.submission_id == ProductionRecord.submission_id)
            .filter(Article.id == article.id, ProductionRecord.published_at.isnot(None))
            .first()
        )
        if prod_row and prod_row[0]:
            return prod_row[0]

    return datetime.utcnow()


def _split_person_name(user) -> tuple[str, str]:
    """Return (given_name, surname) for a User row.

    Prefers explicit first_name/last_name columns when populated, then
    splits full_name on the first space, and finally falls back to the
    username.
    """
    first = (getattr(user, "first_name", None) or "").strip()
    last = (getattr(user, "last_name", None) or "").strip()
    if first or last:
        return first, last

    full = (getattr(user, "full_name", None) or "").strip()
    if full:
        if " " in full:
            head, tail = full.split(" ", 1)
            return head.strip(), tail.strip()
        return full, ""

    username = (getattr(user, "username", None) or "").strip()
    return username or "Anonymous", ""


def _contributors_xml(article: Article) -> str:
    """Build one or more ``<person_name>`` entries.

    Uses ``Article.authors`` (a list of User rows) when the relationship is
    defined; otherwise falls back to the single ``Article.author``. Each
    author emits ``<given_name>``, ``<surname>`` and, when the user has an
    ORCID on record, an ``<ORCID>`` element with the canonical
    ``https://orcid.org/{id}`` URL.
    """
    authors = getattr(article, "authors", None)
    if authors is None:
        single = getattr(article, "author", None)
        authors = [single] if single is not None else []
    else:
        # Guard against SQLAlchemy relationships that expose non-list
        # collections — normalise to a plain iterable.
        try:
            authors = list(authors)
        except TypeError:
            authors = []

    if not authors:
        return (
            "<contributors>"
            '<person_name sequence="first" contributor_role="author">'
            "<given_name>Anonymous</given_name><surname></surname>"
            "</person_name>"
            "</contributors>"
        )

    parts: list[str] = ["<contributors>"]
    for idx, user in enumerate(authors):
        if user is None:
            continue
        sequence = "first" if idx == 0 else "additional"
        given, surname = _split_person_name(user)
        orcid_raw = (getattr(user, "orcid", None) or "").strip()
        orcid_xml = ""
        if orcid_raw:
            if orcid_raw.startswith("http://") or orcid_raw.startswith("https://"):
                orcid_url = orcid_raw
            else:
                orcid_url = f"https://orcid.org/{orcid_raw}"
            orcid_xml = f"<ORCID>{escape(orcid_url)}</ORCID>"
        parts.append(
            f'<person_name sequence="{sequence}" contributor_role="author">'
            f"<given_name>{escape(given)}</given_name>"
            f"<surname>{escape(surname)}</surname>"
            f"{orcid_xml}"
            "</person_name>"
        )
    parts.append("</contributors>")
    return "".join(parts)


def _citation_list_xml(db: Session, article_id: int) -> str:
    rows = (
        db.query(ArticleReference)
        .filter(ArticleReference.article_id == article_id)
        .order_by(ArticleReference.sequence.asc(), ArticleReference.id.asc())
        .all()
    )
    if not rows:
        return "<citation_list/>"

    parts: list[str] = ["<citation_list>"]
    for ref in rows:
        key = f"ref{int(ref.sequence or 0)}"
        text = escape(ref.text or "")
        doi_xml = ""
        if ref.doi:
            doi_xml = f"<doi>{escape(ref.doi.strip())}</doi>"
        parts.append(
            f'<citation key="{escape(key)}">'
            f"<unstructured_citation>{text}</unstructured_citation>"
            f"{doi_xml}"
            "</citation>"
        )
    parts.append("</citation_list>")
    return "".join(parts)


@router.get("/crossref/{article_id}", response_class=Response)
def crossref_article_xml(article_id: int, db: Session = Depends(get_db)):
    article = (
        db.query(Article).options(joinedload(Article.author)).filter(Article.id == article_id).first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    pub_dt = _resolve_publication_date(db, article)
    publication_date_xml = (
        '<publication_date media_type="online">'
        f"<month>{pub_dt.month:02d}</month>"
        f"<day>{pub_dt.day:02d}</day>"
        f"<year>{pub_dt.year}</year>"
        "</publication_date>"
    )
    contributors_xml = _contributors_xml(article)
    citations_xml = _citation_list_xml(db, article.id)

    body = f"""<?xml version="1.0" encoding="UTF-8"?>
<doi_batch xmlns="http://www.crossref.org/schema/5.3.1" version="5.3.1">
  <head>
    <doi_batch_id>{article.id}-{int(datetime.utcnow().timestamp())}</doi_batch_id>
    <timestamp>{int(datetime.utcnow().timestamp())}</timestamp>
    <depositor><depositor_name>{escape(_frontend_base())}</depositor_name><email_address>editorial@example.com</email_address></depositor>
    <registrant>{escape(_frontend_base())}</registrant>
  </head>
  <body>
    <journal>
      <journal_metadata>
        <full_title>Journal</full_title>
      </journal_metadata>
      <journal_article publication_type="full_text">
        <titles><title>{escape(article.title or '')}</title></titles>
        {contributors_xml}
        <jats:abstract xmlns:jats="http://www.ncbi.nlm.nih.gov/JATS1">
          <jats:p>{escape(article.abstract or '')}</jats:p>
        </jats:abstract>
        {publication_date_xml}
        <doi_data>
          <doi>10.xxxxx/article.{article.id}</doi>
          <resource>{escape(_frontend_base())}/articles/{article.id}</resource>
        </doi_data>
        {citations_xml}
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""
    return Response(content=body, media_type="application/xml")
