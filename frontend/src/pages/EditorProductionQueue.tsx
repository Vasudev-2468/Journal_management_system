import React, { useEffect, useMemo, useState } from 'react';
import Loading from '../components/common/Loading';
import useFilePreview from '../hooks/useFilePreview';
import {
    ProductionRecord,
    ProductionStage,
    fetchProductionQueue,
    updateProduction,
} from '../api/platform';

const STAGE_ORDER: ProductionStage[] = [
    'copy_editing',
    'typesetting',
    'proof',
    'author_proof_pending',
    'author_proof_approved',
    'final_pdf',
    'doi_assigned',
    'published',
];

const STAGE_LABEL: Record<ProductionStage, string> = {
    copy_editing: 'Copy editing',
    typesetting: 'Typesetting',
    proof: 'Proof',
    author_proof_pending: 'Awaiting author proof',
    author_proof_approved: 'Author proof approved',
    final_pdf: 'Final PDF',
    doi_assigned: 'DOI assigned',
    published: 'Published',
};

const STAGE_COLOR: Record<ProductionStage, string> = {
    copy_editing: 'bg-blue-100 text-blue-700',
    typesetting: 'bg-indigo-100 text-indigo-700',
    proof: 'bg-purple-100 text-purple-700',
    author_proof_pending: 'bg-amber-100 text-amber-700',
    author_proof_approved: 'bg-cyan-100 text-cyan-700',
    final_pdf: 'bg-teal-100 text-teal-700',
    doi_assigned: 'bg-emerald-100 text-emerald-700',
    published: 'bg-green-100 text-green-700',
};

const EditorProductionQueue: React.FC = () => {
    const [rows, setRows] = useState<ProductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<ProductionStage | ''>('');
    const [editing, setEditing] = useState<ProductionRecord | null>(null);

    // Inline preview for proof / final PDFs so editors don't lose their
    // place in the queue every time they open a file.
    const { open: openPreview, PreviewNode } = useFilePreview();

    const load = () => {
        setLoading(true);
        fetchProductionQueue(filter || undefined)
            .then(setRows)
            .catch((err) => setError(err?.message || 'Failed to load queue.'))
            .finally(() => setLoading(false));
    };
    useEffect(load, [filter]); // eslint-disable-line

    const advance = async (r: ProductionRecord) => {
        const idx = STAGE_ORDER.indexOf(r.stage);
        const next = STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, idx + 1)];
        try {
            const updated = await updateProduction(r.id, { stage: next });
            setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const patch = async () => {
        if (!editing) return;
        try {
            const updated = await updateProduction(editing.id, editing);
            setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setEditing(null);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const grouped = useMemo(() => {
        const map: Record<ProductionStage, ProductionRecord[]> = {
            copy_editing: [], typesetting: [], proof: [],
            author_proof_pending: [], author_proof_approved: [],
            final_pdf: [], doi_assigned: [], published: [],
        };
        for (const r of rows) (map[r.stage] || map.copy_editing).push(r);
        return map;
    }, [rows]);

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Production Queue</h1>
                <p className="text-sm text-gray-500 mb-6">
                    Everything after acceptance — copy editing, typesetting, proof, DOI assignment, publication.
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                    <button
                        onClick={() => setFilter('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === '' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200'}`}
                    >
                        All ({rows.length})
                    </button>
                    {STAGE_ORDER.map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200'}`}
                        >
                            {STAGE_LABEL[s]} ({grouped[s].length})
                        </button>
                    ))}
                </div>

                {error && (
                    <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : rows.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                        Nothing in the production queue.
                    </div>
                ) : (
                    <ul className="grid gap-3">
                        {rows.map((r) => (
                            <li key={r.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${STAGE_COLOR[r.stage]}`}>
                                                {STAGE_LABEL[r.stage]}
                                            </span>
                                            {r.doi && (
                                                <span className="text-xs text-gray-500 font-mono">
                                                    doi:{r.doi}
                                                </span>
                                            )}
                                            {r.published_at && (
                                                <span className="text-xs text-green-600">
                                                    published {new Date(r.published_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-mono mt-1">
                                            submission {r.submission_id}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                            {r.proof_pdf_url && (
                                                <>
                                                    <a
                                                        href={r.proof_pdf_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) =>
                                                            openPreview({
                                                                url: r.proof_pdf_url!,
                                                                filename: `proof-${r.submission_id}.pdf`,
                                                                mimeType: 'application/pdf',
                                                                event: e,
                                                            })
                                                        }
                                                        className="px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-100 no-underline"
                                                    >
                                                        Proof PDF
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            openPreview({
                                                                url: r.proof_pdf_url!,
                                                                filename: `proof-${r.submission_id}.pdf`,
                                                                mimeType: 'application/pdf',
                                                            })
                                                        }
                                                        className="px-2 py-1 rounded bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"
                                                    >
                                                        Preview
                                                    </button>
                                                </>
                                            )}
                                            {r.final_pdf_url && (
                                                <>
                                                    <a
                                                        href={r.final_pdf_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) =>
                                                            openPreview({
                                                                url: r.final_pdf_url!,
                                                                filename: `final-${r.submission_id}.pdf`,
                                                                mimeType: 'application/pdf',
                                                                event: e,
                                                            })
                                                        }
                                                        className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-100 no-underline"
                                                    >
                                                        Final PDF
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            openPreview({
                                                                url: r.final_pdf_url!,
                                                                filename: `final-${r.submission_id}.pdf`,
                                                                mimeType: 'application/pdf',
                                                            })
                                                        }
                                                        className="px-2 py-1 rounded bg-white text-green-700 border border-green-200 hover:bg-green-50"
                                                    >
                                                        Preview
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => setEditing({ ...r })}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => advance(r)}
                                            disabled={r.stage === 'published'}
                                            className="text-xs px-3 py-1 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:bg-gray-300"
                                        >
                                            Advance →
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {editing && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                            <h2 className="text-lg font-bold mb-4">Update production</h2>
                            <div className="space-y-3 text-sm">
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Stage</span>
                                    <select
                                        value={editing.stage}
                                        onChange={(e) => setEditing({ ...editing, stage: e.target.value as ProductionStage })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    >
                                        {STAGE_ORDER.map((s) => (
                                            <option key={s} value={s}>
                                                {STAGE_LABEL[s]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Copy-edit notes</span>
                                    <textarea
                                        value={editing.copy_edit_notes || ''}
                                        onChange={(e) => setEditing({ ...editing, copy_edit_notes: e.target.value })}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Typesetting notes</span>
                                    <textarea
                                        value={editing.typesetting_notes || ''}
                                        onChange={(e) => setEditing({ ...editing, typesetting_notes: e.target.value })}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Proof PDF URL</span>
                                    <input
                                        value={editing.proof_pdf_url || ''}
                                        onChange={(e) => setEditing({ ...editing, proof_pdf_url: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Final PDF URL</span>
                                    <input
                                        value={editing.final_pdf_url || ''}
                                        onChange={(e) => setEditing({ ...editing, final_pdf_url: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">DOI</span>
                                    <input
                                        value={editing.doi || ''}
                                        onChange={(e) => setEditing({ ...editing, doi: e.target.value })}
                                        placeholder="10.xxxxx/…"
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 font-mono"
                                    />
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-gray-200">
                                    Cancel
                                </button>
                                <button
                                    onClick={patch}
                                    className="px-4 py-2 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {PreviewNode}
        </div>
    );
};

export default EditorProductionQueue;
