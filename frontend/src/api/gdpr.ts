import client from './client';

/**
 * GDPR self-serve endpoints — the authenticated user's own data export
 * and account anonymisation.
 *
 * ``/gdpr/*`` doesn't match any of the role-scoped prefixes routed by
 * ``client.ts``, so the request interceptor would fall back to the
 * generic ``token`` slot. This module reads the ``author_token`` slot
 * directly and passes it through as an explicit ``Authorization`` header
 * to guarantee the request travels on the author's real session.
 */

const AUTHOR_TOKEN_KEY = 'author_token';

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(AUTHOR_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface DeleteAccountResponse {
    ok: boolean;
    message: string;
}

// ── Data export ─────────────────────────────────────────

/**
 * Fetch the caller's personal-data bundle as a downloadable JSON file.
 *
 * The backend serves the payload with ``Content-Disposition: attachment``
 * and a suggested filename, but browsers ignore that header for XHR
 * responses. We fetch the body as a blob, materialise an object URL, and
 * click a hidden anchor so the file lands in the download tray with the
 * same filename the server picked.
 */
export const exportMyData = async (): Promise<void> => {
    const res = await client.get<Blob>('/gdpr/my-data-export', {
        headers: authHeaders(),
        responseType: 'blob',
    });

    // Prefer the server-picked filename; fall back to a client-side
    // stamp if the browser stripped Content-Disposition (e.g. CORS
    // preflight didn't expose the header).
    let filename = `jgair-data-export-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}.json`;
    const disposition = res.headers['content-disposition'];
    if (typeof disposition === 'string') {
        const match = /filename="?([^"]+)"?/i.exec(disposition);
        if (match?.[1]) filename = match[1];
    }

    const blob =
        res.data instanceof Blob
            ? res.data
            : new Blob([JSON.stringify(res.data, null, 2)], {
                  type: 'application/json',
              });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a beat to start the download before revoking the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Account deletion ────────────────────────────────────

/**
 * Send the anonymisation request. The backend requires ``confirm_email``
 * to match the caller's own email (case-insensitive) — the UI must gate
 * the button on that same match to avoid surfacing the 422 to the user.
 */
export const deleteMyAccount = async (
    confirmEmail: string,
): Promise<DeleteAccountResponse> => {
    const res = await client.post<DeleteAccountResponse>(
        '/gdpr/delete-my-account',
        { confirm_email: confirmEmail },
        { headers: authHeaders() },
    );
    return res.data;
};
