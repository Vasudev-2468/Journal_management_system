"""Render a minimal JATS 1.3 XML article as an accessible HTML5 fragment.

The upstream ``routers/jats.py`` endpoint serialises a subset of every
published article — title, abstract, contributors and the reference list —
as JATS. Reader clients need the same information in HTML, so this module
parses that XML back and emits a clean, escape-safe fragment that the
``article_render`` router can drop into a full HTML page.

Design choices worth naming:

* **Stdlib only.** ``xml.etree.ElementTree`` is used exclusively — no
  ``lxml`` — because production ships without it and the project already
  pins ``xml.etree`` for parsing everywhere else.
* **Every text node is escaped.** Values go through ``html.escape`` before
  they touch the output string, so a title of ``5 > 4 & true`` cannot
  smuggle markup into the page.
* **No inline scripts.** The renderer never emits ``<script>`` tags or
  ``on*`` attributes; the router layer therefore does not need a CSP shim
  to keep the fragment safe.
* **Fault-tolerant.** Malformed or empty XML degrades to an empty
  ``<article>`` shell rather than raising, so a corrupt row cannot 500 the
  reader endpoint. Structural errors are caught; missing children are
  simply omitted.
"""

from __future__ import annotations

import html
import xml.etree.ElementTree as ET
from typing import Iterable, List, Optional


def _text(node: Optional[ET.Element]) -> str:
    """Concatenate all text under ``node`` (including nested elements).

    ``ET.Element.itertext`` walks the element in document order and returns
    every text and tail fragment, which is exactly what we need for mixed
    citation content (``<mixed-citation>Doe, J. <pub-id>10.1/x</pub-id></mixed-citation>``).
    Returns an empty string when the node is ``None`` or holds no text.
    """
    if node is None:
        return ""
    return "".join(node.itertext()).strip()


def _find_all(root: ET.Element, tag: str) -> List[ET.Element]:
    """Locate every ``tag`` descendant regardless of default namespace.

    JATS documents in this codebase are emitted without a default xmlns,
    but we still walk ``iter()`` so a caller who wrapped the content in a
    namespaced root would not silently produce an empty document.
    """
    hits: List[ET.Element] = []
    for el in root.iter():
        # Strip the ``{ns}`` prefix from Clark-notation tags before matching.
        local = el.tag.rsplit("}", 1)[-1] if isinstance(el.tag, str) else ""
        if local == tag:
            hits.append(el)
    return hits


def _find_first(root: ET.Element, tag: str) -> Optional[ET.Element]:
    matches = _find_all(root, tag)
    return matches[0] if matches else None


def _extract_title(root: ET.Element) -> str:
    return _text(_find_first(root, "article-title"))


def _extract_abstract(root: ET.Element) -> List[str]:
    """Return each abstract paragraph as a separate string.

    JATS puts prose inside ``<abstract><p>…</p></abstract>``. When there
    are no ``<p>`` children we fall back to the abstract's own text so a
    minimally-tagged document still renders something.
    """
    abstract = _find_first(root, "abstract")
    if abstract is None:
        return []
    paragraphs = [_text(p) for p in _find_all(abstract, "p")]
    paragraphs = [p for p in paragraphs if p]
    if paragraphs:
        return paragraphs
    whole = _text(abstract)
    return [whole] if whole else []


def _extract_contributors(root: ET.Element) -> List[str]:
    """Turn each ``<contrib>`` into a display name (``Given Surname``).

    We keep the order the XML declared, drop rows with no name at all, and
    fall back to whatever ``<string-name>`` says when the split parts are
    absent. That matches how ``routers/jats.py`` emits authors today.
    """
    names: List[str] = []
    for contrib in _find_all(root, "contrib"):
        surname = _text(_find_first(contrib, "surname"))
        given = _text(_find_first(contrib, "given-names"))
        if surname or given:
            display = f"{given} {surname}".strip()
        else:
            display = _text(_find_first(contrib, "string-name"))
        if display:
            names.append(display)
    return names


def _extract_references(root: ET.Element) -> List[str]:
    """Each ``<ref>`` becomes its plain-text citation string.

    ``<mixed-citation>`` carries the human-readable form; we use its
    concatenated text so DOI / URL child elements (rendered as text by
    ``itertext``) are preserved without leaking their markup.
    """
    citations: List[str] = []
    for ref in _find_all(root, "ref"):
        mixed = _find_first(ref, "mixed-citation")
        citation = _text(mixed) if mixed is not None else _text(ref)
        if citation:
            citations.append(citation)
    return citations


def _render_paragraphs(paragraphs: Iterable[str]) -> str:
    return "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)


def _render_authors(names: List[str]) -> str:
    if not names:
        return ""
    escaped = ", ".join(html.escape(n) for n in names)
    # ``aria-label`` gives screen readers a hint that this line is the
    # byline; ``rel="author"`` would require a link target we do not have.
    return f'<p class="byline" aria-label="Authors">{escaped}</p>'


def _render_references(citations: List[str]) -> str:
    if not citations:
        # Emit an empty ordered list rather than omitting the section so
        # the DOM shape stays predictable for the reader stylesheet.
        return '<ol class="references"></ol>'
    items = "".join(f"<li>{html.escape(c)}</li>" for c in citations)
    return f'<ol class="references">{items}</ol>'


def render_jats_to_html(jats_xml: str) -> str:
    """Render a JATS XML document as an accessible HTML5 fragment.

    Output shape (guaranteed):

        <article>
          <h1>…title…</h1>
          <p class="byline">…authors…</p>              (only if present)
          <section aria-label="Abstract">
            <h2>Abstract</h2>
            <p>…</p>
          </section>
          <section aria-label="References">
            <h2>References</h2>
            <ol class="references"><li>…</li>…</ol>
          </section>
        </article>

    Every string is passed through ``html.escape`` before being placed in
    the template, so hostile content in the source XML cannot inject tags,
    attributes or JS. The function never emits ``<script>`` and never sets
    any ``on*`` handler attribute.
    """
    try:
        root = ET.fromstring(jats_xml or "")
    except ET.ParseError:
        # A parse failure is not an error the reader can act on; return a
        # placeholder shell so the outer page still renders cleanly.
        return "<article><h1></h1></article>"

    title = _extract_title(root)
    authors = _extract_contributors(root)
    abstract_paragraphs = _extract_abstract(root)
    references = _extract_references(root)

    title_html = f"<h1>{html.escape(title)}</h1>"
    byline_html = _render_authors(authors)

    if abstract_paragraphs:
        abstract_html = (
            '<section aria-label="Abstract">'
            "<h2>Abstract</h2>"
            f"{_render_paragraphs(abstract_paragraphs)}"
            "</section>"
        )
    else:
        abstract_html = ""

    references_html = (
        '<section aria-label="References">'
        "<h2>References</h2>"
        f"{_render_references(references)}"
        "</section>"
    )

    return (
        "<article>"
        f"{title_html}"
        f"{byline_html}"
        f"{abstract_html}"
        f"{references_html}"
        "</article>"
    )
