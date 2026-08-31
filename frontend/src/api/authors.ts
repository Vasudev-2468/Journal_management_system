import client from './client';

export interface AuthorPublicArticle {
    id: number;
    title: string;
    abstract: string | null;
    journal_id: number | null;
}

export interface AuthorPublicProfile {
    id: number;
    full_name: string | null;
    username: string;
    orcid: string | null;
    institution: string | null;
    country: string | null;
    department: string | null;
    research_areas: string | null;
    bio: string | null;
    articles: AuthorPublicArticle[];
}

const BASE = '/authors-public';

export const fetchAuthorProfile = async (id: string | number): Promise<AuthorPublicProfile> => {
    const response = await client.get(`${BASE}/${id}`);
    return response.data;
};
