import client from './client';

export interface ScreeningCheck {
    key: string;
    label: string;
    state: 'passed' | 'warning' | 'flagged' | 'pending';
    detail?: string | null;
}

export interface NewSubmissionRow {
    submission_id: string;
    manuscript_id: string;
    title: string;
    article_type: string;
    corresponding_author: string;
    author_affiliation: string | null;
    author_email: string;
    submitted_at: string;
    age_days: number;
    priority: 'fast_track' | 'special_issue' | 'invited' | 'normal';
    status: string;
    screening: ScreeningCheck[];
    ethics_flagged: boolean;
}

export interface NewSubmissionsResponse {
    total: number;
    submissions: NewSubmissionRow[];
}

export interface ScreeningDetail extends NewSubmissionRow {
    abstract: string | null;
    keywords: string[];
    files: Array<{
        id: string;
        filename: string;
        size_bytes?: number | null;
        content_type?: string | null;
        kind?: string | null;
        url?: string | null;
    }>;
    authors: Array<{ name: string; email: string; corresponding: boolean }>;
    format_check_report: any;
}

export type ScreeningDecision = 'peer_review' | 'reject' | 'author_correction' | 'transfer';

export interface ScreeningChecklist {
    scope?: boolean;
    article_type?: boolean;
    complete?: boolean;
    ethics?: boolean;
    coi?: boolean;
    review_ready?: boolean;
}

const editorHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export const listNewSubmissions = (params: {
    q?: string;
    article_type?: string;
    since_days?: number;
} = {}): Promise<NewSubmissionsResponse> =>
    client
        .get('/editor-portal/new-submissions', {
            params,
            headers: editorHeader(),
        })
        .then((r) => r.data);

export const fetchScreeningDetail = (
    submissionId: string,
): Promise<ScreeningDetail> =>
    client
        .get(`/editor-portal/new-submissions/${submissionId}`, { headers: editorHeader() })
        .then((r) => r.data);

export const submitScreeningDecision = (
    submissionId: string,
    body: {
        decision: ScreeningDecision;
        comments?: string;
        checklist?: ScreeningChecklist;
        transfer_target?: string;
    },
): Promise<{ ok: boolean; submission_id: string; new_status: string }> =>
    client
        .post(
            `/editor-portal/new-submissions/${submissionId}/screening-decision`,
            body,
            { headers: editorHeader() },
        )
        .then((r) => r.data);
