import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchArticles } from '../api/articles';
import { Article } from '../types';
import Loading from '../components/common/Loading';

const AIInsightsPage: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await fetchArticles();
                if (!cancelled) setArticles(data);
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to fetch AI insights.';
                    setError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) return <Loading />;
    if (error) {
        return (
            <div role="alert" className="p-4 text-red-600">
                {error}
            </div>
        );
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">AI Insights</h1>
            {articles.length === 0 ? (
                <p className="text-gray-600 italic">
                    No articles are indexed yet — publish one to see AI insights.
                </p>
            ) : (
                <>
                    <p className="text-gray-600 mb-4">
                        Pick an article to run summary, plagiarism, and related-article insights.
                    </p>
                    <ul className="divide-y divide-gray-200">
                        {articles.map((article) => (
                            <li key={article.id} className="py-3">
                                <Link
                                    to={`/articles/${article.id}`}
                                    className="text-blue-600 hover:underline font-medium"
                                >
                                    {article.title}
                                </Link>
                                {article.abstract && (
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                        {article.abstract}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
};

export default AIInsightsPage;
