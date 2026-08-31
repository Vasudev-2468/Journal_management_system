"""Unit tests for ``app.services.jats_renderer.render_jats_to_html``.

The renderer is a pure function over JATS XML — no DB, no network, no
env. We assert four load-bearing properties:

  1. Title is html-escaped (a hostile ``<script>`` in the title cannot
     leak into the output).
  2. Each ``<ref><mixed-citation>`` becomes an ``<li>`` inside
     ``<ol class="references">``.
  3. A document with no abstract still renders — the abstract section
     is simply omitted, and the outer article + references section are
     still present.
  4. ``<script>`` never appears anywhere in the output — the renderer
     must not emit script tags, even if provoked by hostile input.
"""

from __future__ import annotations

from app.services.jats_renderer import render_jats_to_html


# ── Title escaping ───────────────────────────────────────


def test_title_is_html_escaped():
    jats = """
    <article>
      <front>
        <article-meta>
          <title-group>
            <article-title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; friends</article-title>
          </title-group>
        </article-meta>
      </front>
    </article>
    """.strip()
    html = render_jats_to_html(jats)
    # The escaped-in-source '<script>' is decoded by the XML parser to
    # a literal '<script>' string, but the renderer must re-escape it.
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&amp; friends" in html


def test_title_with_raw_special_chars_escapes():
    jats = "<article><article-title>5 &gt; 4 &amp; true</article-title></article>"
    html = render_jats_to_html(jats)
    assert "5 &gt; 4 &amp; true" in html


# ── References list ──────────────────────────────────────


def test_references_render_as_ordered_list():
    jats = """
    <article>
      <article-title>Paper</article-title>
      <back>
        <ref-list>
          <ref><mixed-citation>Doe J. (2020) On things. Journal, 1(1).</mixed-citation></ref>
          <ref><mixed-citation>Smith A. (2019) On other things.</mixed-citation></ref>
        </ref-list>
      </back>
    </article>
    """.strip()
    html = render_jats_to_html(jats)
    assert '<ol class="references">' in html
    assert html.count("<li>") == 2
    assert "Doe J. (2020) On things. Journal, 1(1)." in html
    assert "Smith A. (2019) On other things." in html


def test_empty_reference_list_still_emits_ol():
    """The reader stylesheet expects the ``<ol class="references">``
    element to always exist — an empty list is still a list."""
    jats = "<article><article-title>Empty refs</article-title></article>"
    html = render_jats_to_html(jats)
    assert '<ol class="references"></ol>' in html


# ── Missing abstract graceful degradation ────────────────


def test_missing_abstract_does_not_raise_and_omits_section():
    jats = """
    <article>
      <article-title>Titled but abstract-less</article-title>
      <back>
        <ref-list>
          <ref><mixed-citation>Ref one.</mixed-citation></ref>
        </ref-list>
      </back>
    </article>
    """.strip()
    html = render_jats_to_html(jats)
    assert "Titled but abstract-less" in html
    # The abstract section header must NOT appear when there is no abstract.
    assert 'aria-label="Abstract"' not in html
    assert "<h2>Abstract</h2>" not in html
    # References are still rendered.
    assert "Ref one." in html


def test_malformed_xml_returns_placeholder_shell_not_raise():
    """Invalid XML must not blow up the render — the caller wraps the
    return value in a full HTML page, so a raise here would 500 the
    reader endpoint."""
    html = render_jats_to_html("<article><unterminated>")
    # Placeholder shell is defined by the module — an article + empty h1.
    assert html.startswith("<article>")
    assert "</article>" in html


def test_empty_input_returns_placeholder():
    html = render_jats_to_html("")
    assert "<article>" in html


# ── Script safety ────────────────────────────────────────


def test_no_script_tag_ever_in_output():
    """Every path the renderer can take must produce output without a
    literal ``<script>`` tag."""
    hostile_samples = [
        "<article><article-title><script>x=1</script></article-title></article>",
        "<article><abstract><p><script>alert(1)</script></p></abstract></article>",
        "<article><back><ref><mixed-citation><script>x</script></mixed-citation></ref></back></article>",
    ]
    for xml in hostile_samples:
        out = render_jats_to_html(xml)
        assert "<script>" not in out.lower(), f"leaked <script> for input: {xml}"
        assert "onerror=" not in out.lower()
        assert "onload=" not in out.lower()


# ── Contributors / byline ────────────────────────────────


def test_contributors_render_as_byline_when_present():
    jats = """
    <article>
      <article-title>With authors</article-title>
      <contrib-group>
        <contrib><surname>Doe</surname><given-names>Jane</given-names></contrib>
        <contrib><surname>Roe</surname><given-names>Rick</given-names></contrib>
      </contrib-group>
    </article>
    """.strip()
    html = render_jats_to_html(jats)
    assert 'class="byline"' in html
    assert "Jane Doe" in html
    assert "Rick Roe" in html


def test_no_byline_when_no_contributors():
    jats = "<article><article-title>Solo</article-title></article>"
    html = render_jats_to_html(jats)
    assert 'class="byline"' not in html


# ── Abstract paragraphs ──────────────────────────────────


def test_abstract_paragraphs_are_escaped_and_wrapped():
    jats = """
    <article>
      <article-title>Abstract test</article-title>
      <abstract>
        <p>First paragraph &amp; escapes.</p>
        <p>Second paragraph.</p>
      </abstract>
    </article>
    """.strip()
    html = render_jats_to_html(jats)
    assert html.count("<p>") >= 2
    assert "First paragraph &amp; escapes." in html
    assert "Second paragraph." in html
    assert 'aria-label="Abstract"' in html
