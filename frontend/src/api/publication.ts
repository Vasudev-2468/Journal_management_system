import client from './client';

export interface IssueSummary {
    id: number;
    volume_id: number;
    number: number;
    title: string | null;
    theme: string | null;
    month: string | null;
    status: 'planned' | 'accepting' | 'published';
    editorial_note: string | null;
    deadline: string | null;
    published_at: string | null;
    article_count: number;
}

export interface VolumeSummary {
    id: number;
    journal_id: number;
    number: number;
    year: number;
    title: string | null;
    issues: IssueSummary[];
}

export interface IssueArticleRow {
    id: number;
    issue_id: number;
    article_id: number;
    sequence: number;
    page_start: number | null;
    page_end: number | null;
    doi: string | null;
    category: string | null;
    article_title: string | null;
    article_display: string | null;
}

export interface IssueDetail extends IssueSummary {
    volume_number: number;
    volume_year: number;
    articles: IssueArticleRow[];
}

const BASE = '/publication';

export const fetchVolumes = async (): Promise<VolumeSummary[]> => {
    const response = await client.get(`${BASE}/volumes`);
    return response.data;
};

export const createVolume = async (payload: {
    journal_id: number;
    number: number;
    year: number;
    title?: string;
}): Promise<VolumeSummary> => {
    const response = await client.post(`${BASE}/volumes`, payload);
    return response.data;
};

export const updateVolume = async (
    id: number,
    payload: Partial<{ number: number; year: number; title: string }>,
): Promise<VolumeSummary> => {
    const response = await client.patch(`${BASE}/volumes/${id}`, payload);
    return response.data;
};

export const deleteVolume = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/volumes/${id}`);
};

export const fetchIssues = async (params?: {
    volume_id?: number;
    status_filter?: string;
}): Promise<IssueSummary[]> => {
    const response = await client.get(`${BASE}/issues`, { params });
    return response.data;
};

export const fetchIssueDetail = async (issueId: number): Promise<IssueDetail> => {
    const response = await client.get(`${BASE}/issues/${issueId}`);
    return response.data;
};

export const createIssue = async (payload: {
    volume_id: number;
    number: number;
    title?: string;
    theme?: string;
    month?: string;
    status?: 'planned' | 'accepting' | 'published';
    editorial_note?: string;
    deadline?: string;
}): Promise<IssueSummary> => {
    const response = await client.post(`${BASE}/issues`, payload);
    return response.data;
};

export const updateIssue = async (
    id: number,
    payload: Partial<IssueSummary>,
): Promise<IssueSummary> => {
    const response = await client.patch(`${BASE}/issues/${id}`, payload);
    return response.data;
};

export const deleteIssue = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/issues/${id}`);
};

export const addArticleToIssue = async (
    issueId: number,
    payload: {
        article_id: number;
        sequence?: number;
        page_start?: number;
        page_end?: number;
        doi?: string;
        category?: string;
    },
): Promise<IssueArticleRow> => {
    const response = await client.post(`${BASE}/issues/${issueId}/articles`, payload);
    return response.data;
};

export const removeArticleFromIssue = async (
    issueId: number,
    linkId: number,
): Promise<void> => {
    await client.delete(`${BASE}/issues/${issueId}/articles/${linkId}`);
};
