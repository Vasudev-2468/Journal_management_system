import axios from 'axios';
import { Review } from '../types';

const API_URL = '/api/reviews';

// TODO: Implement function to fetch all reviews
export const fetchReviews = async (): Promise<Review[]> => {
    // TODO: Add error handling
    const response = await axios.get(API_URL);
    return response.data;
};

// TODO: Implement function to fetch a single review by ID
export const fetchReviewById = async (id: string): Promise<Review> => {
    // TODO: Add error handling
    const response = await axios.get(`${API_URL}/${id}`);
    return response.data;
};

// TODO: Implement function to create a new review
export const createReview = async (reviewData: Omit<Review, 'id'>): Promise<Review> => {
    // TODO: Add error handling
    const response = await axios.post(API_URL, reviewData);
    return response.data;
};

// TODO: Implement function to update an existing review
export const updateReview = async (id: string, reviewData: Review): Promise<Review> => {
    // TODO: Add error handling
    const response = await axios.put(`${API_URL}/${id}`, reviewData);
    return response.data;
};

// TODO: Implement function to delete a review
export const deleteReview = async (id: string): Promise<void> => {
    // TODO: Add error handling
    await axios.delete(`${API_URL}/${id}`);
};