import React, { useEffect, useState } from 'react';
import { fetchReviews } from '../../api/reviews';
import { Review } from '../../types';
import ReviewForm from './ReviewForm';

interface ReviewPanelProps {
    review?: Review;
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({ review }) => {
    const [reviews, setReviews] = useState<Review[]>(review ? [review] : []);
    const [loading, setLoading] = useState(!review);

    useEffect(() => {
        if (review) return;
        const loadReviews = async () => {
            try {
                const data = await fetchReviews();
                setReviews(data);
            } catch (error) {
                console.error('Error fetching reviews:', error);
            } finally {
                setLoading(false);
            }
        };

        loadReviews();
    }, [review]);

    return (
        <div className="review-panel">
            <h2 className="text-xl font-bold mb-4">Reviews</h2>
            {loading ? (
                <p>Loading reviews...</p>
            ) : (
                <ul>
                    {reviews.map((r) => (
                        <li key={r.id} className="border-b py-2">
                            {r.title && <p className="font-semibold">{r.title}</p>}
                            <p>{r.content}</p>
                        </li>
                    ))}
                </ul>
            )}
            <ReviewForm />
        </div>
    );
};

export default ReviewPanel;