import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { ACTION, Permission } from '../context/PermissionsContext';
import {
    DecisionBriefing,
    fetchDecisionBriefing,
    fetchLegalNextStates,
    fetchSubmissionTransitions,
    finaliseDecision,
    LegalNextStates,
    publishArticle,
    SubmissionTransition,
} from '../api/workflow';

/**
 * Editorial Decision Workspace — surfaces three server-side capabilities
 * that had no UI: the decision briefing, the state-machine transitions
 * log, and the RBAC-gated decision + publish buttons.
 *
 * Route: /editor/submissions/:submissionId/decision
 *
 * Once the state machine accepts the manuscript, the "Publish article"
 * action becomes reachable via the sibling DOI Management page — this
 * screen shows the shortcut inline once the acceptance transition has
 * fired.
 */
const EditorDecisionWorkspacePage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [briefing, setBriefing] = useState<DecisionBriefing | null>(null);
    const [legal, setLegal] = useState<LegalNextStates | null>(null);
    const [transitions, setTransitions] = useState<SubmissionTransition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState<null | 'accept' | 'reject' | 'minor_revision' | 'major_revision'>(null);
    const [comments, setComments] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState<null | 'accept' | 'reject' | 'minor_revision' | 'major_revision'>(null);
    const [articleId, setArticleId] = useState('');
    const [publishing, setPublishing] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [b, t, l] = await Promise.all([
                fetchDecisionBriefing(submissionId),
                fetchSubmissionTransitions(submissionId),
                fetchLegalNextStates(submissionId).catch(() => null),
            ]);
            setBriefing(b);
            setTransitions(t);
            setLegal(l);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Failed to load workspace.');
        } finally {
            setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => {
        if (submissionId) reload();
    }, [submissionId, reload]);

    const [overrideReason, setOverrideReason] = useState('');
    const [evidence, setEvidence] = useState('');

    const submit = async (decision: 'accept' | 'reject' | 'minor_revision' | 'major_revision') => {
        // If the editor picks a decision that differs from the AI's
        // suggestion, we require an override reason so the audit
        // trail carries "editor overrode AI, and here's why". Errors
        // surface inside the confirm dialog (``modalError``) so the
        // editor sees them — the top-of-page banner used to sit
        // behind the modal overlay, making the Confirm click look dead.
        const aiSuggested = briefing?.suggested_decision;
        const aiMapped = aiSuggested === 'rejected' ? 'reject'
                       : aiSuggested === 'accepted' ? 'accept'
                       : aiSuggested;
        const isOverride = !!aiMapped && aiMapped !== decision && aiMapped !== 'under_review';
        if (isOverride && !overrideReason.trim()) {
            setModalError(
                `You are choosing "${decision.replace(/_/g, ' ')}" — the AI suggested "${aiMapped}". ` +
                `Cancel this dialog, fill in the "Override reason" field below the decision buttons, then try again.`,
            );
            return;
        }
        setSubmitting(decision);
        setError(null);
        setModalError(null);
        try {
            const result = await finaliseDecision(submissionId, decision, {
                comments: comments || undefined,
                override_reason: isOverride ? overrideReason.trim() : undefined,
                ai_suggested: aiMapped || undefined,
                evidence: evidence || undefined,
            });
            setToast(
                result.override_recorded
                    ? `Decision finalised (override recorded) — submission moved to ${result.new_status}.`
                    : `Decision finalised — submission moved to ${result.new_status}.`,
            );
            setOverrideReason('');
            setEvidence('');
            setConfirmOpen(null);
            reload();
        } catch (e: any) {
            // Failure lands inside the modal too — the top banner is
            // covered by the overlay, so an editor would otherwise not
            // realise the request errored.
            setModalError(e?.response?.data?.detail || e?.message || 'Decision failed.');
        } finally {
            setSubmitting(null);
        }
    };

    const doPublish = async () => {
        const id = Number(articleId);
        if (!(id > 0)) {
            setError('Enter the article id first.');
            return;
        }
        setPublishing(true);
        setError(null);
        try {
            const res = await publishArticle(id);
            setToast(`Article #${res.article_id} published. DOI: ${res.doi || '—'}`);
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Publish failed.');
        } finally {
            setPublishing(false);
        }
    };

    const recCounts = briefing?.recommendations;
    const suggestion = briefing?.suggested_decision;

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <BackButton className="mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <span aria-hidden>⚖️</span> Editorial Decision Workspace
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                    Submission <span className="font-mono">{submissionId}</span>
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

                {loading ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm">Loading…</div>
                ) : briefing ? (
                    <>
                        {/* ── Reviewer signal ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Reviewer signal</h2>
                            <div className="grid grid-cols-4 gap-3 mb-4">
                                <RecTile label="Accept"          count={recCounts?.accept ?? 0}          tone="emerald" />
                                <RecTile label="Minor revision"  count={recCounts?.minor_revision ?? 0}  tone="amber" />
                                <RecTile label="Major revision"  count={recCounts?.major_revision ?? 0}  tone="orange" />
                                <RecTile label="Reject"          count={recCounts?.reject ?? 0}          tone="rose" />
                            </div>
                            <p className="text-sm text-gray-700">
                                <span className="text-gray-500">Reviews received:</span> {briefing.reviews_received}
                                {' / '}{briefing.reviews_expected}
                                {briefing.ethics_flags > 0 && (
                                    <span className="ml-3 text-rose-700 font-medium">
                                        ⚠️ {briefing.ethics_flags} ethics {briefing.ethics_flags === 1 ? 'flag' : 'flags'}
                                    </span>
                                )}
                            </p>
                        </section>

                        {/* ── AI briefing ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">AI briefing</h2>
                                <span
                                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                        briefing.confidence === 'high'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : briefing.confidence === 'medium'
                                            ? 'bg-amber-100 text-amber-900'
                                            : 'bg-gray-100 text-gray-700'
                                    }`}
                                    title="Deterministic confidence — high = all reviews in and unanimous, medium = clear majority, low = split or partial"
                                >
                                    Confidence: {briefing.confidence}
                                </span>
                            </div>
                            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                                <p className="text-xs text-blue-800 mb-1 font-semibold uppercase tracking-wider">Suggested decision</p>
                                <p className="text-lg font-bold text-blue-900">
                                    {suggestion?.replace(/_/g, ' ')}
                                </p>
                                <p className="text-sm text-blue-800 mt-1">{briefing.suggestion_reason}</p>
                                <p className="text-xs text-blue-700 mt-2 italic">
                                    Consensus: {briefing.consensus.replace(/_/g, ' ')} — the editor makes the authoritative call.
                                </p>
                            </div>
                            {briefing.common_concerns.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Concerns from reviewers</p>
                                    <ul className="space-y-1.5">
                                        {briefing.common_concerns.slice(0, 8).map((c, i) => (
                                            <li key={i} className="text-sm text-gray-700 border-l-2 border-gray-200 pl-3">
                                                <span className="text-xs text-gray-500">{c.reviewer}</span>
                                                <p className="mt-0.5">{c.concern}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>

                        {/* ── Editor's decision ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Editor's decision</h2>
                            <label className="block text-sm mb-3">
                                <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Comments (optional)</span>
                                <textarea
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    rows={3}
                                    placeholder="Notes recorded on the transition audit row."
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm mb-3">
                                <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                    Supporting evidence (optional)
                                </span>
                                <textarea
                                    value={evidence}
                                    onChange={(e) => setEvidence(e.target.value)}
                                    rows={2}
                                    placeholder='e.g. "Reviewer 2, paragraph 3 on dataset size" or an excerpt anchoring the call.'
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                            <label className="block text-sm mb-3">
                                <span className="block text-xs font-bold uppercase tracking-wider text-amber-800 mb-1.5">
                                    Override reason
                                    <span className="ml-2 text-[10px] font-normal text-gray-500 normal-case">
                                        required only when choosing a different decision than the AI suggested
                                    </span>
                                </span>
                                <textarea
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    rows={2}
                                    placeholder="Why the editorial call differs from the AI suggestion (lands in the audit log)."
                                    className="w-full border border-amber-200 bg-amber-50/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </label>
                            {/* Source of truth: backend ``can_finalise`` field on the
                                briefing. Same check as the Permission guard but keeps
                                the answer in one place so the two can't drift. */}
                            {!briefing.can_finalise ? (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                    🔒 Your role lacks FINAL_DECISION — you can review the briefing but not finalise.
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    <DecisionBtn
                                        label="Accept" tone="emerald"
                                        onClick={() => { setModalError(null); setConfirmOpen('accept'); }}
                                        busy={submitting === 'accept'}
                                        disabled={submitting !== null || (legal ? !legal.decisions_allowed.accept : false)}
                                        title={legal && !legal.decisions_allowed.accept ? `Illegal from '${legal.current}'` : undefined}
                                    />
                                    <DecisionBtn
                                        label="Minor revision" tone="amber"
                                        onClick={() => { setModalError(null); setConfirmOpen('minor_revision'); }}
                                        busy={submitting === 'minor_revision'}
                                        disabled={submitting !== null || (legal ? !legal.decisions_allowed.minor_revision : false)}
                                        title={legal && !legal.decisions_allowed.minor_revision ? `Illegal from '${legal.current}'` : undefined}
                                    />
                                    <DecisionBtn
                                        label="Major revision" tone="orange"
                                        onClick={() => { setModalError(null); setConfirmOpen('major_revision'); }}
                                        busy={submitting === 'major_revision'}
                                        disabled={submitting !== null || (legal ? !legal.decisions_allowed.major_revision : false)}
                                        title={legal && !legal.decisions_allowed.major_revision ? `Illegal from '${legal.current}'` : undefined}
                                    />
                                    <DecisionBtn
                                        label="Reject" tone="rose"
                                        onClick={() => { setModalError(null); setConfirmOpen('reject'); }}
                                        busy={submitting === 'reject'}
                                        disabled={submitting !== null || (legal ? !legal.decisions_allowed.reject : false)}
                                        title={legal && !legal.decisions_allowed.reject ? `Illegal from '${legal.current}'` : undefined}
                                    />
                                    <DecisionBtn
                                        label="Reject & Resubmit" tone="rose"
                                        onClick={() => { setModalError(null); setConfirmOpen('reject_and_resubmit' as any); }}
                                        busy={submitting === ('reject_and_resubmit' as any)}
                                        disabled={submitting !== null || (legal ? !legal.decisions_allowed.reject_and_resubmit : false)}
                                        title={
                                            legal && !legal.decisions_allowed.reject_and_resubmit
                                                ? `Illegal from '${legal.current}'`
                                                : 'Terminates this submission but invites the author to submit a substantially revised version as a new manuscript.'
                                        }
                                    />
                                </div>
                            )}
                            {legal && (
                                <p className="text-xs text-gray-500 mt-3">
                                    Current state: <span className="font-mono">{legal.current}</span>.
                                    Legal next: <span className="font-mono">{legal.legal_next_states.join(', ') || '[terminal]'}</span>.
                                </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                The state machine enforces legal transitions. A rejected manuscript can never move back to accepted.
                            </p>
                        </section>

                        {/* ── Publication shortcut ── */}
                        <Permission action={ACTION.PUBLISH}>
                            <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Publish (post-acceptance)</h2>
                                <p className="text-xs text-gray-500 mb-3">
                                    Once the manuscript is accepted, a DOI is assigned, and Crossref registration succeeds, the article can be flipped to published. Requires PUBLISH permission.
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={articleId}
                                        onChange={(e) => setArticleId(e.target.value)}
                                        placeholder="Article id"
                                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={doPublish}
                                        disabled={publishing || !articleId}
                                        className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:bg-gray-300"
                                    >
                                        {publishing ? 'Publishing…' : 'Publish article'}
                                    </button>
                                </div>
                            </section>
                        </Permission>

                        {/* ── Transitions log ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">State transitions</h2>
                            {transitions.length === 0 ? (
                                <p className="text-sm text-gray-500">No transitions recorded.</p>
                            ) : (
                                <ol className="space-y-2">
                                    {transitions.map((t) => (
                                        <li key={t.id} className={`text-sm flex items-start gap-2 border-l-2 pl-3 ${t.allowed ? 'border-emerald-300' : 'border-rose-400'}`}>
                                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${t.allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                {t.allowed ? 'OK' : 'REFUSED'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-gray-800">
                                                    {t.from_status ?? '—'} <span aria-hidden>→</span> {t.to_status}
                                                </p>
                                                {t.reason && <p className="text-xs text-gray-600 mt-0.5">{t.reason}</p>}
                                                <p className="text-[10px] text-gray-400">
                                                    {new Date(t.performed_at).toLocaleString()}
                                                    {t.performed_by_email && ` · ${t.performed_by_email}`}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </>
                ) : null}
            </div>

            {/* Confirmation dialog */}
            {confirmOpen && briefing && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            Confirm decision: {confirmOpen.replace(/_/g, ' ')}
                        </h3>
                        <p className="text-sm text-gray-700">
                            The state machine will attempt to move submission <span className="font-mono">{submissionId}</span>{' '}
                            to <strong>{confirmOpen}</strong>. This action is audit-logged.
                        </p>
                        {confirmOpen === 'reject' && (
                            <p className="text-xs text-rose-700 mt-2 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                                Rejection is terminal — no further transitions are permitted.
                            </p>
                        )}
                        {modalError && (
                            <div role="alert" className="mt-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                {modalError}
                            </div>
                        )}
                        <div className="mt-5 flex justify-end gap-2">
                            <button onClick={() => { setConfirmOpen(null); setModalError(null); }} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
                            <button
                                onClick={() => submit(confirmOpen)}
                                disabled={submitting !== null}
                                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${
                                    confirmOpen === 'reject' ? 'bg-rose-700 hover:bg-rose-800' :
                                    confirmOpen === 'accept' ? 'bg-emerald-700 hover:bg-emerald-800' :
                                    'bg-amber-700 hover:bg-amber-800'
                                } disabled:bg-gray-300`}
                            >
                                {submitting ? 'Working…' : `Confirm ${confirmOpen.replace(/_/g, ' ')}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const RecTile: React.FC<{ label: string; count: number; tone: 'emerald' | 'amber' | 'orange' | 'rose' }> = ({ label, count, tone }) => {
    const styles = {
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        amber:   'bg-amber-50 border-amber-200 text-amber-900',
        orange:  'bg-orange-50 border-orange-200 text-orange-900',
        rose:    'bg-rose-50 border-rose-200 text-rose-900',
    }[tone];
    return (
        <div className={`rounded-lg border p-3 ${styles}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-2xl font-bold mt-1">{count}</p>
        </div>
    );
};

const DecisionBtn: React.FC<{
    label: string;
    tone: 'emerald' | 'amber' | 'orange' | 'rose';
    onClick: () => void;
    busy: boolean;
    disabled: boolean;
    title?: string;
}> = ({ label, tone, onClick, busy, disabled, title }) => {
    const styles = {
        emerald: 'bg-emerald-700 hover:bg-emerald-800',
        amber:   'bg-amber-600 hover:bg-amber-700',
        orange:  'bg-orange-600 hover:bg-orange-700',
        rose:    'bg-rose-700 hover:bg-rose-800',
    }[tone];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${styles} disabled:bg-gray-300 disabled:cursor-not-allowed`}
        >
            {busy ? 'Working…' : label}
        </button>
    );
};

export default EditorDecisionWorkspacePage;
