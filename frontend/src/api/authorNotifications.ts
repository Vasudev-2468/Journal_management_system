import client from './client';
import { getAuthorToken } from './authorAuth';

// Wraps the author-scoped notification feed at
// `/authors-notifications/*`. That URL prefix does NOT match any of the
// role-token rules in `client.ts`, so this module attaches the author
// bearer explicitly on every call — the shared axios instance would
// otherwise fall through to the generic `token` slot and the request
// would 401.

export type AuthorNotificationKind = 'decision' | 'message';

export interface AuthorNotificationItem {
    id: string;
    kind: AuthorNotificationKind;
    title: string;
    submission_id: string;
    created_at: string;
    unread: boolean;
}

export interface AuthorNotificationFeed {
    count: number;
    items: AuthorNotificationItem[];
}

const withAuthorAuth = () => {
    const token = getAuthorToken();
    // Return `undefined` when there is no token so axios doesn't send a
    // `Bearer null` — the backend would 401 either way but this keeps
    // network logs clean.
    return token ? { Authorization: `Bearer ${token}` } : undefined;
};

export const fetchMine = async (): Promise<AuthorNotificationFeed> => {
    const headers = withAuthorAuth();
    const response = await client.get('/authors-notifications/mine', {
        headers,
    });
    const data = response.data || {};
    return {
        count: typeof data.count === 'number' ? data.count : 0,
        items: Array.isArray(data.items) ? data.items : [],
    };
};

export const markAllRead = async (): Promise<{ marked: number }> => {
    const headers = withAuthorAuth();
    const response = await client.post(
        '/authors-notifications/mark-all-read',
        {},
        { headers },
    );
    const data = response.data || {};
    return { marked: typeof data.marked === 'number' ? data.marked : 0 };
};
