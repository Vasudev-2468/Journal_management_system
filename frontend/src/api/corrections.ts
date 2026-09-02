import client from './client';

export interface ArticleNotice {
    id: number;
    article_id: number;
    notice_type: 'correction' | 'retraction' | 'expression_of_concern';
    title: string;
    description: string;
    reason?: string | null;
    published_at: string;
    published_by_email?: string | null;
    doi_of_notice?: string | null;
}

export interface CorrectionPayload {
    title: string;
    description: string;
    doi_of_notice?: string | null;
}

export interface RetractionPayload extends CorrectionPayload {
    reason: string;
}

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export const fetchArticleNotices = (articleId: number): Promise<ArticleNotice[]> =>
    client.get(`/articles/${articleId}/corrections`).then((r) => r.data);

export interface ArticleNoticeSummary {
    article_id: number;
    is_retracted: boolean;
    correction_count: number;
    expression_of_concern_count: number;
}

export const fetchArticleNoticeSummaries = (
    ids: number[],
): Promise<ArticleNoticeSummary[]> => {
    if (ids.length === 0) return Promise.resolve([]);
    return client
        .get('/articles/notices/summary', { params: { ids: ids.join(',') } })
        .then((r) => r.data);
};

export const publishCorrection = (
    articleId: number,
    payload: CorrectionPayload,
): Promise<ArticleNotice> =>
    client
        .post(`/articles/${articleId}/correction`, payload, { headers: editorAuthHeader() })
        .then((r) => r.data);

export const publishRetraction = (
    articleId: number,
    payload: RetractionPayload,
): Promise<ArticleNotice> =>
    client
        .post(`/articles/${articleId}/retraction`, payload, { headers: editorAuthHeader() })
        .then((r) => r.data);
