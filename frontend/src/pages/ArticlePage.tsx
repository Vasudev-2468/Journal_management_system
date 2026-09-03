import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';
import ArticleNoticesBanner from '../components/article/ArticleNoticesBanner';
import {
    findArticleById,
    getRelatedArticles,
    categoryColor,
    Author,
    ArticleEntry,
    Figure as ArticleFigure,
    Table as ArticleTable,
    ArticleContentSection,
} from '../data/issues';
import {
    fetchReferences,
    ArticleReference,
    fetchCitedBy,
    CitedByResponse,
} from '../api/platform';
import { getAIRecommendations, RelatedArticle } from '../api/ai';
import {
    trackView,
    trackDownload,
    getStats,
    ArticleStats,
} from '../api/articleStats';

/* ══════════════════════════════════════════════════════
 *   Helpers
 * ══════════════════════════════════════════════════════ */

const fmtDate = (iso?: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const initialsOf = (name: string): string =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

/** Build an APA-7 citation from the article + issue metadata. */
const apaCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const names = (a.authorList ?? [{ name: a.authors }])
        .map((au) => au.name)
        .join(', ');
    const title = a.title.replace(/\.$/, '');
    return `${names} (${year}). ${title}. Journal of Generative and Applied Intelligence Research, ${volume}(${issue}), ${a.pages}. https://doi.org/${a.doi}`;
};

/** Build an MLA-9 works-cited entry. Uses "et al." after three authors
 *  per MLA guidance, wraps the article title in quotes, italicises the
 *  journal title via the leading/trailing underscore markers that most
 *  MLA cheat-sheets show, and closes with a stable DOI URL. */
const mlaCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const authors = a.authorList ?? [{ name: a.authors }];
    // MLA formats the first author as "Last, First" and the rest as "First Last".
    const flip = (name: string): string => {
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return name;
        const last = parts.pop() as string;
        return `${last}, ${parts.join(' ')}`;
    };
    let names: string;
    if (authors.length === 0) {
        names = '';
    } else if (authors.length === 1) {
        names = flip(authors[0].name);
    } else if (authors.length <= 3) {
        const first = flip(authors[0].name);
        const rest = authors.slice(1).map((au) => au.name).join(', and ');
        names = `${first}, and ${rest}`;
    } else {
        names = `${flip(authors[0].name)}, et al.`;
    }
    const title = a.title.replace(/\.$/, '');
    return `${names}. "${title}." _Journal of Generative and Applied Intelligence Research_, vol. ${volume}, no. ${issue}, ${year}, pp. ${a.pages}, https://doi.org/${a.doi}.`;
};

const bibtexCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const key = `jgair${year}_${a.id}`;
    const names = (a.authorList ?? [{ name: a.authors }]).map((au) => au.name).join(' and ');
    return `@article{${key},
  title   = {${a.title}},
  author  = {${names}},
  journal = {Journal of Generative and Applied Intelligence Research},
  volume  = {${volume}},
  number  = {${issue}},
  pages   = {${a.pages}},
  year    = {${year}},
  doi     = {${a.doi}}
}`;
};

const risCitation = (a: ArticleEntry, volume: number, issue: number, year: number): string => {
    const authorLines = (a.authorList ?? [{ name: a.authors }])
        .map((au) => `AU  - ${au.name}`)
        .join('\n');
    return `TY  - JOUR
${authorLines}
TI  - ${a.title}
JO  - Journal of Generative and Applied Intelligence Research
VL  - ${volume}
IS  - ${issue}
SP  - ${a.pages.split('–')[0] ?? ''}
EP  - ${a.pages.split('–')[1] ?? ''}
PY  - ${year}
DO  - ${a.doi}
ER  - `;
};

/* ══════════════════════════════════════════════════════
 *   Sub-components
 * ══════════════════════════════════════════════════════ */

const StatTile: React.FC<{ label: string; value: string | number; icon: string; accent: string }> = ({
    label,
    value,
    icon,
    accent,
}) => (
    <div className={`rounded-xl border p-3 ${accent}`}>
        <div className="flex items-center justify-between">
            <span className="text-lg">{icon}</span>
            <span className="text-xl font-extrabold">{value}</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">{label}</p>
    </div>
);

const AuthorChip: React.FC<{ author: Author; index: number }> = ({ author, index }) => (
    <span className="inline-flex items-center gap-1">
        <span className="text-gray-800 font-semibold">{author.name}</span>
        <sup className="text-brand-600 font-bold text-[11px]">{index + 1}</sup>
        {author.corresponding && (
            <sup className="text-emerald-600 font-bold text-[11px]" title="Corresponding author">
                ✉
            </sup>
        )}
    </span>
);

