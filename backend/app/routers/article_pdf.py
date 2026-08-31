"""Reader-facing generated PDF for a published article.

Complements the HTML view served by ``article_render`` and the JATS view
served by ``jats``: same three columns (title, abstract, references) —
same shape, three transports. This route is deliberately named
``generated.pdf`` so it never collides with an operator-uploaded
manuscript PDF served from S3; if the article eventually acquires a
typeset PDF asset that lives at ``/articles/{id}/manuscript.pdf``, both
can coexist.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article
from app.models.article_reference import ArticleReference
from app.services.pdf_generator import render_article_pdf

router = APIRouter()


@router.get(
    "/{article_id}/generated.pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def article_generated_pdf(
    article_id: int, db: Session = Depends(get_db)
) -> Response:
    """Return an A4 PDF with the article's title, byline, abstract, and refs."""
    article = (
        db.query(Article)
        .options(joinedload(Article.author))
        .filter(Article.id == article_id)
        .first()
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")

    refs = (
        db.query(ArticleReference)
        .filter(ArticleReference.article_id == article_id)
        .order_by(ArticleReference.sequence.asc(), ArticleReference.id.asc())
        .all()
    )

    pdf_bytes = render_article_pdf(article, refs)

    # ``inline`` — the browser opens the PDF in a tab rather than
    # triggering a download prompt. Callers who want a download can add
    # ``?download=1`` handling later; keep the default as inline for the
    # reader flow.
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=article-{article.id}.pdf",
        },
    )
