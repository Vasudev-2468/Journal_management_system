import client from './client';

/* ══════════════════════════════════════════════════════
 *   Per-article stats API
 *
 * Small typed wrapper around the public
 * ``/article-stats/*`` endpoints. All calls swallow their
 * errors — a failed track/get should never bubble into a
 * reader-facing broken widget. Callers can still branch
 * on the return value when they care about the outcome.
 * ══════════════════════════════════════════════════════ */

const BASE = '/article-stats';

export type ArticleEventType = 'view' | 'download' | 'citation_click';

export interface ArticleStats {
    views: number;
    downloads: number;
    citation_clicks: number;
    last_viewed_at: string | null;
}

interface TrackResponse {
    recorded: boolean;
}

/** POST /article-stats/{id}/track — record one event. */
async function track(id: number, event_type: ArticleEventType): Promise<boolean> {
    if (!Number.isFinite(id) || id <= 0) return false;
    try {
        // Passing document.referrer through so the backend can attribute
        // where the visit landed from. The backend truncates and strips
        // query strings before persistence.
        const referrer = typeof document !== 'undefined' ? document.referrer : undefined;
        const r = await client.post<TrackResponse>(`${BASE}/${id}/track`, {
            event_type,
            referrer: referrer || undefined,
        });
        return Boolean(r.data?.recorded);
    } catch {
        // Silent — analytics must never break the page.
        return false;
    }
}

export const trackView = (id: number): Promise<boolean> => track(id, 'view');
export const trackDownload = (id: number): Promise<boolean> => track(id, 'download');
export const trackCitationClick = (id: number): Promise<boolean> =>
    track(id, 'citation_click');

/** GET /article-stats/{id} — current aggregate counts. */
export const getStats = async (id: number): Promise<ArticleStats | null> => {
    if (!Number.isFinite(id) || id <= 0) return null;
    try {
        const r = await client.get<ArticleStats>(`${BASE}/${id}`);
        if (!r.data) return null;
        return {
            views: Number(r.data.views ?? 0),
            downloads: Number(r.data.downloads ?? 0),
            citation_clicks: Number(r.data.citation_clicks ?? 0),
            last_viewed_at: r.data.last_viewed_at ?? null,
        };
    } catch {
        return null;
    }
};