const AuthorCard: React.FC<{ author: Author; index: number }> = ({ author, index }) => (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 hover:border-brand-200 transition">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 shadow-md shadow-brand-500/30">
            {initialsOf(author.name)}
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-900">
                    <sup className="text-brand-600 font-extrabold text-[10px] mr-0.5">{index + 1}</sup>
                    {author.name}
                </p>
                {author.corresponding && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Corresponding
                    </span>
                )}
            </div>
            {author.affiliation && (
                <p className="text-xs text-gray-500 leading-snug mt-0.5">{author.affiliation}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px]">
                {author.orcid && (
                    <a
                        href={`https://orcid.org/${author.orcid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold no-underline"
                    >
                        <span className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[8px] font-extrabold">
                            iD
                        </span>
                        {author.orcid}
                    </a>
                )}
                {author.email && author.corresponding && (
                    <a
                        href={`mailto:${author.email}`}
                        className="text-brand-700 hover:text-brand-900 font-semibold no-underline"
                    >
                        ✉ {author.email}
                    </a>
                )}
            </div>
        </div>
    </div>
);

const Timeline: React.FC<{
    received?: string;
    revised?: string;
    accepted?: string;
    published?: string;
}> = ({ received, revised, accepted, published }) => {
    const steps = [
        { label: 'Received', date: received, color: 'from-sky-400 to-sky-600' },
        { label: 'Revised', date: revised, color: 'from-amber-400 to-amber-600' },
        { label: 'Accepted', date: accepted, color: 'from-emerald-400 to-emerald-600' },
        { label: 'Published', date: published, color: 'from-brand-500 to-brand-700' },
    ].filter((s) => s.date);

    if (steps.length === 0) return null;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((s) => (
                <div
                    key={s.label}
                    className="relative bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-3"
                >
                    <div
                        className={`inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br ${s.color} mb-2 shadow`}
                    />
                    <p className="text-[10px] font-extrabold text-brand-100 uppercase tracking-widest">
                        {s.label}
                    </p>
                    <p className="text-sm font-bold text-white mt-0.5">{fmtDate(s.date)}</p>
                </div>
            ))}
        </div>
    );
};

const FigureBlock: React.FC<{ figure: ArticleFigure }> = ({ figure }) => (
    <figure className="my-8">
        {figure.image && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-md">
                <img
                    src={figure.image}
                    alt={figure.caption}
                    loading="lazy"
                    className="w-full h-64 sm:h-80 object-cover"
                />
            </div>
        )}
        <figcaption className="mt-3 text-xs text-gray-500 italic leading-relaxed">
            {figure.caption}
        </figcaption>
    </figure>
);

const TableBlock: React.FC<{ table: ArticleTable }> = ({ table }) => (
    <div className="my-8">
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="min-w-full text-sm">
                <thead className="bg-gradient-to-r from-brand-50 to-white border-b border-gray-200">
                    <tr>
                        {table.headers.map((h) => (
                            <th
                                key={h}
                                className="px-4 py-3 text-left text-[11px] font-extrabold text-brand-800 uppercase tracking-wider"
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {table.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-gray-50 transition">
                            {row.map((cell, ci) => (
                                <td key={ci} className="px-4 py-3 text-gray-700">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <p className="mt-3 text-xs text-gray-500 italic leading-relaxed">{table.caption}</p>
    </div>
);

const ContentSection: React.FC<{
    section: ArticleContentSection;
    figures: Record<string, ArticleFigure>;
    tables: Record<string, ArticleTable>;
}> = ({ section, figures, tables }) => (
    <section className="mt-10">
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight border-b border-gray-100 pb-2">
            {section.heading}
        </h2>
        <div className="mt-4 space-y-4 text-[15px] text-gray-700 leading-relaxed">
            {section.body.split('\n\n').map((p, idx) => (
                <p key={idx}>{p}</p>
            ))}
        </div>
        {section.figureRefs?.map((id) => {
            const fig = figures[id];
            return fig ? <FigureBlock key={id} figure={fig} /> : null;
        })}
        {section.tableRefs?.map((id) => {
            const t = tables[id];
            return t ? <TableBlock key={id} table={t} /> : null;
        })}
    </section>
);

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
    const [tab, setTab] = useState<'apa' | 'mla' | 'bibtex' | 'ris'>('apa');
    const [copied, setCopied] = useState(false);
    const value = useMemo(() => {
        if (tab === 'apa') return apaCitation(article, volume, issue, year);
        if (tab === 'mla') return mlaCitation(article, volume, issue, year);
        if (tab === 'bibtex') return bibtexCitation(article, volume, issue, year);
        return risCitation(article, volume, issue, year);
    }, [tab, article, volume, issue, year]);

    const copy = () => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-brand-50 to-white">
                    <div>
                        <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">
                            Cite this article
                        </p>
                        <h3 className="text-lg font-extrabold text-gray-900 mt-0.5">Export citation</h3>
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
                        {(['apa', 'mla', 'bibtex', 'ris'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition uppercase tracking-wider ${
                                    tab === t
                                        ? 'bg-white text-brand-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {t === 'apa' ? 'APA 7' : t === 'mla' ? 'MLA 9' : t === 'bibtex' ? 'BibTeX' : 'RIS'}
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
                            onClick={copy}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg transition"
                        >
                            {copied ? '✓ Copied' : '📋 Copy to clipboard'}
                        </button>
                        <p className="text-xs text-gray-500">
                            All formats include DOI, page range, and full author list.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════
 *   Main page
 * ══════════════════════════════════════════════════════ */

const ArticlePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const numericId = Number(id);
    const found = Number.isFinite(numericId) ? findArticleById(numericId) : null;
    const [showCite, setShowCite] = useState(false);
    const [fetchedRefs, setFetchedRefs] = useState<ArticleReference[]>([]);
    const [linkCopied, setLinkCopied] = useState(false);
    const [citedBy, setCitedBy] = useState<CitedByResponse | null>(null);
    const [citedByLoading, setCitedByLoading] = useState(false);
    // AI-recommended related articles. Powered by /ai/recommendations/{id}.
    // Errors and empty payloads collapse to a silent no-op — the reader
    // never sees a broken widget for a page that otherwise renders fine.
    const [aiRelated, setAiRelated] = useState<RelatedArticle[]>([]);
    // Live per-article stats fetched from /article-stats/{id}. ``null``
    // means "not loaded yet OR the endpoint returned nothing usable" —
    // both cases hide the strip cleanly. The ref below stops the view
    // POST from firing twice under React StrictMode's dev double-mount.
    const [liveStats, setLiveStats] = useState<ArticleStats | null>(null);
    const viewTrackedFor = useRef<number | null>(null);

    useEffect(() => {
        if (!Number.isFinite(numericId)) return;
        let cancelled = false;
        fetchReferences(numericId)
            .then((data) => {
                if (!cancelled) setFetchedRefs(data);
            })
            .catch(() => {
                // Silent — a missing backend reference set just leaves the
                // section empty (or falls back to the mock refs above).
                if (!cancelled) setFetchedRefs([]);
            });
        return () => {
            cancelled = true;
        };
    }, [numericId]);

    useEffect(() => {
        if (!Number.isFinite(numericId)) return;
        let cancelled = false;
        getAIRecommendations(numericId)
            .then((data) => {
                if (cancelled) return;
                const rows = Array.isArray(data?.related) ? data.related : [];
                setAiRelated(rows.slice(0, 5));
            })
            .catch(() => {
                // Silent — a missing AI backend or an unindexed article
                // just collapses the section to nothing.
                if (!cancelled) setAiRelated([]);
            });
        return () => {
            cancelled = true;
        };
    }, [numericId]);

    useEffect(() => {
        if (!Number.isFinite(numericId)) return;
        let cancelled = false;
        setCitedByLoading(true);
        fetchCitedBy(numericId)
            .then((data) => {
                if (!cancelled) setCitedBy(data);
            })
            .catch(() => {
                // Any failure — DOI unregistered, Crossref rate-limit, network
                // — collapses to a zero-count empty state below.
                if (!cancelled) setCitedBy({ count: 0, citing: [] });
            })
            .finally(() => {
                if (!cancelled) setCitedByLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [numericId]);

    // Fire ``trackView`` exactly once per numeric id. The ``viewTrackedFor``
    // ref survives React 18 StrictMode's dev double-mount (which would
    // otherwise send two POSTs before the second was deduped
    // server-side). Any subsequent navigation to a different article
    // resets the guard by comparing against the new id.
    useEffect(() => {
        if (!Number.isFinite(numericId)) return;
        if (viewTrackedFor.current === numericId) return;
        viewTrackedFor.current = numericId;
        trackView(numericId).catch(() => {
            // Silent — analytics never breaks the reader's view.
        });
    }, [numericId]);

    // Fetch aggregate stats for the header strip. A ``null`` result
    // hides the strip cleanly (see render below).
    useEffect(() => {
        if (!Number.isFinite(numericId)) return;
        let cancelled = false;
        getStats(numericId)
            .then((data) => {
                if (!cancelled) setLiveStats(data);
            })
            .catch(() => {
                if (!cancelled) setLiveStats(null);
            });
        return () => {
            cancelled = true;
        };
    }, [numericId]);

    if (!found) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 flex items-center justify-center py-24">
                    <div className="text-center max-w-md px-4">
                        <span className="text-5xl block mb-4">📄</span>
                        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Article not found</h1>
                        <p className="text-sm text-gray-500 mb-6">
                            We couldn&apos;t find article #{id}. It may have been renumbered or removed.
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

    const { article, volume, issue } = found;
    const authors = article.authorList ?? [{ name: article.authors }];
    const corresponding = authors.find((a) => a.corresponding);
    const uniqueAffiliations = Array.from(
        new Set(authors.map((a) => a.affiliation).filter(Boolean) as string[]),
    );
    const figuresMap = Object.fromEntries((article.figures ?? []).map((f) => [f.id, f]));
    const tablesMap = Object.fromEntries((article.tables ?? []).map((t) => [t.id, t]));
    const related = getRelatedArticles(article, 3);
    const catColor = categoryColor[article.category] ?? 'bg-gray-100 text-gray-700';

    const seoDescription = (article.abstract ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const seoAuthors = authors.map((a) => a.name);
    const seoPublished = article.publishedDate ?? issue.publishedDate;
    const seoCanonical =
        typeof window !== 'undefined' ? `${window.location.origin}/articles/${article.id}` : undefined;
    const scholarlyArticleSchema = {
        '@context': 'https://schema.org',
        '@type': 'ScholarlyArticle',
        headline: article.title,
        author: seoAuthors.map((name) => ({ '@type': 'Person', name })),
        datePublished: seoPublished,
        isPartOf: {
            '@type': 'PublicationIssue',
            issueNumber: issue.number,
            datePublished: issue.publishedDate,
            isPartOf: {
                '@type': 'PublicationVolume',
                volumeNumber: volume.volume,
                isPartOf: {
                    '@type': 'Periodical',
                    name: 'Journal of Generative and Applied Intelligence Research',
                    issn: undefined,
                },
            },
        },
        identifier: article.doi ? `doi:${article.doi}` : undefined,
        url: seoCanonical,
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={`${article.title} — JGAIR`}
                description={seoDescription || undefined}
                canonical={seoCanonical}
                type="article"
                authors={seoAuthors}
                publishedTime={seoPublished}
                keywords={article.keywords}
                doi={article.doi}
                schema={scholarlyArticleSchema}
            />
            <Header />

            {/* ── Breadcrumb ─────────────────────────────── */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-xs text-gray-500">
                    <Link to="/" className="hover:text-brand-700 no-underline text-gray-500">
                        Home
                    </Link>
                    <span className="mx-2">›</span>
                    <Link to="/issues" className="hover:text-brand-700 no-underline text-gray-500">
                        Issues &amp; Archives
                    </Link>
                    <span className="mx-2">›</span>
                    <Link
                        to={`/issues/${volume.volume}/${issue.number}`}
                        className="hover:text-brand-700 no-underline text-gray-500"
                    >
                        Vol {volume.volume}, Issue {issue.number}
                    </Link>
                    <span className="mx-2">›</span>
                    <span className="text-gray-700 font-semibold">Article #{article.id}</span>
                </div>
            </div>

            <main className="flex-1">
                {/* ── Hero ─────────────────────────────── */}
                <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-950 to-gray-900 text-white">
                    <div className="absolute inset-0 pointer-events-none opacity-25" aria-hidden="true">
                        <div className="absolute -top-24 -right-24 w-[36rem] h-[36rem] bg-brand-500 rounded-full blur-3xl" />
                        <div className="absolute -bottom-24 -left-24 w-[36rem] h-[36rem] bg-emerald-500 rounded-full blur-3xl" />
                    </div>

                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
                        {/* Meta chips */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`px-3 py-1 rounded-full font-bold ${catColor}`}>
                                {article.category}
                            </span>
                            {article.openAccess && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-full font-bold">
                                    🔓 Open Access
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 border border-white/20 rounded-full font-semibold">
                                Vol {volume.volume} · Issue {issue.number} · {issue.month} {volume.year}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 border border-white/20 rounded-full font-semibold">
                                pp. {article.pages}
                            </span>
                        </div>

                        {/* Post-publication notices (spec §29, §30) — a
                            retraction / correction / expression of concern
                            must be shown prominently and never suppress
                            the original article. Renders nothing when
                            the article carries no notices. */}
                        <div className="mt-6 max-w-4xl">
                            <ArticleNoticesBanner articleId={Number(article.id)} />
                        </div>

                        {/* Title */}
                        <h1 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight max-w-4xl">
                            {article.title}
                        </h1>

                        {/* Live stats strip — hides cleanly when the
                            endpoint is unreachable, and shows a small
                            placeholder while the first fetch is in
                            flight. Rendered under the title so it sits
                            alongside the byline, not the meta chips. */}
                        {liveStats === null ? (
                            <p
                                className="mt-3 text-xs text-brand-100/70 font-semibold"
                                aria-live="polite"
                            >
                                Loading stats…
                            </p>
                        ) : (
                            <p
                                className="mt-3 text-xs text-brand-100 font-semibold flex flex-wrap items-center gap-x-3 gap-y-1"
                                aria-label="Article stats"
                            >
                                <span>
                                    <span aria-hidden="true">👁 </span>
                                    {liveStats.views.toLocaleString()} view
                                    {liveStats.views === 1 ? '' : 's'}
                                </span>
                                <span className="text-brand-300" aria-hidden="true">
                                    ·
                                </span>
                                <span>
                                    <span aria-hidden="true">⬇ </span>
                                    {liveStats.downloads.toLocaleString()} download
                                    {liveStats.downloads === 1 ? '' : 's'}
                                </span>
                            </p>
                        )}

                        {/* Byline */}
                        <div className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-base">
                            {authors.map((a, i) => (
                                <AuthorChip key={a.name + i} author={a} index={i} />
                            ))}
                        </div>

                        {/* Affiliations */}
                        {uniqueAffiliations.length > 0 && (
                            <div className="mt-3 text-xs text-brand-100 space-y-0.5 max-w-3xl">
                                {authors.map((a, i) =>
                                    a.affiliation ? (
                                        <p key={i}>
                                            <sup className="font-bold text-brand-300">{i + 1}</sup>{' '}
                                            {a.affiliation}
                                        </p>
                                    ) : null,
                                )}
                            </div>
                        )}

                        {/* Corresponding */}
                        {corresponding && (
                            <p className="mt-3 text-xs text-brand-100">
                                <span className="font-bold text-emerald-300">✉ Corresponding author:</span>{' '}
                                {corresponding.name}
                                {corresponding.email && (
                                    <>
                                        {' '}
                                        (
                                        <a
                                            href={`mailto:${corresponding.email}`}
                                            className="underline text-emerald-200"
                                        >
                                            {corresponding.email}
                                        </a>
                                        )
                                    </>
                                )}
                            </p>
                        )}

                        {/* Timeline */}
                        <div className="mt-8">
                            <Timeline
                                received={article.receivedDate}
                                revised={article.revisedDate}
                                accepted={article.acceptedDate}
                                published={article.publishedDate ?? issue.publishedDate}
                            />
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex flex-wrap gap-3">
                            {/* Download PDF — fires trackDownload before the
                                browser starts fetching the PDF so the counter
                                still ticks even if the reader immediately
                                closes the resulting tab. Falls back to the
                                generated-PDF endpoint when the article has
                                no explicit ``pdfUrl`` in the CMS payload. */}
                            <a
                                href={article.pdfUrl ?? `/articles/${article.id}/generated.pdf`}
                                target={article.pdfUrl ? undefined : '_blank'}
                                rel={article.pdfUrl ? undefined : 'noopener noreferrer'}
                                onClick={() => {
                                    trackDownload(article.id).catch(() => {
                                        // Silent — never block the download on
                                        // an analytics failure.
                                    });
                                    // Optimistic local bump so the strip
                                    // updates instantly. The server-side
                                    // dedup makes this safe against
                                    // over-counting on a rapid re-click.
                                    setLiveStats((prev) =>
                                        prev ? { ...prev, downloads: prev.downloads + 1 } : prev,
                                    );
                                }}
                                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-brand-800 text-sm font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline"
                            >
                                📥 Download PDF
                            </a>
                            <a
                                href={`/articles/${article.id}/html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition no-underline"
                            >
                                🌐 View HTML
                            </a>
                            <button
                                onClick={() => setShowCite(true)}
                                className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition"
                            >
                                📝 Cite
                            </button>
                            <button
                                onClick={() => {
                                    if (navigator.share) {
                                        navigator
                                            .share({ title: article.title, url: window.location.href })
                                            .catch(() => {});
                                    } else {
                                        navigator.clipboard.writeText(window.location.href);
                                    }
                                }}
                                className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition"
                            >
                                🔗 Share
                            </button>
                        </div>

                        {/* DOI strip */}
                        <p className="mt-6 text-xs text-brand-200 font-mono">
                            DOI:{' '}
                            <a
                                href={`https://doi.org/${article.doi}`}
                                className="text-emerald-300 hover:text-emerald-200 underline"
                            >
                                https://doi.org/{article.doi}
                            </a>
                        </p>

                        {/* Preprint badge — surfaced when the platform Article
                            record carries a ``preprint_doi`` (or an explicit
                            ``preprint_url`` override). The mock CMS
                            ``ArticleEntry`` type does not declare these
                            fields, so we read them off a runtime-widened
                            view — the block collapses cleanly when neither
                            is present. Indigo + emerald pill palette to keep
                            it distinct from the primary DOI link. */}
                        {(() => {
                            const preprint = article as ArticleEntry & {
                                preprint_doi?: string | null;
                                preprint_url?: string | null;
                            };
                            const href = preprint.preprint_url
                                || (preprint.preprint_doi
                                    ? `https://doi.org/${preprint.preprint_doi}`
                                    : null);
                            if (!href) return null;
                            return (
                                <div className="mt-3">
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 border border-indigo-300/50 text-indigo-100 hover:bg-emerald-500/25 hover:border-emerald-300/60 hover:text-emerald-100 transition no-underline"
                                        title="Open the preprint version"
                                    >
                                        <span aria-hidden="true">🔗</span>
                                        <span className="uppercase tracking-widest text-[10px]">
                                            Preprint
                                        </span>
                                        {preprint.preprint_doi && (
                                            <span className="font-mono normal-case tracking-normal opacity-90">
                                                {preprint.preprint_doi}
                                            </span>
                                        )}
                                    </a>
                                </div>
                            );
                        })()}
                    </div>
                </section>

                {/* ── Body: content + sidebar ────────────── */}
                <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid lg:grid-cols-3 gap-10">
                    {/* Main column */}
                    <div className="lg:col-span-2 min-w-0">
                        {/* Abstract */}
                        {article.abstract && (
                            <div className="relative bg-gradient-to-br from-brand-50 via-white to-brand-50/50 rounded-3xl border border-brand-100 p-6 sm:p-8 shadow-sm">
                                <div className="absolute -top-3 left-6 bg-brand-600 text-white text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full shadow">
                                    Abstract
                                </div>
                                <p className="text-[15px] text-gray-700 leading-relaxed">
                                    {article.abstract}
                                </p>
                            </div>
                        )}

                        {/* Keywords */}
                        {article.keywords && article.keywords.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                    Keywords
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {article.keywords.map((k) => (
                                        <span
                                            key={k}
                                            className="px-3 py-1 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-full hover:border-brand-300 hover:text-brand-700 transition"
                                        >
                                            {k}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Full content */}
                        {article.fullContent && article.fullContent.length > 0 ? (
                            article.fullContent.map((s, idx) => (
                                <ContentSection
                                    key={idx}
                                    section={s}
                                    figures={figuresMap}
                                    tables={tablesMap}
                                />
                            ))
                        ) : (
                            <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
                                <span className="text-3xl block mb-3">📄</span>
                                <h3 className="text-sm font-bold text-gray-900">Full text available in the PDF</h3>
                                <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                                    The complete manuscript — figures, tables, and references — is available as a
                                    downloadable PDF from the actions above.
                                </p>
                            </div>
                        )}

                        {/* Standalone figures (if any not attached to a section) */}
                        {article.fullContent === undefined &&
                            article.figures?.map((f) => <FigureBlock key={f.id} figure={f} />)}
                        {article.fullContent === undefined &&
                            article.tables?.map((t) => <TableBlock key={t.id} table={t} />)}

                        {/* References */}
                        {article.references && article.references.length > 0 && (
                            <section className="mt-12">
                                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight border-b border-gray-100 pb-2">
                                    References
                                </h2>
                                <ol className="mt-4 space-y-3">
                                    {article.references.map((r) => (
                                        <li
                                            key={r.id}
                                            className="flex gap-3 text-sm text-gray-700 leading-relaxed group"
                                        >
                                            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 text-brand-700 text-xs font-extrabold flex items-center justify-center group-hover:bg-brand-100 transition">
                                                {r.id}
                                            </span>
                                            <div className="min-w-0">
                                                <p>{r.text}</p>
                                                {r.doi && (
                                                    <a
                                                        href={`https://doi.org/${r.doi}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-brand-600 hover:text-brand-800 font-semibold no-underline mt-1 inline-block font-mono"
                                                    >
                                                        doi.org/{r.doi}
                                                    </a>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}

                        {/* References — from the platform CMS */}
                        {fetchedRefs.length > 0 && (
                            <section className="mt-12" aria-labelledby="platform-references">
                                <h2
                                    id="platform-references"
                                    className="text-xl font-extrabold text-gray-900 tracking-tight border-b border-gray-100 pb-2"
                                >
                                    References
                                </h2>
                                <ol className="mt-4 space-y-3 list-decimal list-inside">
                                    {fetchedRefs.map((r) => (
                                        <li
                                            key={r.id}
                                            className="text-sm text-gray-700 leading-relaxed pl-1"
                                            value={r.sequence}
                                        >
                                            <span className="text-gray-800">{r.text}</span>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
                                                {r.doi && (
                                                    <a
                                                        href={`https://doi.org/${r.doi}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-brand-600 hover:text-brand-800 font-semibold no-underline"
                                                    >
                                                        doi.org/{r.doi}
                                                    </a>
                                                )}
                                                {r.url && (
                                                    <a
                                                        href={r.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-emerald-700 hover:text-emerald-900 font-semibold no-underline break-all"
                                                    >
                                                        {r.url}
                                                    </a>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}

                        {/* Related articles — from the AI recommender.
                            Rendered inline after References so a reader who
                            finished the piece has the next-hop suggestions
                            in context. On an error or empty payload the
                            block collapses entirely (no error surface). */}
                        {aiRelated.length > 0 && (
                            <section className="mt-12" aria-labelledby="ai-related">
                                <h2
                                    id="ai-related"
                                    className="text-xl font-extrabold text-gray-900 tracking-tight border-b border-gray-100 pb-2"
                                >
                                    Related Articles
                                </h2>
                                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                    {aiRelated.map((r) => {
                                        const pct = Math.round(
                                            Math.max(0, Math.min(1, r.similarity || 0)) * 100,
                                        );
                                        return (
                                            <li key={r.article_id}>
                                                <Link
                                                    to={`/articles/${r.article_id}`}
                                                    className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4 hover:border-brand-200 hover:shadow-sm transition no-underline group"
                                                >
                                                    <span className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-brand-700 transition min-w-0">
                                                        {r.title}
                                                    </span>
                                                    <span
                                                        className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-100"
                                                        title="Similarity score"
                                                    >
                                                        {pct}%
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

                        {/* Cited by — real Crossref + OpenCitations lookup */}
                        <section className="mt-12" aria-labelledby="cited-by">
                            <h2
                                id="cited-by"
                                className="text-xl font-extrabold text-gray-900 tracking-tight border-b border-gray-100 pb-2"
                            >
                                Cited by
                            </h2>

                            {/* Counter tile — always rendered so the section has a
                                stable footprint (0 while loading, 0 for uncited). */}
                            <div className="mt-4 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50/60 p-6 shadow-sm">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md shadow-brand-500/30 flex-shrink-0">
                                        <span className="text-2xl">📚</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-extrabold text-brand-700 uppercase tracking-widest">
                                            Citations
                                        </p>
                                        <p className="text-3xl font-extrabold text-gray-900 leading-none mt-1">
                                            Cited by {citedByLoading ? '…' : citedBy?.count ?? 0}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Source: Crossref{citedBy?.citing && citedBy.citing.length > 0
                                                ? ' + OpenCitations'
                                                : ''}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* List of citing works, when any were returned. */}
                            {citedBy && citedBy.citing.length > 0 ? (
                                <ol className="mt-4 space-y-3">
                                    {citedBy.citing.map((w, idx) => (
                                        <li
                                            key={`${w.doi}-${idx}`}
                                            className="flex gap-3 text-sm text-gray-700 leading-relaxed group rounded-xl border border-gray-100 bg-white p-3 hover:border-brand-200 transition"
                                        >
                                            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 text-brand-700 text-xs font-extrabold flex items-center justify-center">
                                                {idx + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-900 truncate">
                                                    {w.title || w.doi}
                                                    {w.year ? (
                                                        <span className="ml-2 text-xs font-normal text-gray-500">
                                                            ({w.year})
                                                        </span>
                                                    ) : null}
                                                </p>
                                                <a
                                                    href={`https://doi.org/${w.doi}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-brand-600 hover:text-brand-800 font-semibold no-underline mt-1 inline-block font-mono break-all"
                                                >
                                                    doi.org/{w.doi}
                                                </a>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            ) : !citedByLoading ? (
                                <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
                                    <p className="text-sm text-gray-500">
                                        Not yet cited — check back later.
                                    </p>
                                </div>
                            ) : null}
                        </section>
                    </div>

                    {/* Sidebar */}
                    <aside className="lg:col-span-1">
                        <div className="lg:sticky lg:top-24 space-y-6">
                            {/* Metrics */}
                            {article.metrics && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                        Article metrics
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        <StatTile
                                            icon="👁️"
                                            label="Views"
                                            value={article.metrics.views.toLocaleString()}
                                            accent="bg-sky-50 border-sky-100 text-sky-800"
                                        />
                                        <StatTile
                                            icon="📥"
                                            label="Downloads"
                                            value={article.metrics.downloads.toLocaleString()}
                                            accent="bg-emerald-50 border-emerald-100 text-emerald-800"
                                        />
                                        <StatTile
                                            icon="📚"
                                            label="Citations"
                                            value={article.metrics.citations}
                                            accent="bg-brand-50 border-brand-100 text-brand-800"
                                        />
                                        <StatTile
                                            icon="📊"
                                            label="Altmetric"
                                            value={article.metrics.altmetric ?? '—'}
                                            accent="bg-amber-50 border-amber-100 text-amber-800"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Citation info */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                    Citation
                                </h3>
                                <p className="text-xs text-gray-700 leading-relaxed">
                                    {apaCitation(article, volume.volume, issue.number, volume.year)}
                                </p>
                                <button
                                    onClick={() => setShowCite(true)}
                                    className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg transition"
                                >
                                    Export citation →
                                </button>
                            </div>

                            {/* Share / Email */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                    Share this article
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard
                                                .writeText(window.location.href)
                                                .then(() => {
                                                    setLinkCopied(true);
                                                    setTimeout(() => setLinkCopied(false), 1500);
                                                })
                                                .catch(() => {});
                                        }}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-100 text-brand-800 text-xs font-bold rounded-lg transition"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                        </svg>
                                        {linkCopied ? 'Copied!' : 'Copy link'}
                                    </button>
                                    <a
                                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                                            typeof window !== 'undefined' ? window.location.href : '',
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-100 text-brand-800 text-xs font-bold rounded-lg transition no-underline"
                                    >
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                        </svg>
                                        Share via LinkedIn
                                    </a>
                                    <a
                                        href={`mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(
                                            `You may find this article of interest — ${article.title}\n\n${
                                                typeof window !== 'undefined' ? window.location.href : ''
                                            }`,
                                        )}`}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-100 text-brand-800 text-xs font-bold rounded-lg transition no-underline"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                        </svg>
                                        Email article
                                    </a>
                                </div>
                            </div>

                            {/* Author info */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                    Authors &amp; affiliations
                                </h3>
                                <div className="space-y-3">
                                    {authors.map((a, i) => (
                                        <AuthorCard key={a.name + i} author={a} index={i} />
                                    ))}
                                </div>
                            </div>

                            {/* Supplementary */}
                            {article.supplementary && article.supplementary.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                                        Supplementary files
                                    </h3>
                                    <ul className="space-y-2">
                                        {article.supplementary.map((s) => (
                                            <li key={s.label}>
                                                <a
                                                    href={s.url ?? '#'}
                                                    className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 hover:border-brand-200 hover:bg-brand-50/40 transition no-underline group"
                                                >
                                                    <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-[10px] font-extrabold flex-shrink-0">
                                                        {s.format}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-gray-900 leading-snug group-hover:text-brand-700 transition">
                                                            {s.label}
                                                        </p>
                                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                                            {s.format} · {s.size}
                                                        </p>
                                                    </div>
                                                    <span className="text-brand-600 text-lg group-hover:translate-x-0.5 transition">
                                                        ↓
                                                    </span>
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Licence */}
                            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl border border-emerald-200 p-5">
                                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">
                                    Licence
                                </h3>
                                <p className="text-sm font-bold text-gray-900">CC BY 4.0</p>
                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                    Published under an open licence — free to share and adapt with attribution.
                                </p>
                                <a
                                    href="https://creativecommons.org/licenses/by/4.0/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-block text-xs text-emerald-700 hover:text-emerald-900 font-semibold no-underline"
                                >
                                    View licence →
                                </a>
                            </div>
                        </div>
                    </aside>
                </section>

                {/* ── Related articles ───────────────────── */}
                {related.length > 0 && (
                    <section className="py-14 bg-gradient-to-b from-white to-gray-50 border-t border-gray-100">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="flex items-baseline justify-between mb-6">
                                <div>
                                    <span className="text-brand-600 text-xs font-bold uppercase tracking-widest">
                                        Discover more
                                    </span>
                                    <h2 className="text-2xl font-extrabold text-gray-900 mt-1 tracking-tight">
                                        Related articles
                                    </h2>
                                </div>
                                <Link
                                    to={`/issues/${volume.volume}/${issue.number}`}
                                    className="text-sm text-brand-700 hover:text-brand-900 font-semibold no-underline"
                                >
                                    View full issue →
                                </Link>
                            </div>
                            <div className="grid md:grid-cols-3 gap-5">
                                {related.map(({ article: r, volume: rv, issue: ri }) => (
                                    <Link
                                        key={r.id}
                                        to={`/articles/${r.id}`}
                                        className="group bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 no-underline overflow-hidden"
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    categoryColor[r.category] ??
                                                    'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {r.category}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-semibold">
                                                Vol {rv.volume}, Issue {ri.number}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-brand-700 transition leading-snug">
                                            {r.title}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                            {r.authors}
                                        </p>
                                        {r.metrics && (
                                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-400 font-semibold">
                                                <span>👁 {r.metrics.views.toLocaleString()}</span>
                                                <span>📥 {r.metrics.downloads.toLocaleString()}</span>
                                                <span>📚 {r.metrics.citations}</span>
                                            </div>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </section>
                )}
            </main>

            {showCite && (
                <CitationModal
                    article={article}
                    volume={volume.volume}
                    issue={issue.number}
                    year={volume.year}
                    onClose={() => setShowCite(false)}
                />
            )}

            <Footer />
        </div>
    );
};

export default ArticlePage;
