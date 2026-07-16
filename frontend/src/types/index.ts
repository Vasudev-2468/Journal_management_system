// This file defines TypeScript types used throughout the frontend.

// TODO: Define user-related types
export interface User {
    id: number;
    username: string;
    email: string;
    // Add more fields as necessary
}

// TODO: Define journal-related types
export interface Journal {
    id: number;
    title: string;
    description: string;
    // Add more fields as necessary
}

// TODO: Define article-related types
export interface Article {
    id: number;
    title: string;
    content: string;
    journalId?: number;
    author?: string;
    abstract?: string;
    // Add more fields as necessary
}

// TODO: Define review-related types
export interface Review {
    id: number;
    articleId?: number;
    reviewerId?: number;
    content: string;
    title?: string;
    rating?: number;
    // Add more fields as necessary
}

// TODO: Define AI analysis-related types
export interface AIAnalysis {
    id: number;
    articleId: number;
    summary: string;
    plagiarismCheck: boolean;
    // Add more fields as necessary
}