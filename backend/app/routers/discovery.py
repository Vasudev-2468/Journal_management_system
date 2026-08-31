"""SEO / indexing endpoints: sitemap.xml, robots.txt, OAI-PMH, Crossref XML."""

from datetime import datetime
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models.article import Article
from app.models.journal import Journal
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

    parts.append("</urlset>")
    return Response(content="\n".join(parts), media_type="application/xml")


# ── /oai-pmh ─────────────────────────────────────────────

@router.get("/oai-pmh", response_class=Response)
def oai_pmh(
    verb: str = Query(..., pattern="^(Identify|ListRecords|ListIdentifiers|ListMetadataFormats|GetRecord)$"),
    identifier: Optional[str] = None,
    metadataPrefix: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Minimal OAI-PMH endpoint exposing Dublin Core metadata for published articles."""
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

    if verb == "ListRecords":
        rows = db.query(Article).options(joinedload(Article.author)).all()
        inner = "<ListRecords>" + "".join(_record_xml(a) for a in rows) + "</ListRecords>"
        return Response(content=_envelope(inner), media_type="application/xml")

    if verb == "ListIdentifiers":
        rows = db.query(Article).all()
        headers = "".join(
            "<header>"
            f"<identifier>oai:{escape(base)}:article/{a.id}</identifier>"
            f"<datestamp>{now}</datestamp>"
            "</header>"
            for a in rows
        )
        return Response(content=_envelope(f"<ListIdentifiers>{headers}</ListIdentifiers>"), media_type="application/xml")

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

@router.get("/crossref/{article_id}", response_class=Response)
def crossref_article_xml(article_id: int, db: Session = Depends(get_db)):
    article = (
        db.query(Article).options(joinedload(Article.author)).filter(Article.id == article_id).first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    author = getattr(article, "author", None)
    author_name = (
        getattr(author, "full_name", None)
        or getattr(author, "username", None)
        or "Anonymous"
    )
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
        <contributors>
          <person_name sequence="first" contributor_role="author">
            <given_name>{escape((author_name.split(' ')[0]) if ' ' in author_name else author_name)}</given_name>
            <surname>{escape((author_name.split(' ', 1)[1]) if ' ' in author_name else '')}</surname>
          </person_name>
        </contributors>
        <jats:abstract xmlns:jats="http://www.ncbi.nlm.nih.gov/JATS1">
          <jats:p>{escape(article.abstract or '')}</jats:p>
        </jats:abstract>
        <doi_data>
          <doi>10.xxxxx/article.{article.id}</doi>
          <resource>{escape(_frontend_base())}/articles/{article.id}</resource>
        </doi_data>
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""
    return Response(content=body, media_type="application/xml")
