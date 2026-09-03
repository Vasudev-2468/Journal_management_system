import client from './client';

export interface IndexingRecord {
    id: number;
    article_id: number;
    service: string;
    state: string;
    notes: string | null;
    external_id: string | null;
    external_url: string | null;
    submitted_at: string | null;
    indexed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ServiceRollup {
    service: string;
    pending: number;
    submitted: number;
    indexed: number;
    rejected: number;
    skipped: number;
    total: number;
}

export interface IndexingSummary {
    services: ServiceRollup[];
    total_articles: number;
}

const editorHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export const fetchIndexingSummary = (): Promise<IndexingSummary> =>
    client.get('/indexing/summary', { headers: editorHeader() }).then((r) => r.data);

export const fetchArticleIndexing = (articleId: number): Promise<IndexingRecord[]> =>
    client
        .get(`/indexing/articles/${articleId}`, { headers: editorHeader() })
        .then((r) => r.data);

export const createIndexingRecord = (
    articleId: number,
    body: {
        service: string;
        state?: string;
        notes?: string;
        external_id?: string;
        external_url?: string;
    },
): Promise<IndexingRecord> =>
    client
        .post(`/indexing/articles/${articleId}`, body, { headers: editorHeader() })
        .then((r) => r.data);

export const updateIndexingRecord = (
    recordId: number,
    body: {
        state?: string;
        notes?: string;
        external_id?: string;
        external_url?: string;
    },
): Promise<IndexingRecord> =>
    client
        .patch(`/indexing/${recordId}`, body, { headers: editorHeader() })
        .then((r) => r.data);
