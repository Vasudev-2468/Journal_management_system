import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BackButton from '../../components/common/BackButton';
import {
    AiAnalysis,
    CommentAssessment,
    RevisionAssessmentResponse,
    RevisionDecision,
    Verdict,
    fetchRevisionAssessment,
    submitRevisionDecision,
} from '../../api/revisionAssessment';

/*
 * Editor Revision Assessment (JG-Editor-Rev).
 *
 * Lands the editor on a single page after the author resubmits. It
 * shows:
 *   - the original + revised manuscript files
 *   - the AI Revision Analysis (deterministic per-comment addressed /
 *     partial / unresolved rollup — no LLM)
 *   - every reviewer comment paired with the author's response and the
 *     agent's verdict
 *   - a decision panel with the four allowed outcomes:
 *     Accept, Send for Re-Review, Request Further Revision, Reject.
 *
 * The AI is triage-only; the editor makes the authoritative decision
 * and the backend enforces the state-machine transition.
 */

const VERDICT_STYLES: Record<Verdict, { chip: string; icon: string; label: string }> = {
    addressed:  { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '✓', label: 'Addressed' },
    partial:    { chip: 'bg-amber-100 text-amber-900 border-amber-200',        icon: '⚠', label: 'Partial' },
    unresolved: { chip: 'bg-rose-100 text-rose-800 border-rose-200',           icon: '✗', label: 'Unresolved' },
};

const DECISION_STYLES: Record<RevisionDecision, { label: string; tone: string; icon: string }> = {
    accept:               { label: 'Accept',                       tone: 'bg-emerald-600 hover:bg-emerald-700', icon: '🟢' },
    re_review_same:       { label: 'Send to Same Reviewers',       tone: 'bg-blue-600 hover:bg-blue-700',        icon: '🔁' },
    re_review_different:  { label: 'Send to Different Reviewers',  tone: 'bg-amber-600 hover:bg-amber-700',      icon: '🔄' },
    further_revision:     { label: 'Request Further Revision',     tone: 'bg-orange-600 hover:bg-orange-700',    icon: '🟠' },
    reject:               { label: 'Reject',                       tone: 'bg-rose-700 hover:bg-rose-800',        icon: '🔴' },
};

const fmtDate = (iso?: string | null) => iso
    ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

const EditorRevisionAssessmentPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const [data, setData] = useState<RevisionAssessmentResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Decision state
    const [decision, setDecision] = useState<RevisionDecision | ''>('');
    const [comments, setComments] = useState('');
    const [reviewerIds, setReviewerIds] = useState<Set<string>>(new Set());
    const [requiredChanges, setRequiredChanges] = useState<string[]>(['']);
    const [revisionDeadline, setRevisionDeadline] = useState('');
    const [rejectionCode, setRejectionCode] = useState('');
    // Re-review deadline window in days; the reviewer already knows the
    // paper, so 14 is the pragmatic default per the spec.
    const [reReviewDays, setReReviewDays] = useState(14);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        fetchRevisionAssessment(submissionId)
            .then((d) => setData(d))
            .catch((e: any) => setError(e?.response?.data?.detail || e?.message || 'Could not load assessment.'))
            .finally(() => setLoading(false));
    };
    useEffect(() => { if (submissionId) load(); }, [submissionId]);

    // Re-drive reviewer pre-selection off the picked decision so the
    // editor's choice controls the panel:
    //   Same reviewers   → previous panel pre-checked
    //   Different reviewers → cleared (editor picks from the Bid Room next)
    useEffect(() => {
        if (!data) return;
        if (decision === 're_review_same') {
            setReviewerIds(new Set(data.reviewer_pool.map((r) => r.reviewer_id)));
        } else if (decision === 're_review_different') {
            setReviewerIds(new Set());
        }
    }, [decision, data]);

    const toggleReviewer = (id: string) => {
        setReviewerIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const updateChange = (i: number, v: string) => {
        setRequiredChanges((prev) => prev.map((c, idx) => (idx === i ? v : c)));
    };
    const addChange = () => setRequiredChanges((prev) => [...prev, '']);
    const removeChange = (i: number) => setRequiredChanges((prev) => prev.filter((_, idx) => idx !== i));

    const canSubmit = useMemo(() => {
        if (!decision) return false;
        if (decision === 're_review_same' || decision === 're_review_different') {
            return reviewerIds.size >= 2;
        }
        if (decision === 'further_revision') return requiredChanges.some((c) => c.trim().length > 0);
        if (decision === 'reject') return comments.trim().length > 0;
        return true;
    }, [decision, reviewerIds, requiredChanges, comments]);

    const doSubmit = async () => {
        if (!decision || !canSubmit) return;
        if (!window.confirm(`Confirm decision: ${DECISION_STYLES[decision].label}?`)) return;
        setSubmitting(true); setError(null); setToast(null);
        try {
            const body: any = {
                decision,
                editor_comments: comments.trim() || undefined,
            };
            if (decision === 're_review_same' || decision === 're_review_different') {
                body.reviewer_ids = Array.from(reviewerIds);
                body.re_review_deadline_days = reReviewDays;
            }
            if (decision === 'further_revision') {
                body.required_changes = requiredChanges.map((c) => c.trim()).filter(Boolean);
                if (revisionDeadline) body.revision_deadline = revisionDeadline;
            }
            if (decision === 'reject') body.rejection_reason_code = rejectionCode || undefined;
            const res = await submitRevisionDecision(submissionId, body);
            setToast(`Decision recorded — submission moved to ${res.new_status}.`);
            // Bounce back to the dashboard workspace after a moment.
            setTimeout(() => navigate('/editor'), 1600);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Decision failed.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-50 p-8"><div className="text-sm text-gray-500">Loading assessment…</div></div>;
    if (error || !data) return (
        <div className="min-h-screen bg-gray-50 p-8">
            <BackButton className="mb-4" />
            <div className="max-w-3xl mx-auto rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                {error || 'Not found.'}
            </div>
        </div>
    );

    const ai = data.ai_analysis;
    const originalVer = data.versions.find((v) => v.version_number === 1) || data.versions[0];
    const revisedVer = data.versions.find((v) => v.is_current) || data.versions[data.versions.length - 1];

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />

                {/* Header */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Revision Assessment</div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">{data.paper_title}</h1>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="font-mono text-gray-500">{data.paper_id_code || data.submission_id.slice(0, 8)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">Round {ai.round_number || data.round_number}</span>
                        {data.previous_decision && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                                Previous: {data.previous_decision.replace(/_/g, ' ')}
                            </span>
                        )}
                        {data.submitted_at && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                Submitted {fmtDate(data.submitted_at)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Manuscript files */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-3">Manuscript files</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <VersionCard title="Original" version={originalVer} />
                        <VersionCard title="Revised" version={revisedVer} highlight />
                    </div>
                </div>

                {/* AI Revision Analysis */}
                <div className="bg-white rounded-2xl border border-blue-200 p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs uppercase tracking-widest text-blue-700 font-bold flex items-center gap-2">
                            AI Revision Analysis
                            <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agent</span>
                        </div>
                        <div className="text-[11px] text-gray-500 italic">Deterministic triage. The editor decides.</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <StatTile label="Addressed"  value={ai.totals.addressed}  tone="emerald" />
                        <StatTile label="Partial"    value={ai.totals.partial}    tone="amber" />
                        <StatTile label="Unresolved" value={ai.totals.unresolved} tone="rose" />
                    </div>
                    {ai.flags.length > 0 && (
                        <ul className="space-y-1 mb-3">
                            {ai.flags.map((f, i) => (
                                <li key={i} className="text-xs text-gray-800 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5">
                                    <span aria-hidden>⚠</span>
                                    <span>{f}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Per-reviewer, per-comment cards */}
                {ai.per_reviewer.map((rev) => (
                    <div key={rev.review_id} className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="text-sm font-black text-gray-900">{rev.reviewer_display_name}</div>
                            <div className="flex gap-1 text-[11px]">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                                    ✓ {rev.addressed}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                                    ⚠ {rev.partial}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                    ✗ {rev.unresolved}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {rev.comments.length === 0 ? (
                                <div className="text-xs text-gray-500 italic">No structured comments to compare.</div>
                            ) : (
                                rev.comments.map((c) => <CommentRow key={`${c.review_id}-${c.comment_kind}-${c.comment_index}`} c={c} />)
                            )}
                        </div>
                    </div>
                ))}

                {/* Decision panel */}
                <div className="bg-white rounded-2xl border-2 border-gray-300 p-5 mb-4 shadow">
                    <div className="text-sm font-black text-gray-900 mb-3">Editorial Decision</div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                        {(Object.entries(DECISION_STYLES) as [RevisionDecision, typeof DECISION_STYLES[RevisionDecision]][]).map(([key, spec]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setDecision(key)}
                                className={
                                    'text-left px-4 py-3 rounded-xl border-2 transition ' +
                                    (decision === key
                                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                        : 'border-gray-200 hover:border-gray-300 bg-white')
                                }
                            >
                                <div className="flex items-center gap-2">
                                    <span aria-hidden className="text-xl">{spec.icon}</span>
                                    <span className="font-bold text-gray-900">{spec.label}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{decisionBlurb(key)}</div>
                            </button>
                        ))}
                    </div>

                    {/* Editor comments */}
                    <label className="block text-sm mb-3">
                        <span className="block text-gray-700 font-semibold mb-1">Editor comments</span>
                        <textarea
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            rows={4}
                            placeholder={decision === 'reject' ? 'Required for rejection — explain why the revision was not accepted.' : 'Optional editorial comments.'}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                    </label>

                    {/* Branch-specific sub-form */}
                    {(decision === 're_review_same' || decision === 're_review_different') && (
                        <ReReviewerPicker
                            variant={decision}
                            pool={data.reviewer_pool}
                            selected={reviewerIds}
                            onToggle={toggleReviewer}
                            deadlineDays={reReviewDays}
                            onDeadlineDaysChange={setReReviewDays}
                        />
                    )}
                    {decision === 'further_revision' && (
                        <FurtherRevisionForm
                            changes={requiredChanges}
                            deadline={revisionDeadline}
                            onChange={updateChange}
                            onAdd={addChange}
                            onRemove={removeChange}
                            onDeadlineChange={setRevisionDeadline}
                        />
                    )}
                    {decision === 'reject' && (
                        <RejectReason value={rejectionCode} onChange={setRejectionCode} />
                    )}

                    {/* Confirm */}
                    <div className="mt-5 flex items-center justify-end gap-2">
                        {toast && <span className="text-sm text-emerald-800 mr-auto">{toast}</span>}
                        {error && <span className="text-sm text-rose-800 mr-auto">{error}</span>}
                        <button
                            type="button"
                            disabled={!canSubmit || submitting}
                            onClick={doSubmit}
                            className={
                                'px-5 py-2.5 rounded-xl text-sm font-bold text-white ' +
                                (decision ? DECISION_STYLES[decision].tone : 'bg-gray-300') +
                                ' disabled:opacity-50 disabled:cursor-not-allowed'
                            }
                        >
                            {submitting ? 'Submitting…' : decision ? `Confirm ${DECISION_STYLES[decision].label}` : 'Select a decision'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Small helpers ─────────────────────────────────────────

const decisionBlurb = (d: RevisionDecision): string => ({
    accept:               'The author has satisfactorily addressed the reviewer concerns.',
    re_review_same:       'Send the revised manuscript to the previous panel for another round.',
    re_review_different:  'Send to a different panel — original reviewers unavailable or COI discovered.',
    further_revision:     'Return to the author with a specific list of remaining changes.',
    reject:               'The revised manuscript still has fundamental problems.',
}[d]);

const StatTile: React.FC<{ label: string; value: number; tone: 'emerald' | 'amber' | 'rose' }> = ({ label, value, tone }) => {
    const styles = {
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        amber:   'bg-amber-50 border-amber-200 text-amber-900',
        rose:    'bg-rose-50 border-rose-200 text-rose-900',
    }[tone];
    return (
        <div className={`rounded-lg border p-3 ${styles}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
            <div className="text-2xl font-bold mt-0.5">{value}</div>
        </div>
    );
};

const VersionCard: React.FC<{
    title: string;
    version?: RevisionAssessmentResponse['versions'][number];
    highlight?: boolean;
}> = ({ title, version, highlight }) => {
    if (!version) {
        return (
            <div className="rounded-lg border border-dashed border-gray-200 p-4 text-xs text-gray-500 text-center">
                {title} — not on record
            </div>
        );
    }
    return (
        <div className={`rounded-lg border p-3 ${highlight ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-gray-50'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                {title} · v{version.version_number} · {version.label}
            </div>
            {version.files.length === 0 ? (
                <div className="text-xs text-gray-500">No files.</div>
            ) : (
                <ul className="space-y-1">
                    {version.files.map((f) => (
                        <li key={f.id} className="flex items-center gap-2 text-xs">
                            <span aria-hidden>📎</span>
                            <a href={f.stored_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate">
                                {f.original_filename}
                            </a>
                            <span className="text-[10px] text-gray-500 uppercase">{f.kind}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const CommentRow: React.FC<{ c: CommentAssessment }> = ({ c }) => {
    const v = VERDICT_STYLES[c.ai_verdict];
    return (
        <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {c.comment_kind === 'major' ? 'Major' : 'Minor'} · #{c.comment_index + 1}
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${v.chip}`}>
                    {v.icon} {v.label}
                </span>
            </div>
            <div className="mb-2">
                <div className="text-[10px] font-bold uppercase text-gray-500">Comment</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{c.comment_text}</div>
            </div>
            <div className="mb-2">
                <div className="text-[10px] font-bold uppercase text-gray-500">Author response</div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                    {c.response_text || <span className="text-rose-700 italic">No response recorded.</span>}
                </div>
                {c.change_location && (
                    <div className="text-[11px] font-mono text-gray-500 mt-1">📍 {c.change_location}</div>
                )}
            </div>
            <div className="text-[11px] text-gray-500 italic">{c.verdict_reason}</div>
        </div>
    );
};

const ReReviewerPicker: React.FC<{
    variant: 're_review_same' | 're_review_different';
    pool: { reviewer_id: string; name: string; email: string; reviewed_before: boolean }[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    deadlineDays: number;
    onDeadlineDaysChange: (n: number) => void;
}> = ({ variant, pool, selected, onToggle, deadlineDays, onDeadlineDaysChange }) => {
    const isSame = variant === 're_review_same';
    return (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 space-y-3">
            <div>
                <div className="text-xs font-bold text-gray-700 mb-1">
                    {isSame ? 'Same reviewers as Round 1' : 'Different reviewers for Round 2'}
                </div>
                <div className="text-[11px] text-gray-500 mb-2">
                    {isSame
                        ? 'Previous panel pre-checked. Uncheck anyone who is unavailable; add fresh reviewers from the Bid Room if you need to backfill.'
                        : 'Previous panel cleared. Add fresh reviewers from the Bid Room after this decision; then come back and re-check the ones you want.'}
                </div>
                {pool.length === 0 ? (
                    <div className="text-xs text-gray-500 italic">
                        No reviewers on file for this manuscript — use the Bid Room to assign fresh reviewers.
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {pool.map((r) => (
                            <li key={r.reviewer_id} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={selected.has(r.reviewer_id)}
                                    onChange={() => onToggle(r.reviewer_id)}
                                    id={`rv-${r.reviewer_id}`}
                                />
                                <label htmlFor={`rv-${r.reviewer_id}`} className="cursor-pointer">
                                    <span className="font-semibold text-gray-900">{r.name}</span>
                                    <span className="text-xs text-gray-500 ml-2">{r.email}</span>
                                    {r.reviewed_before && (
                                        <span className="ml-2 text-[10px] font-bold uppercase bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                                            Previous round
                                        </span>
                                    )}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>
                <div className="text-xs font-bold text-gray-700 mb-1">Re-review window</div>
                <div className="flex flex-wrap gap-1">
                    {[7, 14, 21, 30].map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => onDeadlineDaysChange(d)}
                            className={
                                'px-3 py-1 rounded-lg text-xs font-semibold border ' +
                                (deadlineDays === d
                                    ? 'bg-blue-700 text-white border-blue-700'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                            }
                        >
                            {d} days
                        </button>
                    ))}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                    Re-reviewers already know the paper — 14 days is the common default.
                </div>
            </div>
            <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900">
                Round 1 review rows are preserved. This creates fresh Round {'≥ 2'} rows so both reports live side by side in the audit trail.
            </div>
        </div>
    );
};

const FurtherRevisionForm: React.FC<{
    changes: string[];
    deadline: string;
    onChange: (i: number, v: string) => void;
    onAdd: () => void;
    onRemove: (i: number) => void;
    onDeadlineChange: (v: string) => void;
}> = ({ changes, deadline, onChange, onAdd, onRemove, onDeadlineChange }) => (
    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
        <div className="text-xs font-bold text-gray-700 mb-2">Required changes</div>
        <ol className="space-y-2">
            {changes.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-6 pt-2">{i + 1}.</span>
                    <input
                        type="text"
                        value={c}
                        onChange={(e) => onChange(i, e.target.value)}
                        placeholder={`Change ${i + 1}`}
                        className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                    {changes.length > 1 && (
                        <button type="button" onClick={() => onRemove(i)} className="text-xs text-rose-600 hover:text-rose-800 font-semibold">
                            Remove
                        </button>
                    )}
                </li>
            ))}
        </ol>
        <button type="button" onClick={onAdd} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">
            + Add change
        </button>
        <label className="block text-sm mt-3">
            <span className="block text-gray-700 font-semibold mb-1">Revision deadline</span>
            <input
                type="date"
                value={deadline}
                onChange={(e) => onDeadlineChange(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
        </label>
    </div>
);

const REJECT_REASONS: { code: string; label: string }[] = [
    { code: 'concerns_unresolved',   label: 'Major concerns remain unresolved' },
    { code: 'methodology',            label: 'Methodological problems' },
    { code: 'response_insufficient',  label: 'Insufficient response to reviewers' },
    { code: 'scope',                  label: 'Scope issues' },
    { code: 'ethics',                 label: 'Ethical concerns' },
    { code: 'novelty',                label: 'Insufficient novelty' },
    { code: 'other',                  label: 'Other (see editor comments)' },
];

const RejectReason: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <fieldset className="rounded-lg border border-gray-200 p-3 bg-gray-50">
        <legend className="text-xs font-bold text-gray-700 px-1">Rejection reason</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
            {REJECT_REASONS.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                        type="radio"
                        name="reject-reason"
                        checked={value === r.code}
                        onChange={() => onChange(r.code)}
                    />
                    <span>{r.label}</span>
                </label>
            ))}
        </div>
    </fieldset>
);

export default EditorRevisionAssessmentPage;
