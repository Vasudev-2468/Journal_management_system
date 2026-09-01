"""Tests for the editor-gated ``/reference-import`` router.

* BibTeX and RIS blobs are parsed into ``article_references`` rows
* malformed entries are silently dropped rather than 500-ing
* a non-editor caller is refused with 403 (or 401 if the token is
  not even editor-shaped)
"""

from __future__ import annotations

import os

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not configured; skipping reference-import tests.",
)


BIBTEX_SAMPLE = """
@article{smith2024ai,
  author = {Smith, Jane and Doe, John},
  title = {Advances in Machine Learning},
  journal = {Journal of AI},
  year = {2024},
  volume = {12},
  number = {3},
  pages = {100--115},
  doi = {10.1234/jml.2024.12345}
}

@inproceedings{lee2023nlp,
  author = {Lee, Alice},
  title = {NLP Systems Overview},
  booktitle = {Proc. of NLP-Con},
  year = {2023}
}
"""

RIS_SAMPLE = """
TY  - JOUR
AU  - Doe, John
TI  - Sample RIS Article
JO  - Sample Journal
PY  - 2023
VL  - 5
IS  - 2
SP  - 33
EP  - 47
DO  - 10.5678/ris.2023.999
ER  -

TY  - CHAP
AU  - Roe, Rick
TI  - Sample RIS Chapter
BT  - Sample Book
PY  - 2022
ER  -
"""

MALFORMED_SAMPLE = """
@article{
  this-is-not-a-valid-bibtex-blob
  --- garbage ---
}

not even an @-entry
"""


@pytest.fixture()
def _article(db_session, test_journal, test_author):
    from app.models.article import Article

    a = Article(
        title="Reference Import Target",
        abstract="a",
        content="c",
        author_id=test_author.id,
        journal_id=test_journal.id,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


def test_bibtex_import_inserts_references(
    db_session, _article, authorised_editor_client
):
    resp = authorised_editor_client.post(
        f"/reference-import/{_article.id}",
        json={"format": "bibtex", "text": BIBTEX_SAMPLE},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["inserted"] == 2
    assert len(body["entries"]) == 2

    from app.models.article_reference import ArticleReference

    rows = (
        db_session.query(ArticleReference)
        .filter(ArticleReference.article_id == _article.id)
        .all()
    )
    assert len(rows) == 2


def test_ris_import_parses(
    db_session, _article, authorised_editor_client
):
    resp = authorised_editor_client.post(
        f"/reference-import/{_article.id}",
        json={"format": "ris", "text": RIS_SAMPLE},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["inserted"] >= 1


def test_malformed_blob_is_skipped_not_500(
    db_session, _article, authorised_editor_client
):
    resp = authorised_editor_client.post(
        f"/reference-import/{_article.id}",
        json={"format": "bibtex", "text": MALFORMED_SAMPLE},
    )
    # Router responds 201 with ``inserted: 0`` for a paste that yields no
    # usable entries. It must NEVER 5xx on malformed input.
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["inserted"] == 0
    assert body["entries"] == []


def test_non_editor_caller_is_rejected(
    db_session, _article, authorised_author_client
):
    resp = authorised_author_client.post(
        f"/reference-import/{_article.id}",
        json={"format": "bibtex", "text": BIBTEX_SAMPLE},
    )
    # ``require_editor_mfa`` yields 403 for a non-editor role, or 401 for
    # a token missing the mfa_verified claim entirely.
    assert resp.status_code in (401, 403)
