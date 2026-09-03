import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import BackButton from '../../components/common/BackButton';

/*
 * Editorial Comment Moderation workspace (JG-Editor-Moderation).
 *
 * The reviewer's raw comment never goes to the author. On this page
 * the editor:
 *   - reads the original reviewer wording (preserved read-only)
 *   - optionally rewrites it in the "edited text" box
 *   - marks each comment Approved / Edited / Confidential / Removed
 *   - reads the Editorial Comment Moderation Agent's per-comment
 *     suggestions (harsh language, identity leaks, duplicates,
 *     softened wording)
 * and finally clicks "Release to author" to publish the
 * AUTHOR_VISIBLE + EDITOR_APPROVED comments.
 *
 * Read the author-side gate in
 * ``backend/app/routers/author_revision.py`` — comments that are not
 * RELEASED_TO_AUTHOR + AUTHOR_VISIBLE are hidden from the author.
 */

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

type Status = 'EDITOR_REVIEW' | 'EDITOR_APPROVED' | 'EDITOR_EDITED'
             | 'EDITOR_REMOVED' | 'EDITOR_CONFIDENTIAL' | 'RELEASED_TO_AUTHOR';
type Visibility = 'AUTHOR_VISIBLE' | 'EDITOR_ONLY' | 'CONFIDENTIAL' | 'REMOVED';

interface CommentRow {
    key: string;
    review_id: string;
    reviewer_display_name: string;
    comment_kind: 'major' | 'minor';
    comment_index: number;
    original_text: string;
    edited_text?: string | null;
    editor_note?: string | null;
    status: Status;
    visibility: Visibility;
    consolidated_into?: number | null;
    released_at?: string | null;
}

interface AgentSuggestion {
    flags: string[];
    reasons: string[];
    duplicate_of: { review_id: string; comment_kind: string; comment_index: number; similarity: number }[];
    suggested_edit?: string | null;
}

interface ReviewerRollup {
    reviewer_display_name: string;
    total: number;
    approved: number;
    edited: number;
    removed: number;
    confidential: number;
    pending: number;
}

interface Workspace {
    submission_id: string;
    round_number: number;
    comments: CommentRow[];
    per_reviewer: ReviewerRollup[];
    suggestions: Record<string, AgentSuggestion>;
    released_at: string | null;
}

const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
    EDITOR_REVIEW:       { label: 'Pending review',  cls: 'bg-amber-100 text-amber-900' },
    EDITOR_APPROVED:     { label: 'Approved',        cls: 'bg-emerald-100 text-emerald-800' },
    EDITOR_EDITED:       { label: 'Edited',          cls: 'bg-blue-100 text-blue-800' },
    EDITOR_REMOVED:      { label: 'Removed',         cls: 'bg-rose-100 text-rose-800' },
    EDITOR_CONFIDENTIAL: { label: 'Confidential',    cls: 'bg-slate-200 text-slate-800' },
    RELEASED_TO_AUTHOR:  { label: 'Released',        cls: 'bg-emerald-200 text-emerald-900' },
};

const EditorCommentModerationPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const [data, setData] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [releasing, setReleasing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Local edit buffer keyed by row key so typing doesn't hit the
    // network every character. Flushed on blur / status click.
    const [buffer, setBuffer] = useState<Record<string, { edited: string; note: string }>>({});

    const load = () => {
        setLoading(true);
        client.get(`/comment-moderation/${submissionId}`, { headers: editorAuthHeader() })
            .then((r) => {
                setData(r.data);
                const b: Record<string, { edited: string; note: string }> = {};
                for (const c of r.data.comments as CommentRow[]) {
                    b[c.key] = { edited: c.edited_text || '', note: c.editor_note || '' };
                }
                setBuffer(b);
            })
            .catch((e: any) => setError(e?.response?.data?.detail || 'Could not load workspace.'))
            .finally(() => setLoading(false));
    };
    useEffect(() => { if (submissionId) load(); }, [submissionId]);

    const patchRow = async (row: CommentRow, changes: Partial<{
        edited_text: string; editor_note: string; status: Status; visibility: Visibility;
    }>) => {
        setSaving(row.key); setError(null);
        try {
            const r = await client.patch(
                `/comment-moderation/${submissionId}/${row.key}`,
                changes,
                { headers: editorAuthHeader() },
            );
            const updated: CommentRow = r.data;
            setData((prev) => prev ? ({
                ...prev,
                comments: prev.comments.map((c) => c.key === updated.key ? { ...c, ...updated } : c),
            }) : prev);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Save failed.');
        } finally {
            setSaving(null);
        }
    };

    const doRelease = async () => {
        if (!data) return;
        const authorVisible = data.comments.filter((c) => c.visibility === 'AUTHOR_VISIBLE');
        const withheld = data.comments.length - authorVisible.length;
        if (!window.confirm(
            `You are about to release ${authorVisible.length} moderated comment${authorVisible.length === 1 ? '' : 's'} to the author.\n\n` +
            `The author will NOT see:\n• ${withheld} withheld comment${withheld === 1 ? '' : 's'} (confidential / removed / editor-only)\n\n` +
            `Once released, the comments become part of the official revision record.`,
        )) return;
        setReleasing(true); setError(null);
        try {
            const r = await client.post(`/comment-moderation/${submissionId}/release`, {}, { headers: editorAuthHeader() });
            setToast(`Released ${r.data.released_count} comments to the author. ${r.data.withheld_count} withheld.`);
            load();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Release failed.');
        } finally {
            setReleasing(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-50 p-8"><div className="text-sm text-gray-500">Loading moderation workspace…</div></div>;
    if (error && !data) return (
        <div className="min-h-screen bg-gray-50 p-8">
            <BackButton className="mb-4" />
            <div className="max-w-3xl mx-auto rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
        </div>
    );
    if (!data) return null;

    const totalsByStatus = data.per_reviewer.reduce(
        (acc, r) => ({
            approved: acc.approved + r.approved,
            edited: acc.edited + r.edited,
            removed: acc.removed + r.removed,
            confidential: acc.confidential + r.confidential,
            pending: acc.pending + r.pending,
            total: acc.total + r.total,
        }),
        { approved: 0, edited: 0, removed: 0, confidential: 0, pending: 0, total: 0 },
    );

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />
                <div className="text-xs text-gray-500 mb-1">Reviewers › Editorial Comment Moderation</div>
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <span aria-hidden>🛡️</span> Editorial Comment Moderation
                        </h1>
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                            Reviewer comments are never sent to the author verbatim.
                            Edit / approve / mark confidential each comment, then release the moderated package.
                        </p>
                        <div className="text-xs text-gray-500 mt-1">
                            Round {data.round_number} · {totalsByStatus.total} comments · {totalsByStatus.pending} pending review
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={doRelease}
                        disabled={releasing || totalsByStatus.total === 0}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {releasing ? 'Releasing…' : '✓ Release to author'}
                    </button>
                </div>

                {toast && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{toast}</div>}
                {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
                {data.released_at && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        This round was released to the author on {new Date(data.released_at).toLocaleString()}.
                        Re-releasing will overwrite the previously released text.
                    </div>
                )}

                {/* Per-reviewer rollup */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    {data.per_reviewer.map((r, i) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="text-sm font-semibold text-gray-900">{r.reviewer_display_name}</div>
                            <div className="text-[11px] text-gray-500">
                                {r.total} comments · {r.pending} pending · {r.approved} approved · {r.edited} edited · {r.removed} removed · {r.confidential} confidential
                            </div>
                        </div>
                    ))}
                </div>

                {/* Comment rows */}
                <div className="space-y-4">
                    {data.comments.map((c) => {
                        const sug = data.suggestions[c.key];
                        const buf = buffer[c.key] || { edited: '', note: '' };
                        return (
                            <div key={c.key} className="bg-white rounded-2xl border border-gray-200 p-4">
                                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold uppercase text-gray-500">
                                            {c.reviewer_display_name} · {c.comment_kind === 'major' ? 'Major' : 'Minor'} · #{c.comment_index + 1}
                                        </span>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${STATUS_LABEL[c.status].cls}`}>
                                            {STATUS_LABEL[c.status].label}
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                                            visible: {c.visibility.toLowerCase().replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    {saving === c.key && <span className="text-[10px] text-gray-500">saving…</span>}
                                </div>

                                <div className="mb-3">
                                    <div className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">
                                        Original reviewer comment · read-only
                                    </div>
                                    <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-800 whitespace-pre-wrap">
                                        {c.original_text}
                                    </div>
                                </div>

                                {/* Agent suggestion */}
                                {sug && (sug.flags.length > 0 || sug.suggested_edit) && (
                                    <div className="mb-3 rounded border border-blue-200 bg-blue-50/60 p-2">
                                        <div className="text-[10px] font-bold uppercase text-blue-700 flex items-center gap-2 mb-1">
                                            Moderation Agent
                                            <span className="text-[9px] bg-blue-200 text-blue-800 rounded px-1 py-0.5">Suggestion</span>
                                        </div>
                                        {sug.flags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-1">
                                                {sug.flags.map((f, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold uppercase">
                                                        {f.replace(/_/g, ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {sug.reasons.map((r, i) => (
                                            <div key={i} className="text-[11px] text-gray-800">• {r}</div>
                                        ))}
                                        {sug.suggested_edit && (
                                            <div className="mt-2">
                                                <div className="text-[10px] font-bold uppercase text-blue-700 mb-0.5">Suggested softer wording</div>
                                                <div className="rounded border border-blue-200 bg-white p-2 text-sm text-gray-800 whitespace-pre-wrap">
                                                    {sug.suggested_edit}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBuffer((prev) => ({ ...prev, [c.key]: { ...(prev[c.key] || { edited: '', note: '' }), edited: sug.suggested_edit! } }));
                                                        patchRow(c, { edited_text: sug.suggested_edit! });
                                                    }}
                                                    className="mt-2 text-[11px] px-2 py-1 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                                >
                                                    Use suggested wording
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Edited text */}
                                <div className="mb-3">
                                    <div className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">
                                        Editor version (what the author will see)
                                    </div>
                                    <textarea
                                        value={buf.edited}
                                        onChange={(e) => setBuffer((prev) => ({ ...prev, [c.key]: { ...buf, edited: e.target.value } }))}
                                        onBlur={() => {
                                            const old = c.edited_text || '';
                                            if (buf.edited !== old) patchRow(c, { edited_text: buf.edited });
                                        }}
                                        rows={3}
                                        placeholder="Leave blank to send the reviewer's original wording. Type here to override."
                                        className="w-full border border-gray-300 rounded p-2 text-sm"
                                    />
                                </div>

                                {/* Editor note */}
                                <div className="mb-3">
                                    <div className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">
                                        Internal note (never shown to author)
                                    </div>
                                    <input
                                        type="text"
                                        value={buf.note}
                                        onChange={(e) => setBuffer((prev) => ({ ...prev, [c.key]: { ...buf, note: e.target.value } }))}
                                        onBlur={() => {
                                            const old = c.editor_note || '';
                                            if (buf.note !== old) patchRow(c, { editor_note: buf.note });
                                        }}
                                        placeholder="Optional note for the editorial record."
                                        className="w-full border border-gray-300 rounded p-2 text-sm"
                                    />
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-2">
                                    <StatusButton label="Approve as written" tone="emerald"
                                        active={c.status === 'EDITOR_APPROVED'}
                                        onClick={() => patchRow(c, { status: 'EDITOR_APPROVED', visibility: 'AUTHOR_VISIBLE' })}
                                    />
                                    <StatusButton label="Mark edited" tone="blue"
                                        active={c.status === 'EDITOR_EDITED'}
                                        onClick={() => patchRow(c, { status: 'EDITOR_EDITED', visibility: 'AUTHOR_VISIBLE' })}
                                    />
                                    <StatusButton label="Confidential" tone="slate"
                                        active={c.status === 'EDITOR_CONFIDENTIAL'}
                                        onClick={() => patchRow(c, { status: 'EDITOR_CONFIDENTIAL', visibility: 'CONFIDENTIAL' })}
                                    />
                                    <StatusButton label="Remove" tone="rose"
                                        active={c.status === 'EDITOR_REMOVED'}
                                        onClick={() => patchRow(c, { status: 'EDITOR_REMOVED', visibility: 'REMOVED' })}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const StatusButton: React.FC<{
    label: string; tone: 'emerald' | 'blue' | 'slate' | 'rose'; active: boolean; onClick: () => void;
}> = ({ label, tone, active, onClick }) => {
    const styles = {
        emerald: 'bg-emerald-600 hover:bg-emerald-700',
        blue:    'bg-blue-600 hover:bg-blue-700',
        slate:   'bg-slate-600 hover:bg-slate-700',
        rose:    'bg-rose-700 hover:bg-rose-800',
    }[tone];
    return (
        <button
            type="button" onClick={onClick}
            className={
                'text-xs font-bold px-3 py-1.5 rounded-lg text-white ' +
                (active ? styles : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50')
            }
            style={active ? { color: '#fff' } : undefined}
        >
            {label}{active ? ' ✓' : ''}
        </button>
    );
};

export default EditorCommentModerationPage;
