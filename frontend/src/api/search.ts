import client from './client';

/** Fields the search endpoint knows how to narrow on. */
export type SearchKind = 'any' | 'title' | 'author' | 'keyword' | 'doi';

/** One row on the results page. Rank is Postgres' ts_rank_cd score. */
export interface SearchItem {
    id: number;
    title: string;
    abstract_excerpt: string;
    author_display: string | null;
    rank: number;
    /**
     * Postgres ``ts_headline`` HTML fragment with ``<mark>`` tags
     * around matched terms. May be an empty string when the endpoint
     * couldn't produce a snippet (e.g. no abstract). The SearchPage
     * defensively strips any tag other than ``<mark>``/``</mark>``
     * before rendering.
     */
    highlighted?: string;
}

/** Envelope returned by GET /search/articles. */
export interface SearchResponse {
    items: SearchItem[];
    total: number;
    page: number;
    page_size: number;
}

/** Params accepted by searchArticles; sensible defaults are filled in. */
export interface SearchParams {
    q: string;
    kind?: SearchKind;
    /**
     * Optional publication-year filter. Backed server-side by
     * ``volumes.year`` via the issue join — articles not yet placed
     * in an issue won't match.
     */
    year?: number;
    /**
     * Optional classified-field substring. Server-side ILIKE
     * %category% against the soft-joined submission row.
     */
    category?: string;
    page?: number;
    page_size?: number;
}

/**
 * Query the server-side full-text search.
 *
 * An empty (whitespace-only) ``q`` short-circuits without a network
 * round-trip — the SearchPage renders the "start typing" hint in that
 * case, so a request would only add latency.
 */
export const searchArticles = async (
    params: SearchParams,
): Promise<SearchResponse> => {
    const q = (params.q || '').trim();
    if (!q) {
        return {
            items: [],
            total: 0,
            page: params.page ?? 1,
            page_size: params.page_size ?? 20,
        };
    }
    const query: Record<string, string | number> = {
        q,
        kind: params.kind ?? 'any',
        page: params.page ?? 1,
        page_size: params.page_size ?? 20,
    };
    if (params.year !== undefined && params.year !== null && !Number.isNaN(params.year)) {
        query.year = params.year;
    }
    const trimmedCat = (params.category || '').trim();
    if (trimmedCat) {
        query.category = trimmedCat;
    }
    const response = await client.get<SearchResponse>('/search/articles', {
        params: query,
    });
    return response.data;
};
