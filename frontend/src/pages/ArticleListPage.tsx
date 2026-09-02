import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { fetchArticles } from '../api/articles';
import { fetchArticleNoticeSummaries, ArticleNoticeSummary } from '../api/corrections';
import type { Article } from '../types';

// JG-fix F4 — /articles previously mounted the single-article view without an
// :id param, so every "Browse Articles" link landed on "Article not found."
// This is the list view; /articles/:id renders the detail.

const ArticleListPage: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [notices, setNotices] = useState<Record<number, ArticleNoticeSummary>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [params] = useSearchParams();
    const q = params.get('q')?.trim().toLowerCase() || '';

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchArticles()
            .then((data) => {
                if (cancelled) return;
                setArticles(data);
                // Batch-fetch retraction/correction badges. Non-fatal —
                // a failure here just leaves the badges off.
                const ids = data.map((a) => Number(a.id)).filter((n) => n > 0);
                fetchArticleNoticeSummaries(ids)
                    .then((rows) => {
                        if (cancelled) return;
                        const map: Record<number, ArticleNoticeSummary> = {};
                        for (const r of rows) map[r.article_id] = r;
                        setNotices(map);
                    })
                    .catch(() => {});
            })
            .catch((e) => {
                if (!cancelled) setError(e?.message || 'Failed to load articles');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = q
        ? articles.filter((a) => {
              const hay = `${a.title || ''} ${(a as any).abstract || ''}`.toLowerCase();
              return hay.includes(q);
          })
        : articles;

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <Header />
            <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Articles</h1>
                    <p className="mt-2 text-gray-600">
                        {q ? (
                            <>
                                Results for <span className="font-mono">“{q}”</span>
                            </>
                        ) : (
                            'Browse the published corpus.'
                        )}
                    </p>
                </div>

                {loading && <p className="text-sm text-gray-500">Loading…</p>}

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {!loading && !error && filtered.length === 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-10 text-center">
                        <p className="text-gray-600">
                            {q ? 'No articles match your search.' : 'No articles have been published yet.'}
                        </p>
                    </div>
                )}

                <ul className="divide-y divide-gray-100">
                    {filtered.map((a) => (
                        <li key={a.id} className="py-5">
                            <Link
                                to={`/articles/${a.id}`}
                                className="block group"
                            >
                                <div className="flex items-start gap-2 flex-wrap">
                                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700">
                                        {a.title || 'Untitled'}
                                    </h2>
                                    {notices[Number(a.id)]?.is_retracted && (
                                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                            ⚠️ Retracted
                                        </span>
                                    )}
                                    {!notices[Number(a.id)]?.is_retracted && (notices[Number(a.id)]?.correction_count || 0) > 0 && (
                                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                            📝 Correction
                                        </span>
                                    )}
                                    {(notices[Number(a.id)]?.expression_of_concern_count || 0) > 0 && (
                                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                                            ⚠️ EoC
                                        </span>
                                    )}
                                </div>
                                {(a as any).abstract && (
                                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                        {(a as any).abstract}
                                    </p>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            </main>
            <Footer />
        </div>
    );
};

export default ArticleListPage;
