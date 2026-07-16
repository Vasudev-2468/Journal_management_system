import React, { useEffect, useState } from 'react';
import { fetchReviews as getReviews } from '../api/reviews';
import { Review } from '../types';
import ReviewPanel from '../components/reviews/ReviewPanel';

const ReviewPage: React.FC = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadReviews = async () => {
            try {
                const data = await getReviews();
                setReviews(data);
            } catch (err) {
                setError('Failed to fetch reviews');
            } finally {
                setLoading(false);
            }
        };

        loadReviews();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Reviews</h1>
            {reviews.length > 0 ? (
                reviews.map(review => (
                    <ReviewPanel key={review.id} review={review} />
                ))
            ) : (
                <div>No reviews available.</div>
            )}
        </div>
    );
};

export default ReviewPage;