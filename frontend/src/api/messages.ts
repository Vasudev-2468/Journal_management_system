import client from './client';

// The client picks its token by URL prefix, and /submission-messages is not
// in that map — so we explicitly attach whichever session token this browser
// has. Editor sessions take precedence when both are present, matching the
// role each token proves.
function authHeader(): Record<string, string> {
    const editorToken =
        typeof localStorage !== 'undefined'
            ? localStorage.getItem('editor_token')
            : null;
    const authorToken =
        typeof localStorage !== 'undefined'
            ? localStorage.getItem('author_token')
            : null;
    const fallback =
        typeof localStorage !== 'undefined'
            ? localStorage.getItem('token')
            : null;
    const token = editorToken || authorToken || fallback;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface SubmissionMessage {
    id: number;
    submission_id: string;
    sender_role: 'author' | 'editor' | 'system';
    sender_email: string | null;
    body: string;
    is_from_editor: boolean;
    read_by_author_at: string | null;
    read_by_editor_at: string | null;
    created_at: string;
}

const BASE = '/submission-messages';

export const fetchMessages = async (
    subId: string,
): Promise<SubmissionMessage[]> => {
    const res = await client.get(`${BASE}/submission/${subId}`, {
        headers: authHeader(),
    });
    return res.data as SubmissionMessage[];
};

export const sendMessage = async (
    subId: string,
    body: string,
): Promise<SubmissionMessage> => {
    const res = await client.post(
        `${BASE}/submission/${subId}`,
        { body },
        { headers: authHeader() },
    );
    return res.data as SubmissionMessage;
};

export const markRead = async (
    id: number,
): Promise<SubmissionMessage> => {
    const res = await client.post(
        `${BASE}/${id}/mark-read`,
        {},
        { headers: authHeader() },
    );
    return res.data as SubmissionMessage;
};
