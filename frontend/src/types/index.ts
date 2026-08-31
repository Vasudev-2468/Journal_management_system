// Shared type definitions used across the frontend.

export type UserRole =
    | 'author'
    | 'reviewer'
    | 'editor'
    | 'section_editor'
    | 'admin';

export interface User {
    id: number;
    username: string;
    email: string;
    full_name?: string;
    role?: UserRole;
    is_active?: boolean;
    mfa_enabled?: boolean;
    created_at?: string;
}

export interface Journal {
    id: number;
    title: string;
    description: string;
    issn?: string;
    is_active?: boolean;
    created_at?: string;
}

export interface Article {
    id: number;
    title: string;
    content: string | null;
    // The backend serialises snake_case; both aliases are accepted so
    // existing consumers keep compiling.
    journal_id?: number;
    journalId?: number;
    author_id?: number | null;
    // author_display is the human-readable byline populated by the router
    // via a joined User row. `author` stays for back-compat but is unused
    // by fresh code.
    author_display?: string | null;
    author?: string;
    abstract?: string | null;
}

export type ReviewRecommendation =
    | 'accept'
    | 'minor_revision'
    | 'major_revision'
    | 'reject';

export interface Review {
    id: number;
    articleId?: number;
    reviewerId?: number;
    content: string;
    title?: string;
    rating?: number;
    recommendation?: ReviewRecommendation;
    submitted_at?: string;
}

export interface AIAnalysis {
    id: number;
    article_id: number;
    summary: string;
    plagiarism_score: number;
    recommendations: string | null;
}
