import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';
import {
    ArticleEntry,
    findIssue,
    pageRangeFor,
    sectionForCategory,
    SECTION_ORDER,
    categoryColor,
    statusBadge,
    ArticleSection,
} from '../data/issues';

/* ── Citation helpers ─────────────────────────────────── */

const apaCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const names = (a.authorList ?? [{ name: a.authors }]).map((au) => au.name).join(', ');
    return `${names} (${year}). ${a.title.replace(/\.$/, '')}. Journal of Generative and Applied Intelligence Research, ${volume}(${issue}), ${a.pages}. https://doi.org/${a.doi}`;
};

const bibtexCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const names = (a.authorList ?? [{ name: a.authors }]).map((au) => au.name).join(' and ');
    return `@article{jgair${year}_${a.id},
  title   = {${a.title}},
  author  = {${names}},
  journal = {Journal of Generative and Applied Intelligence Research},
  volume  = {${volume}}, number = {${issue}}, pages = {${a.pages}}, year = {${year}},
  doi     = {${a.doi}}
}`;
};

const risCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const lines = (a.authorList ?? [{ name: a.authors }])
        .map((au) => `AU  - ${au.name}`)
        .join('\n');
    const [sp, ep] = a.pages.split('–');
    return `TY  - JOUR\n${lines}\nTI  - ${a.title}\nJO  - JGAIR\nVL  - ${volume}\nIS  - ${issue}\nSP  - ${sp ?? ''}\nEP  - ${ep ?? ''}\nPY  - ${year}\nDO  - ${a.doi}\nER  - `;
};

const fmtDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

/* ══════════════════════════════════════════════════════
 *   Citation modal
 * ══════════════════════════════════════════════════════ */

