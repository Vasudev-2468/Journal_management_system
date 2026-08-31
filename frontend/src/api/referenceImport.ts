import client from './client';
import type { ArticleReference } from './platform';

/**
 * Editor-only bulk reference importer.
 *
 * Wraps ``POST /reference-import/{articleId}``. The backend gates the
 * endpoint with ``require_editor_mfa`` and adjusts the axios client's
 * token routing at the ``/reference-import`` prefix — see below.
 */

export type ReferenceImportFormat = 'bibtex' | 'ris';

export interface ReferenceImportResponse {
    inserted: number;
    entries: ArticleReference[];
}

export const importReferences = async (
    articleId: number,
    format: ReferenceImportFormat,
    text: string,
): Promise<ReferenceImportResponse> => {
    // ``client`` picks a token by URL prefix; this endpoint is
    // editor-only, so we explicitly pin the editor session token to
    // survive the interceptor's default fallthrough (which would try
    // the author token first for a "/reference-import" path).
    const editorToken = localStorage.getItem('editor_token');
    const r = await client.post(
        `/reference-import/${articleId}`,
        { format, text },
        editorToken
            ? { headers: { Authorization: `Bearer ${editorToken}` } }
            : undefined,
    );
    return r.data;
};
