import React, { useEffect, useState } from 'react';
import { fetchReviewsForArticle } from '../../api/reviews';
import { Review } from '../../types';
import ReviewForm from './ReviewForm';
import Loading from '../common/Loading';

interface ReviewPanelProps {
    articleId: number;
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({ articleId }) => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadReviews = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchReviewsForArticle(articleId);
                if (!cancelled) setReviews(data);
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to load reviews.';
                    setError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadReviews();
        return () => {
            cancelled = true;
        };
    }, [articleId]);

    const onCreated = (created: Review) => {
        setReviews((prev) => [created, ...prev]);
    };

    return (
        <div className="review-panel space-y-6">
            <div>
                <h2 className="text-xl font-bold mb-4">Reviews</h2>
                {loading ? (
                    <Loading />
                ) : error ? (
                    <div role="alert" className="text-red-600">
                        {error}
                    </div>
                ) : reviews.length === 0 ? (
                    <p className="text-gray-600 italic">No reviews yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {reviews.map((r) => (
                            <li key={r.id} className="py-3">
                                {r.title && (
                                    <p className="font-semibold">{r.title}</p>
                                )}
                                {typeof r.rating === 'number' && (
                                    <p className="text-sm text-yellow-600">
                                        Rating: {r.rating}/5
                                    </p>
                                )}
                                <p className="mt-1">{r.content}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <ReviewForm articleId={articleId} onCreated={onCreated} />
        </div>
    );
};

export default ReviewPanel;
