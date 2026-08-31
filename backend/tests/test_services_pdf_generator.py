"""Unit tests for ``app.services.pdf_generator.render_article_pdf``.

These tests do not require Postgres — the renderer takes a duck-typed
``article`` object plus an iterable of references and returns bytes.
The two contracts we verify:

  * Output is a real PDF (starts with the ``%PDF-`` magic).
  * Edge inputs — empty references, a very long title, a missing
    abstract, an unknown author — do not raise.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.pdf_generator import render_article_pdf


def _fake_article(*, title="A short paper", abstract="An abstract.", author=None):
    return SimpleNamespace(title=title, abstract=abstract, author=author)


def _fake_author(full_name="Jane Doe"):
    return SimpleNamespace(full_name=full_name, first_name=None, last_name=None, username=None)


def _refs(*strings):
    return [SimpleNamespace(text=s) for s in strings]


# ── Baseline: real PDF bytes ─────────────────────────────


def test_output_starts_with_pdf_magic_bytes():
    art = _fake_article(author=_fake_author())
    refs = _refs("Doe J. Foo. 2020.", "Roe R. Bar. 2019.")
    out = render_article_pdf(art, refs)
    assert isinstance(out, (bytes, bytearray))
    assert bytes(out[:5]) == b"%PDF-"
    # The trailer must also land — a valid PDF ends with %%EOF.
    assert b"%%EOF" in out


def test_output_is_nontrivial_size():
    art = _fake_article(author=_fake_author())
    out = render_article_pdf(art, _refs("Ref one."))
    # Even the barest single-page PDF is well above a few hundred bytes.
    assert len(out) > 200


# ── Edge cases: no references, no abstract ───────────────


def test_empty_references_still_produces_valid_pdf():
    art = _fake_article(author=_fake_author(), abstract="A")
    out = render_article_pdf(art, [])
    assert bytes(out[:5]) == b"%PDF-"


def test_none_references_argument_treated_as_empty():
    art = _fake_article(author=_fake_author(), abstract="A")
    out = render_article_pdf(art, None)
    assert bytes(out[:5]) == b"%PDF-"


def test_missing_abstract_does_not_crash():
    art = _fake_article(author=_fake_author(), abstract=None)
    out = render_article_pdf(art, _refs("Ref A"))
    assert bytes(out[:5]) == b"%PDF-"


def test_missing_author_does_not_crash():
    art = _fake_article(author=None, abstract="A")
    out = render_article_pdf(art, _refs("Ref A"))
    assert bytes(out[:5]) == b"%PDF-"


# ── Long / hostile input ─────────────────────────────────


def test_very_long_title_does_not_raise():
    long_title = "Word " * 400  # ~2000 chars
    art = _fake_article(title=long_title, author=_fake_author())
    out = render_article_pdf(art, _refs("Only ref."))
    assert bytes(out[:5]) == b"%PDF-"


def test_many_references_still_produces_valid_pdf():
    art = _fake_article(author=_fake_author())
    many = _refs(*[f"Reference number {i}. Some journal. (20{i:02d})." for i in range(40)])
    out = render_article_pdf(art, many)
    assert bytes(out[:5]) == b"%PDF-"


def test_title_with_special_chars_does_not_raise():
    art = _fake_article(
        title="Weird () \\ characters and unicode: cafe naive",
        author=_fake_author(),
    )
    out = render_article_pdf(art, _refs("A"))
    assert bytes(out[:5]) == b"%PDF-"


def test_reference_as_plain_string_accepted():
    """The service normalises plain-string references so tests can pass
    a bare list of strings without wrapping in ORM rows."""
    art = _fake_article(author=_fake_author())
    out = render_article_pdf(art, ["Plain string ref."])
    assert bytes(out[:5]) == b"%PDF-"


def test_pdf_still_valid_when_pymupdf_is_unavailable(monkeypatch):
    """Simulate PyMuPDF being missing — the service must transparently
    fall back to the hand-rolled writer and still produce a valid PDF."""
    from app.services import pdf_generator as gen

    def _boom(*args, **kwargs):
        raise ImportError("fitz missing")

    monkeypatch.setattr(gen, "_render_with_fitz", _boom)
    art = _fake_article(author=_fake_author())
    out = render_article_pdf(art, _refs("Ref A"))
    assert bytes(out[:5]) == b"%PDF-"
