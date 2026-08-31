import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArticleReference,
    deleteReference,
    fetchReferences,
} from '../api/platform';
import {
    ReferenceImportFormat,
    importReferences,
} from '../api/referenceImport';

/* ══════════════════════════════════════════════════════
 *   Editor-facing bulk reference importer
 *
 *   Mounted at ``/editor/articles/:articleId/references`` and wrapped
 *   with ``ProtectedEditorRoute`` in ``App.tsx``. Renders:
 *
 *     • the current references (numbered, with DOI + URL badges),
 *     • a format toggle (BibTeX / RIS),
 *     • a paste textarea,
 *     • an Import button that calls POST /reference-import/{id}
 *       and appends whatever came back to the visible list,
 *     • per-row Delete buttons hitting DELETE /references/{id}.
 * ══════════════════════════════════════════════════════ */

type ImportState =
    | { status: 'idle' }
    | { status: 'importing' }
    | { status: 'ok'; inserted: number }
    | { status: 'error'; message: string };

const EditorArticleReferencesPage: React.FC = () => {
    const { articleId } = useParams<{ articleId: string }>();
    const numericId = Number(articleId);
    const validId = Number.isFinite(numericId) && numericId > 0;

    const [refs, setRefs] = useState<ArticleReference[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [format, setFormat] = useState<ReferenceImportFormat>('bibtex');
    const [text, setText] = useState<string>('');
    const [importState, setImportState] = useState<ImportState>({ status: 'idle' });

    const [deletingId, setDeletingId] = useState<number | null>(null);

    /* ── initial load ────────────────────────────────── */
    const reload = useCallback(async () => {
        if (!validId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await fetchReferences(numericId);
            // Keep the visible order stable and predictable — sort by
            // the ``sequence`` field the backend uses to order refs.
            rows.sort((a, b) => a.sequence - b.sequence);
            setRefs(rows);
        } catch {
            setLoadError('Could not load references for this article.');
            setRefs([]);
        } finally {
            setLoading(false);
        }
    }, [numericId, validId]);

    useEffect(() => {
        reload();
    }, [reload]);

    /* ── import handler ─────────────────────────────── */
    const canImport = validId && text.trim().length > 0 && importState.status !== 'importing';

    const handleImport = async () => {
        if (!canImport) return;
        setImportState({ status: 'importing' });
        try {
            const res = await importReferences(numericId, format, text);
            // Append the freshly-inserted rows to the visible list
            // rather than doing a second GET — the server already
            // returned them in ``sequence`` order.
            setRefs((prev) => {
                const merged = [...prev, ...res.entries];
                merged.sort((a, b) => a.sequence - b.sequence);
                return merged;
            });
            setImportState({ status: 'ok', inserted: res.inserted });
            if (res.inserted > 0) {
                // Clear the textarea only on a successful non-empty
                // import — leave malformed paste in place so the editor
                // can fix it.
                setText('');
            }
        } catch (err: unknown) {
            const detail =
                (err as { response?: { data?: { detail?: string } } })?.response?.data
                    ?.detail || 'Import failed. Check the pasted text and try again.';
            setImportState({ status: 'error', message: detail });
        }
    };

    /* ── delete handler ─────────────────────────────── */
    const handleDelete = async (id: number) => {
        if (deletingId !== null) return;
        setDeletingId(id);
        try {
            await deleteReference(id);
            setRefs((prev) => prev.filter((r) => r.id !== id));
        } catch {
            // Surface via inline notice rather than an alert so we
            // don't lose the editor's context.
            setLoadError('Could not delete that reference. Try again.');
        } finally {
            setDeletingId(null);
        }
    };

    const importedBanner = useMemo(() => {
        if (importState.status === 'ok') {
            if (importState.inserted === 0) {
                return {
                    tone: 'warn' as const,
                    text: 'Nothing was imported — no complete entries were found in the pasted text.',
                };
            }
            return {
                tone: 'ok' as const,
                text: `Imported ${importState.inserted} reference${importState.inserted === 1 ? '' : 's'}.`,
            };
        }
        if (importState.status === 'error') {
            return { tone: 'error' as const, text: importState.message };
        }
        return null;
    }, [importState]);

    if (!validId) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <p className="text-sm text-gray-500">Invalid article id.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-6">
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">
                        Editor tools
                    </p>
                    <div className="flex items-baseline justify-between flex-wrap gap-3 mt-1">
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                            Article #{numericId} — References
                        </h1>
                        <Link
                            to="/editor-dashboard"
                            className="text-sm text-blue-700 hover:text-blue-900 font-semibold no-underline"
                        >
                            ← Back to editor dashboard
                        </Link>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        Paste a BibTeX or RIS export to bulk-add references. Existing entries
                        are preserved; new ones append after the highest current sequence.
                    </p>
                </div>

                {/* Importer card */}
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
                    <h2 className="text-sm font-bold text-gray-900 mb-3">Bulk import</h2>
                    <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-3">
                        {(['bibtex', 'ris'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFormat(f)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition uppercase tracking-wider ${
                                    format === f
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {f === 'bibtex' ? 'BibTeX' : 'RIS'}
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                            format === 'bibtex'
                                ? '@article{doe2024,\n  title   = {A sample paper},\n  author  = {Doe, Jane and Smith, John},\n  journal = {J. of Testing},\n  year    = {2024},\n  doi     = {10.1234/x}\n}'
                                : 'TY  - JOUR\nAU  - Doe, Jane\nAU  - Smith, John\nTI  - A sample paper\nJO  - J. of Testing\nPY  - 2024\nDO  - 10.1234/x\nER  -'
                        }
                        rows={12}
                        spellCheck={false}
                        className="w-full font-mono text-xs bg-gray-900 text-emerald-200 rounded-xl p-4 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/60 placeholder-emerald-200/40"
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={!canImport}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {importState.status === 'importing' ? 'Importing…' : 'Import'}
                        </button>
                        {importedBanner && (
                            <p
                                className={`text-xs font-semibold ${
                                    importedBanner.tone === 'ok'
                                        ? 'text-emerald-700'
                                        : importedBanner.tone === 'warn'
                                          ? 'text-amber-700'
                                          : 'text-rose-700'
                                }`}
                                role="status"
                            >
                                {importedBanner.text}
                            </p>
                        )}
                    </div>
                </section>

                {/* Current references */}
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 className="text-sm font-bold text-gray-900">Current references</h2>
                        <span className="text-xs text-gray-500 font-semibold">
                            {refs.length} on file
                        </span>
                    </div>

                    {loadError && (
                        <p className="text-xs text-rose-700 font-semibold mb-3">{loadError}</p>
                    )}

                    {loading ? (
                        <p className="text-sm text-gray-500">Loading references…</p>
                    ) : refs.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
                            <p className="text-sm text-gray-500">
                                No references on file yet. Paste a BibTeX or RIS export above to add
                                them.
                            </p>
                        </div>
                    ) : (
                        <ol className="space-y-3">
                            {refs.map((r) => (
                                <li
                                    key={r.id}
                                    className="flex gap-3 items-start rounded-xl border border-gray-100 p-3 hover:border-blue-200 transition"
                                >
                                    <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-extrabold flex items-center justify-center">
                                        {r.sequence}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-800 leading-relaxed">
                                            {r.text}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
                                            {r.doi && (
                                                <a
                                                    href={`https://doi.org/${r.doi}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-700 hover:text-blue-900 font-semibold no-underline"
                                                >
                                                    doi.org/{r.doi}
                                                </a>
                                            )}
                                            {r.url && (
                                                <a
                                                    href={r.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-emerald-700 hover:text-emerald-900 font-semibold no-underline break-all"
                                                >
                                                    {r.url}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(r.id)}
                                        disabled={deletingId === r.id}
                                        className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg px-3 py-1 transition disabled:opacity-50"
                                    >
                                        {deletingId === r.id ? 'Deleting…' : 'Delete'}
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>
        </div>
    );
};

export default EditorArticleReferencesPage;
