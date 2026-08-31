import client from './client';

/**
 * Aggregated per-manuscript event stream.
 *
 * The backend at ``GET /submission-timeline/{submissionId}`` returns
 * a chronologically-ascending list of events; the axios client picks
 * the author-session token by default for the ``/submission-*``
 * prefix (see ``client.ts``), and any editor token is accepted
 * server-side via the "editor sees all" branch.
 */

export type TimelineKind =
    | 'submitted'
    | 'review_assigned'
    | 'review_completed'
    | `status_change:${string}`
    | `decision:${string}`
    | `revision:v${number}`
    | `production:${string}`;

export interface TimelineEvent {
    at: string;
    kind: TimelineKind | string;
    label: string;
    actor?: string | null;
    meta?: Record<string, unknown> | null;
}

export interface TimelineResponse {
    events: TimelineEvent[];
}

export const fetchTimeline = async (
    submissionId: string,
): Promise<TimelineResponse> => {
    // Prefer the author session token — this call happens from the
    // author-facing submission detail page. If none exists (e.g. an
    // editor previewing an author page in the same browser), fall
    // through to whichever role token the client interceptor picks.
    const authorToken = localStorage.getItem('author_token');
    const r = await client.get(
        `/submission-timeline/${submissionId}`,
        authorToken
            ? { headers: { Authorization: `Bearer ${authorToken}` } }
            : undefined,
    );
    return r.data;
};
