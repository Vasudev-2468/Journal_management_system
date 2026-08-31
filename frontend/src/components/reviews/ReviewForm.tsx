import React, { useState } from 'react';
import { createReview } from '../../api/reviews';
import { Review } from '../../types';

interface ReviewFormData {
    title: string;
    content: string;
    rating: number;
}

interface ReviewFormProps {
    articleId: number;
    onCreated?: (review: Review) => void;
}

const EMPTY: ReviewFormData = { title: '', content: '', rating: 0 };

const ReviewForm: React.FC<ReviewFormProps> = ({ articleId, onCreated }) => {
    const [reviewData, setReviewData] = useState<ReviewFormData>(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const { name, value } = e.target;
        setReviewData((prev) => ({
            ...prev,
            [name]: name === 'rating' ? Number(value) : value,
        }));
    };

    const validate = (data: ReviewFormData): string | null => {
        if (!data.title.trim()) return 'Please enter a title.';
        if (data.title.trim().length < 3) return 'Title must be at least 3 characters.';
        if (!data.content.trim()) return 'Please write a review.';
        if (data.content.trim().length < 20) return 'Review must be at least 20 characters.';
        if (!Number.isFinite(data.rating) || data.rating < 1 || data.rating > 5) {
            return 'Rating must be between 1 and 5.';
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        const validationError = validate(reviewData);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        try {
            const created = await createReview({
                articleId,
                title: reviewData.title.trim(),
                content: reviewData.content.trim(),
                rating: reviewData.rating,
            });
            setReviewData(EMPTY);
            setSuccess(true);
            onCreated?.(created);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(
                typeof detail === 'string'
                    ? detail
                    : err instanceof Error
                    ? err.message
                    : 'Could not submit review. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow-md" noValidate>
            <h2 className="text-lg font-semibold mb-4">Submit a Review</h2>

            {error && (
                <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {error}
                </div>
            )}
            {success && (
                <div role="status" className="mb-3 text-green-700 bg-green-50 border border-green-200 rounded p-2">
                    Review submitted. Thank you.
                </div>
            )}

            <div className="mb-4">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    Title
                </label>
                <input
                    type="text"
                    name="title"
                    id="title"
                    value={reviewData.title}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                    minLength={3}
                />
            </div>
            <div className="mb-4">
                <label htmlFor="content" className="block text-sm font-medium text-gray-700">
                    Content
                </label>
                <textarea
                    name="content"
                    id="content"
                    value={reviewData.content}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                    minLength={20}
                    rows={5}
                />
            </div>
            <div className="mb-4">
                <label htmlFor="rating" className="block text-sm font-medium text-gray-700">
                    Rating (1-5)
                </label>
                <input
                    type="number"
                    name="rating"
                    id="rating"
                    value={reviewData.rating || ''}
                    onChange={handleChange}
                    min={1}
                    max={5}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring focus:ring-blue-500"
                    required
                />
            </div>
            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400"
            >
                {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
        </form>
    );
};

export default ReviewForm;
