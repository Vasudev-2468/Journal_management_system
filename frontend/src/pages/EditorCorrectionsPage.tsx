import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import {
    ArticleNotice,
    fetchArticleNotices,
    publishCorrection,
    publishRetraction,
} from '../api/corrections';
import { ACTION, Permission } from '../context/PermissionsContext';

/**
 * Editor page for publishing corrections + retractions on a published
 * article. The compose form respects RBAC — the Retract tab is only
 * rendered when the caller carries RETRACT_ARTICLE.
 *
 * Route: /editor/articles/:articleId/corrections
 */
const EditorCorrectionsPage: React.FC = () => {
    const { articleId = '' } = useParams<{ articleId: string }>();
    const numericId = Number(articleId);

    const [notices, setNotices] = useState<ArticleNotice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'correction' | 'retraction'>('correction');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchArticleNotices(numericId);
            setNotices(data);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Failed to load notices.');
        } finally {
            setLoading(false);
        }
    }, [numericId]);

    useEffect(() => {
        if (numericId > 0) reload();
    }, [numericId, reload]);

    const submit = async () => {
        if (!title.trim() || !description.trim()) {
            setError('Title and description are both required.');
            return;
        }
        if (mode === 'retraction' && !reason.trim()) {
            setError('Retraction reason is required — COPE-aligned code recommended.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            if (mode === 'correction') {
                await publishCorrection(numericId, { title: title.trim(), description: description.trim() });
            } else {
                await publishRetraction(numericId, {
                    title: title.trim(),
                    description: description.trim(),
                    reason: reason.trim(),
                });
            }
            setTitle('');
            setDescription('');
            setReason('');
            setToast(mode === 'correction' ? 'Correction published.' : 'Retraction published.');
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Publication failed.');
        } finally {
            setSubmitting(false);
        }
    };

    const alreadyRetracted = notices.some((n) => n.notice_type === 'retraction');

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <BackButton className="mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span aria-hidden>📝</span> Post-publication notices
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                    Article <span className="font-mono">#{articleId}</span> · corrections and retractions
                </p>

                {error && (
                    <div role="alert" className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                {toast && (
                    <div role="status" className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span>{toast}</span>
                        <button onClick={() => setToast(null)} className="text-emerald-700 hover:underline text-xs">Dismiss</button>
                    </div>
                )}

                {/* Compose */}
                <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm mb-4" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === 'correction'}
                            onClick={() => setMode('correction')}
                            className={`px-3 py-1.5 rounded-md font-medium ${
                                mode === 'correction' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            📝 Correction
                        </button>
                        <Permission action={ACTION.RETRACT_ARTICLE}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'retraction'}
                                onClick={() => setMode('retraction')}
                                disabled={alreadyRetracted}
                                title={alreadyRetracted ? 'This article is already retracted.' : ''}
                                className={`px-3 py-1.5 rounded-md font-medium ${
                                    mode === 'retraction' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                ⚠️ Retraction
                            </button>
                        </Permission>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm">
                            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Notice title *</span>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={mode === 'correction' ? 'Correction: Figure 3 caption swap' : 'Retraction: [Original article title]'}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                {mode === 'correction' ? 'Correction body *' : 'Retraction body *'}
                            </span>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={6}
                                placeholder={
                                    mode === 'correction'
                                        ? 'Describe what was corrected, where it was located, and the corrected value.'
                                        : 'Full retraction statement — will be shown prominently on the article page.'
                                }
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        {mode === 'retraction' && (
                            <label className="block text-sm">
                                <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Reason *</span>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="fabrication / plagiarism / redundant_publication / ethical_violation / …"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="mt-1 block text-[11px] text-gray-500">
                                    COPE-aligned codes are recommended. Free text is accepted for other cases.
                                </span>
                            </label>
                        )}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                            Retractions never delete the original article — the notice is displayed alongside it.
                        </p>
                        <Permission
                            action={mode === 'correction' ? ACTION.CORRECT_ARTICLE : ACTION.RETRACT_ARTICLE}
                            fallback={
                                <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                    🔒 Your role lacks {mode === 'correction' ? 'CORRECT_ARTICLE' : 'RETRACT_ARTICLE'}
                                </span>
                            }
                        >
                            <button
                                type="button"
                                onClick={submit}
                                disabled={submitting || (mode === 'retraction' && alreadyRetracted)}
                                className={`px-5 py-2 rounded-lg text-white text-sm font-semibold ${
                                    mode === 'correction' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-rose-700 hover:bg-rose-800'
                                } disabled:bg-gray-300 disabled:cursor-not-allowed`}
                            >
                                {submitting ? 'Publishing…' : mode === 'correction' ? 'Publish correction' : 'Publish retraction'}
                            </button>
                        </Permission>
                    </div>
                </section>

                {/* Existing notices */}
                <section className="bg-white border border-gray-200 rounded-2xl p-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Published notices</h2>
                    {loading ? (
                        <p className="text-sm text-gray-500">Loading…</p>
                    ) : notices.length === 0 ? (
                        <p className="text-sm text-gray-500">No corrections or retractions on this article.</p>
                    ) : (
                        <ul className="space-y-3">
                            {notices.map((n) => (
                                <li key={n.id} className="border-l-4 pl-4"
                                    style={{ borderColor: n.notice_type === 'retraction' ? '#e11d48' : '#1d4ed8' }}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                            n.notice_type === 'retraction' ? 'bg-rose-100 text-rose-800' :
                                            n.notice_type === 'expression_of_concern' ? 'bg-amber-100 text-amber-900' :
                                            'bg-blue-100 text-blue-800'
                                        }`}>
                                            {n.notice_type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-sm font-semibold text-gray-900">{n.title}</span>
                                        <span className="text-xs text-gray-400 ml-auto">
                                            {new Date(n.published_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{n.description}</p>
                                    {n.reason && (
                                        <p className="text-xs text-rose-700 mt-1">Reason: <span className="font-mono">{n.reason}</span></p>
                                    )}
                                    {n.published_by_email && (
                                        <p className="text-[11px] text-gray-400 mt-1">by {n.published_by_email}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default EditorCorrectionsPage;
