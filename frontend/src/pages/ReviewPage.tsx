import React, { useEffect, useState } from 'react';
import { fetchReviews } from '../api/reviews';
import { Review } from '../types';
import Loading from '../components/common/Loading';

const ReviewPage: React.FC = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadReviews = async () => {
            try {
                const data = await fetchReviews();
                if (!cancelled) setReviews(data);
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to fetch reviews.';
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
            <h1 className="text-2xl font-bold mb-4">Reader Reviews</h1>
            {reviews.length === 0 ? (
                <div className="text-gray-600 italic">No reviews available.</div>
            ) : (
                <ul className="divide-y divide-gray-200">
                    {reviews.map((review) => (
                        <li key={review.id} className="py-3">
                            {review.title && (
                                <p className="font-semibold">{review.title}</p>
                            )}
                            {typeof review.rating === 'number' && (
                                <p className="text-sm text-yellow-600">
                                    Rating: {review.rating}/5
                                </p>
                            )}
                            <p className="mt-1">{review.content}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ReviewPage;
