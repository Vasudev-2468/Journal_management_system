import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAIRecommendations, RelatedArticle } from '../../api/ai';
import Loading from '../common/Loading';

interface RecommendationEngineProps {
    articleId: number | string;
}

const RecommendationEngine: React.FC<RecommendationEngineProps> = ({ articleId }) => {
    const [recommendations, setRecommendations] = useState<RelatedArticle[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchRecommendations = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getAIRecommendations(articleId);
                if (!cancelled) {
                    setRecommendations(data.related || []);
                }
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to fetch recommendations.';
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchRecommendations();
        return () => {
            cancelled = true;
        };
    }, [articleId]);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return (
            <div role="alert" className="text-red-600 bg-red-50 border border-red-200 rounded p-3">
                {error}
            </div>
        );
    }

    if (recommendations.length === 0) {
        return (
            <div className="text-gray-600 italic">
                No related articles yet — try again once more submissions are indexed.
            </div>
        );
    }

    return (
        <section className="recommendation-engine bg-white border border-gray-200 rounded p-4 shadow-sm">
            <h2 className="text-xl font-bold mb-3">Related Articles</h2>
            <ul className="divide-y divide-gray-200">
                {recommendations.map((rec) => (
                    <li key={rec.article_id} className="py-2">
                        <Link
                            to={`/articles/${rec.article_id}`}
                            className="text-blue-600 hover:underline"
                        >
                            {rec.title}
                        </Link>
                        <span className="ml-2 text-sm text-gray-500">
                            {Math.round(rec.similarity * 100)}% similar
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default RecommendationEngine;
