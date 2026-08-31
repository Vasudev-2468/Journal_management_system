import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import { fetchArticles } from '../api/articles';
import { Article } from '../types';

type SearchKind = 'any' | 'title' | 'author' | 'keyword' | 'doi';

const KIND_OPTIONS: { value: SearchKind; label: string }[] = [
    { value: 'any', label: 'Any field' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'keyword', label: 'Keyword' },
    { value: 'doi', label: 'DOI' },
];

const excerpt = (text: string | null | undefined, maxChars = 260): string => {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length <= maxChars ? clean : clean.slice(0, maxChars).trimEnd() + '…';
};

const highlightNeedle = (haystack: string, needle: string): React.ReactNode => {
    if (!needle) return haystack;
    const lower = haystack.toLowerCase();
    const n = needle.toLowerCase();
    const idx = lower.indexOf(n);
    if (idx < 0) return haystack;
    return (
        <>
            {haystack.slice(0, idx)}
            <mark className="bg-yellow-200 text-gray-900 rounded px-0.5">{haystack.slice(idx, idx + needle.length)}</mark>
            {haystack.slice(idx + needle.length)}
        </>
    );
};

const matches = (article: Article, kind: SearchKind, q: string): boolean => {
    const needle = q.toLowerCase().trim();
    if (!needle) return true;
    const title = (article.title || '').toLowerCase();
    const abstract = (article.abstract || '').toLowerCase();
    const content = (article.content || '').toLowerCase();
    const author = (article.author_display || article.author || '').toLowerCase();

    switch (kind) {
        case 'title':
            return title.includes(needle);
        case 'author':
            return author.includes(needle);
        case 'keyword':
            return abstract.includes(needle) || content.includes(needle) || title.includes(needle);
        case 'doi':
            // No dedicated DOI field on Article — search content/abstract for the identifier
            return content.includes(needle) || abstract.includes(needle);
        case 'any':
        default:
            return (
                title.includes(needle) ||
                abstract.includes(needle) ||
                content.includes(needle) ||
                author.includes(needle)
            );
    }
};

const SearchPage: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const initialQ = params.get('q') || '';
    const initialFilter = (params.get('filter') as SearchKind) || 'any';

    const [q, setQ] = useState(initialQ);
    const [kind, setKind] = useState<SearchKind>(initialFilter);
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchArticles()
            .then((data) => {
                if (!cancelled) setArticles(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || 'Failed to load articles.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Keep the URL in sync with the current query so results are shareable.
    useEffect(() => {
        const next = new URLSearchParams();
        if (q) next.set('q', q);
        if (kind && kind !== 'any') next.set('filter', kind);
        setParams(next, { replace: true });
    }, [q, kind, setParams]);

    const results = useMemo(() => {
        const trimmed = q.trim();
        if (!trimmed) return [];
        return articles.filter((a) => matches(a, kind, trimmed));
    }, [articles, kind, q]);

    const trimmedQ = q.trim();

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={trimmedQ ? `Search — ${trimmedQ}` : 'Search'}
                description="Search articles by title, author, keyword, DOI, or across every field."
            />
            <Header />

            {/* Hero */}
            <section className="relative py-16 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                    <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-purple-500 blur-3xl" />
                </div>
                <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight text-center">
                        Search the archive
                    </h1>
                    <p className="mt-3 text-center text-brand-200">
                        Search every article by title, author, keyword, or DOI.
                    </p>

                    <form
                        onSubmit={(e) => e.preventDefault()}
                        className="mt-8 bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-3 flex flex-col md:flex-row gap-2"
                    >
                        <select
                            value={kind}
                            onChange={(e) => setKind(e.target.value as SearchKind)}
                            className="md:w-44 px-3 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-brand-400"
                        >
                            {KIND_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="search"
                            autoFocus
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search for a paper, author, or DOI…"
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-800 focus:ring-2 focus:ring-brand-400"
                        />
                        <button
                            type="submit"
                            className="px-6 py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 transition"
                        >
                            Search
                        </button>
                    </form>
                </div>
            </section>

            <main className="flex-1 py-12">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white border border-red-200 rounded-2xl p-8 text-center text-red-600">
                            {error}
                        </div>
                    ) : !trimmedQ ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-4xl block mb-3">🔎</span>
                            <h3 className="text-lg font-bold text-gray-900">Start typing to search</h3>
                            <p className="mt-2 text-gray-500">
                                We search across {articles.length.toLocaleString()} published article
                                {articles.length === 1 ? '' : 's'}.
                            </p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-4xl block mb-3">📭</span>
                            <h3 className="text-lg font-bold text-gray-900">No matches</h3>
                            <p className="mt-2 text-gray-500">
                                Nothing found for “{trimmedQ}” in {KIND_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase()}.
                                Try a broader query or the “Any field” filter.
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="mb-6 text-sm text-gray-500">
                                <span className="font-bold text-gray-800">{results.length.toLocaleString()}</span> result
                                {results.length === 1 ? '' : 's'} for “{trimmedQ}”
                            </p>
                            <ul className="space-y-5">
                                {results.map((a) => (
                                    <li
                                        key={a.id}
                                        className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                                    >
                                        <div className="h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500" />
                                        <Link
                                            to={`/articles/${a.id}`}
                                            className="block p-6 no-underline"
                                        >
                                            <h2 className="text-xl font-extrabold text-gray-900 group-hover:text-brand-700 transition">
                                                {highlightNeedle(a.title, trimmedQ)}
                                            </h2>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {a.author_display || a.author || 'Unattributed'}
                                            </p>
                                            {a.abstract && (
                                                <p className="mt-3 text-gray-700 leading-relaxed">
                                                    {highlightNeedle(excerpt(a.abstract), trimmedQ)}
                                                </p>
                                            )}
                                            <p className="mt-4 text-sm font-bold text-brand-700 group-hover:text-brand-800">
                                                Read article →
                                            </p>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default SearchPage;