const CitationModal: React.FC<{
    article: ArticleEntry;
    volume: number;
    issue: number;
    year: number;
    onClose: () => void;
}> = ({ article, volume, issue, year, onClose }) => {
    const [tab, setTab] = useState<'apa' | 'bibtex' | 'ris'>('apa');
    const [copied, setCopied] = useState(false);
    const value = useMemo(() => {
        if (tab === 'apa') return apaCitation(article, volume, issue, year);
        if (tab === 'bibtex') return bibtexCitation(article, volume, issue, year);
        return risCitation(article, volume, issue, year);
    }, [tab, article, volume, issue, year]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-gray-900/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-brand-50 to-white">
                    <div>
                        <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">
                            Cite this article
                        </p>
                        <h3 className="text-base font-extrabold text-gray-900 mt-0.5 line-clamp-1">
                            {article.title}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg hover:bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center transition"
                        title="Close"
                    >
                        ✕
                    </button>
                </div>
                <div className="px-6 pt-4">
                    <div className="inline-flex rounded-xl bg-gray-100 p-1">
                        {(['apa', 'bibtex', 'ris'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition uppercase tracking-wider ${
                                    tab === t
                                        ? 'bg-white text-brand-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {t === 'apa' ? 'APA 7' : t === 'bibtex' ? 'BibTeX' : 'RIS'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-6">
                    <pre className="bg-gray-900 text-emerald-200 rounded-2xl p-4 text-[12px] leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-auto">
                        {value}
                    </pre>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(value).then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1500);
                                });
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg transition"
                        >
                            {copied ? '✓ Copied' : '📋 Copy to clipboard'}
                        </button>
                        <Link
                            to={`/articles/${article.id}`}
                            className="text-sm text-brand-700 hover:text-brand-900 font-semibold no-underline"
                        >
                            Open article page →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════
 *   Article row — with inline abstract expander + PDF/HTML/Cite
 * ══════════════════════════════════════════════════════ */

const ArticleRow: React.FC<{
    article: ArticleEntry;
    onCite: (a: ArticleEntry) => void;
}> = ({ article, onCite }) => {
    const [showAbstract, setShowAbstract] = useState(false);
    return (
        <div className="flex items-start gap-4 py-4 border-b border-gray-100 last:border-0 group">
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            categoryColor[article.category] || 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {article.category}
                    </span>
                    <span className="text-xs text-gray-400">pp. {article.pages}</span>
                    {article.openAccess && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            🔓 Open Access
                        </span>
                    )}
                </div>
                <h4 className="text-base font-bold text-gray-900 group-hover:text-brand-700 transition leading-snug">
                    <Link
                        to={`/articles/${article.id}`}
                        className="no-underline text-inherit hover:text-brand-700"
                    >
                        {article.title}
                    </Link>
                </h4>
                <p className="text-sm text-gray-500 mt-1">{article.authors}</p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                    <a
                        href={`https://doi.org/${article.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 font-mono hover:text-brand-700 no-underline"
                    >
                        {article.doi}
                    </a>
                    <span className="text-[11px] text-gray-300">|</span>
                    <button
                        onClick={() => setShowAbstract((s) => !s)}
                        className={`text-xs transition ${
                            showAbstract
                                ? 'text-brand-700 font-semibold'
                                : 'text-gray-500 hover:text-brand-700'
                        }`}
                    >
                        {showAbstract ? 'Hide abstract' : 'Abstract'}
                    </button>
                    <span className="text-[11px] text-gray-300">|</span>
                    <button
                        onClick={() => onCite(article)}
                        className="text-xs text-gray-500 hover:text-brand-700 transition"
                    >
                        Cite
                    </button>
                </div>
                {showAbstract && (
                    <div className="mt-3 p-4 bg-brand-50/60 border border-brand-100 rounded-xl text-sm text-gray-700 leading-relaxed">
                        {article.abstract ? (
                            article.abstract
                        ) : (
                            <span className="italic text-gray-400">
                                No abstract available — see the full text.
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <a
                    href={article.pdfUrl ?? '#'}
                    className="text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg font-semibold text-center no-underline transition"
                >
                    PDF
                </a>
                <a
                    href={article.htmlUrl ?? `/articles/${article.id}`}
                    className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-semibold text-center no-underline transition"
                >
                    HTML
                </a>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════
 *   Main page
 * ══════════════════════════════════════════════════════ */

const IssueDetailPage: React.FC = () => {
    const { volume: volParam, issue: issueParam } = useParams<{ volume: string; issue: string }>();
    const volumeNum = Number(volParam);
    const issueNum = Number(issueParam);
    const found =
        Number.isFinite(volumeNum) && Number.isFinite(issueNum) ? findIssue(volumeNum, issueNum) : null;
    const [citing, setCiting] = useState<ArticleEntry | null>(null);

    if (!found) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 flex items-center justify-center py-24">
                    <div className="text-center max-w-md px-4">
                        <span className="text-5xl block mb-4">📄</span>
                        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Issue not found</h1>
                        <p className="text-sm text-gray-500 mb-6">
                            We couldn&apos;t find Volume {volParam}, Issue {issueParam}. It may not exist yet.
                        </p>
                        <Link
                            to="/issues"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            ← Back to Issues &amp; Archives
                        </Link>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    const { volume, issue } = found;
    const badge = statusBadge[issue.status];
    const pageRange = pageRangeFor(issue);
    const publishedOn = fmtDate(issue.publishedDate);

    /* Group articles by their section bucket */
    const grouped: Record<ArticleSection, ArticleEntry[]> = {
        Editorial: [],
        'Research Articles': [],
        'Review Articles': [],
        'Short Communications': [],
        'Case Studies': [],
        Other: [],
    };
    for (const a of issue.articles) {
        grouped[sectionForCategory(a.category)].push(a);
    }

    const seoTitle = `Volume ${volume.volume}, Issue ${issue.number} — JGAIR`;
    const seoDescription = (issue.theme || issue.editorialNote || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240) || undefined;
    const seoCanonical =
        typeof window !== 'undefined'
            ? `${window.location.origin}/issues/${volume.volume}/${issue.number}`
            : undefined;
    const publicationIssueSchema = {
        '@context': 'https://schema.org',
        '@type': 'PublicationIssue',
        issueNumber: issue.number,
        datePublished: issue.publishedDate,
        isPartOf: {
            '@type': 'PublicationVolume',
            volumeNumber: volume.volume,
            isPartOf: {
                '@type': 'Periodical',
                name: 'Journal of Generative and Applied Intelligence Research',
            },
        },
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={seoTitle}
                description={seoDescription}
                canonical={seoCanonical}
                type="website"
                schema={publicationIssueSchema}
            />
            <Header />

            {/* ── Breadcrumb ────────────────────────────── */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-xs text-gray-500">
                    <Link to="/" className="hover:text-brand-700 no-underline text-gray-500">
                        Home
                    </Link>
                    <span className="mx-2">›</span>
                    <Link to="/issues" className="hover:text-brand-700 no-underline text-gray-500">
                        Issues &amp; Archives
                    </Link>
                    <span className="mx-2">›</span>
                    <span className="text-gray-700 font-semibold">
                        Volume {volume.volume}, Issue {issue.number}
                    </span>
                </div>
            </div>

            <main className="flex-1">
                {/* ── Issue header ─────────────────────── */}
                <section className="relative overflow-hidden bg-gradient-to-r from-brand-700 via-brand-800 to-brand-900 text-white">
                    <div className="absolute inset-0 opacity-25 pointer-events-none" aria-hidden="true">
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-400 rounded-full blur-3xl" />
                        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-400 rounded-full blur-3xl" />
                    </div>
                    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 grid lg:grid-cols-3 gap-10 items-center">
                        {/* Cover */}
                        <div className="lg:col-span-1">
                            <div className="aspect-[3/4] max-w-xs mx-auto rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 relative">
                                {issue.coverImage ? (
                                    <>
                                        <img
                                            src={issue.coverImage}
                                            alt={`Cover of Volume ${volume.volume}, Issue ${issue.number}`}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-b from-brand-950/40 via-transparent to-brand-950/85" />
                                    </>
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-brand-500 to-brand-800" />
                                )}
                                <div className="relative h-full flex flex-col justify-between p-6 text-center">
                                    <div>
                                        <span className="text-white text-xs font-bold uppercase tracking-widest drop-shadow">
                                            JGAIR
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-brand-100 text-sm font-semibold drop-shadow">
                                            Volume {volume.volume}
                                        </p>
                                        <p className="text-white text-5xl font-extrabold my-2 drop-shadow-lg">
                                            {issue.number}
                                        </p>
                                        <p className="text-brand-100 text-sm font-semibold drop-shadow">
                                            {issue.month} {volume.year}
                                        </p>
                                    </div>
                                    {issue.theme ? (
                                        <div className="pt-4 border-t border-white/20">
                                            <p className="text-xs text-brand-100 italic drop-shadow">
                                                {issue.theme}
                                            </p>
                                        </div>
                                    ) : (
                                        <div />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Meta */}
                        <div className="lg:col-span-2">
                            <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${badge.color}`}
                            >
                                {badge.text}
                            </span>
                            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
                                Volume {volume.volume}, Issue {issue.number}
                            </h1>
                            <p className="mt-2 text-lg text-brand-100">
                                {issue.month} {volume.year}
                                {pageRange ? ` · pp. ${pageRange}` : ''}
                            </p>
                            {publishedOn && (
                                <p className="text-sm text-brand-200 mt-1">
                                    Published on{' '}
                                    <span className="font-semibold text-white">{publishedOn}</span>
                                </p>
                            )}

                            <div className="mt-5 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    📄 {issue.articleCount} article
                                    {issue.articleCount === 1 ? '' : 's'}
                                </span>
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    🔗 DOI 10.xxxxx/jgair.{volume.year}.{String(issue.number).padStart(2, '0')}
                                </span>
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    🔓 Open Access · CC BY 4.0
                                </span>
                            </div>

                            {issue.editorialNote && (
                                <div className="mt-6 p-4 bg-white/10 rounded-xl border border-white/15">
                                    <p className="text-xs font-bold text-brand-100 uppercase tracking-wider mb-2">
                                        Editor&apos;s note
                                    </p>
                                    <p className="text-sm text-white/90 leading-relaxed">
                                        {issue.editorialNote}
                                    </p>
                                </div>
                            )}

                            {issue.status === 'published' && (
                                <div className="mt-6 flex flex-wrap gap-3">
                                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white text-brand-800 text-sm font-bold rounded-lg hover:bg-gray-100 transition">
                                        📥 Download full issue (PDF)
                                    </button>
                                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/25 text-white text-sm font-bold rounded-lg hover:bg-white/20 transition">
                                        📋 Export citations
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Articles by section ──────────────── */}
                <section className="py-12">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        {issue.status !== 'published' ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                                <span className="text-4xl mb-3 block">
                                    {issue.status === 'accepting' ? '📝' : '🗓️'}
                                </span>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">
                                    {issue.status === 'accepting'
                                        ? 'Now Accepting Submissions'
                                        : 'Not Yet Open for Submissions'}
                                </h2>
                                <p className="text-sm text-gray-500 mb-4">
                                    {issue.deadline
                                        ? `Submission deadline: ${issue.deadline}`
                                        : 'Timeline to be announced'}
                                </p>
                                {issue.theme && (
                                    <p className="text-xs text-violet-600 mb-4">Theme: {issue.theme}</p>
                                )}
                                {issue.status === 'accepting' && (
                                    <Link
                                        to="/author-login"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                                    >
                                        Submit to This Issue →
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="text-lg font-extrabold text-gray-900">
                                        Table of contents
                                    </h2>
                                    <span className="text-xs text-gray-400">
                                        {issue.articleCount} article
                                        {issue.articleCount === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="px-6 py-2">
                                    {SECTION_ORDER.filter((s) => grouped[s].length > 0).map(
                                        (section) => (
                                            <div key={section} className="py-4">
                                                <p className="text-[11px] font-extrabold text-brand-600 uppercase tracking-widest mb-1">
                                                    {section}
                                                </p>
                                                <div className="w-8 h-0.5 bg-brand-600 rounded mb-2" />
                                                {grouped[section].map((a) => (
                                                    <ArticleRow
                                                        key={a.id}
                                                        article={a}
                                                        onCite={setCiting}
                                                    />
                                                ))}
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Back to archive */}
                        <div className="mt-8 text-center">
                            <Link
                                to="/issues"
                                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-700 no-underline"
                            >
                                ← Back to Issues &amp; Archives
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {citing && (
                <CitationModal
                    article={citing}
                    volume={volume.volume}
                    issue={issue.number}
                    year={volume.year}
                    onClose={() => setCiting(null)}
                />
            )}

            <Footer />
        </div>
    );
};

export default IssueDetailPage;
