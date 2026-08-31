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
    const response = await client.get<SearchResponse>('/search/articles', {
        params: {
            q,
            kind: params.kind ?? 'any',
            page: params.page ?? 1,
            page_size: params.page_size ?? 20,
        },
    });
    return response.data;
};
