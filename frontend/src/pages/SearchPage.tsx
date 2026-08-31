import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import { searchArticles, SearchItem, SearchKind } from '../api/search';

const KIND_OPTIONS: { value: SearchKind; label: string }[] = [
    { value: 'any', label: 'Any field' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'keyword', label: 'Keyword' },
    { value: 'doi', label: 'DOI' },
];

const PAGE_SIZE = 20;

// Debounce interval on the search input. 400 ms feels responsive on
// keystrokes without hammering the endpoint mid-type.
const DEBOUNCE_MS = 400;

/**
 * Subtly render the ts_rank_cd score as a badge. Ranks are unbounded
 * positive floats; we scale to two decimals so they read as a "score"
 * on the card without dominating the layout.
 */
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => (
    <span
        title={`Relevance score: ${rank.toFixed(4)}`}
        className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide border border-brand-100"
    >
        <span aria-hidden="true">★</span>
        rank {rank.toFixed(2)}
    </span>
);

const SearchPage: React.FC = () => {
    const [params, setParams] = useSearchParams();

    // Seed state from the URL so a shared link lands on the same view.
    const initialQ = params.get('q') || '';
    const initialKind = (params.get('kind') as SearchKind) || 'any';
    const initialPage = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

    const [q, setQ] = useState(initialQ);
    const [kind, setKind] = useState<SearchKind>(initialKind);
    const [page, setPage] = useState<number>(initialPage);

    const [items, setItems] = useState<SearchItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounced echo of ``q`` — the value actually sent to the endpoint.
    const [debouncedQ, setDebouncedQ] = useState(initialQ);
    const debounceRef = useRef<number | null>(null);

    useEffect(() => {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
            setDebouncedQ(q);
        }, DEBOUNCE_MS);
        return () => {
            if (debounceRef.current !== null) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [q]);

    // A change to the query or filter resets pagination to page 1 so a
    // new search doesn't drop the reader on page 4 of the previous one.
    // We do this only when the input actually differs from the URL — an
    // in-flight ``page=2`` navigation from the pagination buttons
    // should not immediately snap back.
    useEffect(() => {
        setPage(1);
        // We deliberately depend on debouncedQ + kind here so page 1 is
        // asserted once the query settles.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQ, kind]);

    // Keep the URL in sync so results are shareable. ``replace`` avoids
    // filling the history stack while the reader types.
    useEffect(() => {
        const next = new URLSearchParams();
        if (debouncedQ) next.set('q', debouncedQ);
        if (kind && kind !== 'any') next.set('kind', kind);
        if (page > 1) next.set('page', String(page));
        setParams(next, { replace: true });
    }, [debouncedQ, kind, page, setParams]);

    // Fetch results whenever the settled query, filter, or page moves.
    useEffect(() => {
        let cancelled = false;
        const trimmed = debouncedQ.trim();
        if (!trimmed) {
            setItems([]);
            setTotal(0);
            setLoading(false);
            setError(null);
            return () => {
                cancelled = true;
            };
        }
        setLoading(true);
        setError(null);
        searchArticles({ q: trimmed, kind, page, page_size: PAGE_SIZE })
            .then((data) => {
                if (cancelled) return;
                setItems(data.items);
                setTotal(data.total);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(
                    err?.response?.data?.detail ||
                        err?.message ||
                        'Search failed. Please try again.',
                );
                setItems([]);
                setTotal(0);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [debouncedQ, kind, page]);

    const trimmedQ = debouncedQ.trim();
    const totalPages = useMemo(
        () => (total > 0 ? Math.ceil(total / PAGE_SIZE) : 0),
        [total],
    );

    const goToPage = useCallback(
        (next: number) => {
            const clamped = Math.min(Math.max(1, next), Math.max(1, totalPages));
            setPage(clamped);
            // Scroll to the top of the results list for the next page.
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [totalPages],
    );

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
                        onSubmit={(e) => {
                            e.preventDefault();
                            // Force-flush the debounce when the user hits enter.
                            setDebouncedQ(q);
                        }}
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
                    {!trimmedQ ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-4xl block mb-3">🔎</span>
                            <h3 className="text-lg font-bold text-gray-900">Start typing to search</h3>
                            <p className="mt-2 text-gray-500">
                                Results appear as you type — Postgres full-text search matches title,
                                abstract, and body.
                            </p>
                        </div>
                    ) : loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white border border-red-200 rounded-2xl p-8 text-center text-red-600">
                            {error}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-4xl block mb-3">📭</span>
                            <h3 className="text-lg font-bold text-gray-900">No matches</h3>
                            <p className="mt-2 text-gray-500">
                                Nothing found for “{trimmedQ}” in{' '}
                                {KIND_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase()}.
                                Try a broader query or the “Any field” filter.
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="mb-6 text-sm text-gray-500">
                                <span className="font-bold text-gray-800">{total.toLocaleString()}</span> result
                                {total === 1 ? '' : 's'} for “{trimmedQ}”
                                {totalPages > 1 && (
                                    <>
                                        {' '}
                                        · page{' '}
                                        <span className="font-bold text-gray-800">{page}</span> of{' '}
                                        {totalPages}
                                    </>
                                )}
                            </p>
                            <ul className="space-y-5">
                                {items.map((a) => (
                                    <li
                                        key={a.id}
                                        className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                                    >
                                        <div className="h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500" />
                                        <Link
                                            to={`/articles/${a.id}`}
                                            className="block p-6 no-underline"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <h2 className="text-xl font-extrabold text-gray-900 group-hover:text-brand-700 transition">
                                                    {a.title}
                                                </h2>
                                                <RankBadge rank={a.rank} />
                                            </div>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {a.author_display || 'Unattributed'}
                                            </p>
                                            {a.abstract_excerpt && (
                                                <p className="mt-3 text-gray-700 leading-relaxed">
                                                    {a.abstract_excerpt}
                                                </p>
                                            )}
                                            <p className="mt-4 text-sm font-bold text-brand-700 group-hover:text-brand-800">
                                                Read article →
                                            </p>
                                        </Link>
                                    </li>
                                ))}
                            </ul>

                            {totalPages > 1 && (
                                <nav
                                    aria-label="Search results pagination"
                                    className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6"
                                >
                                    <button
                                        type="button"
                                        onClick={() => goToPage(page - 1)}
                                        disabled={page <= 1}
                                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700 transition"
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-sm text-gray-500">
                                        Page{' '}
                                        <span className="font-bold text-gray-800">{page}</span> of{' '}
                                        <span className="font-bold text-gray-800">{totalPages}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => goToPage(page + 1)}
                                        disabled={page >= totalPages}
                                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700 transition"
                                    >
                                        Next →
                                    </button>
                                </nav>
                            )}
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default SearchPage;
