import React, { useState } from 'react';
import { createReview } from '../../api/reviews';

interface ReviewFormData {
    title: string;
    content: string;
    rating: number;
}

const ReviewForm: React.FC = () => {
    const [reviewData, setReviewData] = useState<ReviewFormData>({
        title: '',
        content: '',
        rating: 0,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setReviewData({
            ...reviewData,
            [name]: name === 'rating' ? Number(value) : value,
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // TODO: Add validation for reviewData
        try {
            await createReview(reviewData); // TODO: Handle success and error responses
            // TODO: Reset form or provide feedback to user
        } catch (error) {
            console.error('Error submitting review:', error); // TODO: Handle error appropriately
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow-md">
            <h2 className="text-lg font-semibold mb-4">Submit a Review</h2>
            <div className="mb-4">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">Title</label>
                <input
                    type="text"
                    name="title"
                    id="title"
                    value={reviewData.title}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                />
            </div>
            <div className="mb-4">
                <label htmlFor="content" className="block text-sm font-medium text-gray-700">Content</label>
                <textarea
                    name="content"
                    id="content"
                    value={reviewData.content}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                />
            </div>
            <div className="mb-4">
                <label htmlFor="rating" className="block text-sm font-medium text-gray-700">Rating (1-5)</label>
                <input
                    type="number"
                    name="rating"
                    id="rating"
                    value={reviewData.rating}
                    onChange={handleChange}
                    min="1"
                    max="5"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                />
            </div>
            <button type="submit" className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600">
                Submit Review
            </button>
        </form>
    );
};

export default ReviewForm;