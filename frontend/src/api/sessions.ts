import client from './client';

/**
 * Per-device session management for the currently signed-in user.
 *
 * All three endpoints require an authenticated session. The client's
 * interceptor picks the token by URL prefix; ``/sessions/*`` doesn't
 * match any of the role-scoped prefixes, so it falls back to the
 * generic ``token`` slot. Callers on the author side pass their
 * ``author_token`` explicitly via the ``token`` argument.
 */

export interface SessionRow {
    id: number;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    last_seen_at: string;
    is_current: boolean;
}

export interface RevokeResponse {
    ok: boolean;
    revoked: number;
}

const buildAuthConfig = (token?: string) =>
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

// ── List the caller's live sessions ─────────────────────

export const fetchMySessions = async (
    token?: string,
): Promise<SessionRow[]> => {
    const res = await client.get<SessionRow[]>(
        '/sessions/mine',
        buildAuthConfig(token),
    );
    return res.data;
};

// ── Revoke one session by id ────────────────────────────

export const revokeSession = async (
    id: number,
    force: boolean = false,
    token?: string,
): Promise<RevokeResponse> => {
    const config = buildAuthConfig(token) || {};
    const res = await client.post<RevokeResponse>(
        `/sessions/${id}/revoke${force ? '?force=true' : ''}`,
        {},
        config,
    );
    return res.data;
};

// ── Revoke every OTHER live session ────────────────────

export const revokeOthers = async (
    token?: string,
): Promise<RevokeResponse> => {
    const res = await client.post<RevokeResponse>(
        '/sessions/revoke-others',
        {},
        buildAuthConfig(token),
    );
    return res.data;
};
