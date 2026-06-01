import React, { useEffect, useState } from 'react';
import { fetchReviews } from '../../api/reviews';
import ReviewForm from './ReviewForm';

const ReviewPanel: React.FC = () => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                const response = await fetchReviews();
                setReviews(response.data);
            } catch (error) {
                console.error('Error fetching reviews:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReviews();
    }, []);

    return (
        <div className="review-panel">
            <h2 className="text-xl font-bold mb-4">Reviews</h2>
            {loading ? (
                <p>Loading reviews...</p>
            ) : (
                <ul>
                    {reviews.map((review) => (
                        <li key={review.id} className="border-b py-2">
                            <p className="font-semibold">{review.title}</p>
                            <p>{review.content}</p>
                        </li>
                    ))}
                </ul>
            )}
            <ReviewForm />
        </div>
    );
};

export default ReviewPanel;