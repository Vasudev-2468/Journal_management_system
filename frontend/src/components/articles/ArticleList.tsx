import React, { useEffect, useMemo, useState } from 'react';
import { fetchArticles } from '../../api/articles';
import { Article } from '../../types';
import ArticleCard from './ArticleCard';
import Loading from '../common/Loading';

const PAGE_SIZE = 10;

const ArticleList: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        let cancelled = false;
        const loadArticles = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchArticles();
                if (!cancelled) setArticles(data);
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to fetch articles.';
                    setError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadArticles();
        return () => {
            cancelled = true;
        };
    }, []);

    const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
    const pageArticles = useMemo(
        () => articles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [articles, page],
    );

    if (loading) return <Loading />;

    if (error) {
        return (
            <div role="alert" className="text-red-600 bg-red-50 border border-red-200 rounded p-3">
                {error}
            </div>
        );
    }

    if (articles.length === 0) {
        return <div className="text-gray-600 italic">No articles yet.</div>;
    }

    return (
        <div>
            <div className="article-list space-y-3">
                {pageArticles.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                ))}
            </div>
            {totalPages > 1 && (
                <nav
                    aria-label="Pagination"
                    className="mt-4 flex items-center justify-between text-sm"
                >
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span>
                        Page {page} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                    >
                        Next
                    </button>
                </nav>
            )}
        </div>
    );
};

export default ArticleList;
