"""Post-publication corrections + retractions (spec §29, §30).

Corrections and retractions are two distinct rows in the same table —
``notice_type`` disambiguates. Retractions are terminal; a retracted
article's public page must show the retraction notice prominently
and never suppress the original.

Nothing on this table is ever updated after a notice is published.
The audit trail is preserved by design so a compliance query can
reconstruct "when was this article corrected, by whom, and why".
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class ArticleCorrection(Base):
    __tablename__ = "article_corrections"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(
        Integer, ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    notice_type = Column(String(32), nullable=False, index=True)  # 'correction' | 'retraction' | 'expression_of_concern'
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)                          # retraction reason (COPE code, e.g. 'fabrication', 'redundant_publication', 'ethical_violation')
    published_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    published_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_by_email = Column(String(255), nullable=True)
    doi_of_notice = Column(String(200), nullable=True)            # if the correction has its own DOI
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ArticleCorrection(id={self.id}, article={self.article_id}, type={self.notice_type})>"
