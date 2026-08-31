import client from './client';
import { Review } from '../types';

// Two review flows live behind this module:
//
// 1. Peer-review token flow (reviewer portal) — see
//    reviewerAccess / reviewerSubmit and the /reviews/access/{token},
//    /reviews/submit/{token} endpoints.
// 2. Reader-review CRUD (JG-403) at /article-reviews — a lightweight
//    rating + notes attached to a published Article by an authenticated
//    user. The `fetchReviews / fetchReviewById / createReview / update /
//    delete` API below drives this second flow.
//
// The editor per-submission endpoint remains at
// /reviews/{submission_id} and is exposed via fetchReviewsForSubmission.

const PEER_BASE = '/reviews';
const READER_BASE = '/article-reviews';

interface ReviewApiPayload {
    article_id: number;
    title: string;
    content: string;
    rating: number;
}

const toApiPayload = (data: Omit<Review, 'id'>): ReviewApiPayload => ({
    article_id: (data.articleId ?? (data as any).article_id ?? 0) as number,
    title: (data.title ?? '').toString(),
    content: data.content ?? '',
    rating: data.rating ?? 0,
});

const fromApi = (row: any): Review => ({
    id: row.id,
    articleId: row.article_id,
    reviewerId: row.reviewer_id ?? undefined,
    title: row.title,
    content: row.content,
    rating: row.rating,
});

export const fetchReviewsForSubmission = async (
    submissionId: string,
): Promise<Review[]> => {
    const response = await client.get(`${PEER_BASE}/${submissionId}`);
    return response.data;
};

export const fetchReviews = async (): Promise<Review[]> => {
    const response = await client.get(`${READER_BASE}/`);
    return (response.data as any[]).map(fromApi);
};

export const fetchReviewsForArticle = async (
    articleId: number | string,
): Promise<Review[]> => {
    const response = await client.get(`${READER_BASE}/article/${articleId}`);
    return (response.data as any[]).map(fromApi);
};

export const fetchReviewById = async (id: string | number): Promise<Review> => {
    const response = await client.get(`${READER_BASE}/${id}`);
    return fromApi(response.data);
};

export const createReview = async (
    reviewData: Omit<Review, 'id'>,
): Promise<Review> => {
    const response = await client.post(`${READER_BASE}/`, toApiPayload(reviewData));
    return fromApi(response.data);
};

export const updateReview = async (
    id: string | number,
    reviewData: Partial<Omit<Review, 'id'>>,
): Promise<Review> => {
    const body: Record<string, unknown> = {};
    if (reviewData.title !== undefined) body.title = reviewData.title;
    if (reviewData.content !== undefined) body.content = reviewData.content;
    if (reviewData.rating !== undefined) body.rating = reviewData.rating;
    const response = await client.put(`${READER_BASE}/${id}`, body);
    return fromApi(response.data);
};

export const deleteReview = async (id: string | number): Promise<void> => {
    await client.delete(`${READER_BASE}/${id}`);
};
