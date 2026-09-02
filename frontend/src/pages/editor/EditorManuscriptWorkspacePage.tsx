import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    fetchReviewerReports,
    fetchReviewerConsensus,
    submitDecision,
    draftDecisionLetter,
    openReviewRound,
    fetchReviewers,
    suggestReviewers,
    fetchSubmissionStatus,
    runDuplicateCheck,
    runPanelBalance,
    runCrossRoundConsistency,
    runReviewerBiasCheck,
    fetchHandlingEditor,
    assignHandlingEditor,
    fetchEditorMe,
} from '../../api/editor';
import client from '../../api/client';

/*
 * Editor Manuscript Workspace — spec §3, §12.
 *
 * One unified page per manuscript, with a tab strip along the top:
 *
 *   Submission | Reviewers | Reviewer Reports | Decision | History | Files | Communication
 *
 * The Reviewer Reports tab shows:
 *   • Progress ribbon (N of M reviews received)
 *   • Recommendation Summary bar chart (spec §5)
 *   • Consensus indicator badge — Strong / Reviewer Majority / Mixed (spec §6)
 *   • AI Review Summary card with a plain-language disclaimer (spec §11)
 *   • Per-reviewer cards with emoji-coded recommendation pill and counts
 *
 * The Decision tab shows:
 *   • Reviewer recommendations recap
 *   • Editorial Decision radios (Accept · Minor · Major · Reject · Reject and Resubmit)
 *   • Editor comments textarea
 *   • Generate Decision Letter (AI-assist) button → draft in a text panel the editor edits before Issue
 *   • Save Draft + Issue Decision buttons
 */

interface ReviewerReportRow {
    review_id: string;
    reviewer_display_name: string;
    state: string;
    recommendation?: string | null;
    confidence?: string | null;
    submitted_at?: string | null;
    counts: { major: number; minor: number; suggestions: number; annotations: number };
    ethics_flag: boolean;
    editor_summary: string;
}

interface ReviewerReportsResponse {
    submission_id: string;
    round: number;
    reviews: ReviewerReportRow[];
}

interface ConsensusCluster {
    seed: string;
    excerpts: Array<{ reviewer: string; review_id: string; text: string; kind: string }>;
    reviewer_count: number;
}

interface ConsensusResponse {
    submission_id: string;
    round: number;
    reviewer_count: number;
    recommendation_tally: Record<string, number>;
    consensus_recommendation?: string | null;
    consensus_strength: 'unanimous' | 'majority' | 'split' | 'n/a';
    per_reviewer: Array<{ reviewer_display_name: string; recommendation: string }>;
    common_concerns: ConsensusCluster[];
    positive_aspects: ConsensusCluster[];
    conflicting_signals: string[];
    ethics_flag_count: number;
    text_summary: string;
}

/* ── Recommendation visual system ───────────────────────── */

interface RecStyle { cls: string; label: string; emoji: string; bar: string; }

const REC_STYLES: Record<string, RecStyle> = {
    accept:              { cls: 'bg-emerald-100 text-emerald-800',       label: 'Accept',              emoji: '🟢', bar: 'bg-emerald-500' },
    minor_revision:      { cls: 'bg-blue-100 text-blue-800',             label: 'Minor Revision',      emoji: '🟡', bar: 'bg-blue-500' },
    major_revision:      { cls: 'bg-amber-100 text-amber-900',           label: 'Major Revision',      emoji: '🔶', bar: 'bg-amber-500' },
    reject:              { cls: 'bg-rose-100 text-rose-800',             label: 'Reject',              emoji: '🔴', bar: 'bg-rose-500' },
    reject_and_resubmit: { cls: 'bg-slate-200 text-slate-800',           label: 'Reject and Resubmit', emoji: '↻',  bar: 'bg-slate-500' },
    revision_requested:  { cls: 'bg-amber-100 text-amber-900',           label: 'Revision Requested',  emoji: '🔶', bar: 'bg-amber-500' },
};

const REC_ORDER = ['accept', 'minor_revision', 'major_revision', 'reject'] as const;

const RecPill: React.FC<{ rec?: string | null; className?: string }> = ({ rec, className = '' }) => {
    const style = rec ? REC_STYLES[rec] : null;
    if (!style) return <span className={`inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 ${className}`}>unspecified</span>;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${style.cls} ${className}`}>
            <span aria-hidden>{style.emoji}</span> {style.label.toUpperCase()}
        </span>
    );
};

/* ── Consensus badge — Strong / Reviewer Majority / Mixed ─ */

interface ConsensusBadge { icon: string; label: string; cls: string; }

const consensusBadge = (c: ConsensusResponse | null): ConsensusBadge | null => {
    if (!c || c.reviewer_count === 0) return null;
    // "Conflicting" — treat as a strict subset of "split" where both
    // Accept AND Reject/Major appear on the same paper.
    const tally = c.recommendation_tally;
    const strong = tally.accept || 0;
    const harsh = (tally.reject || 0) + (tally.major_revision || 0);
    if (strong > 0 && harsh > 0) {
        return { icon: '⚠', label: 'Conflicting Reviews', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (c.consensus_strength === 'unanimous') {
        return { icon: '✓', label: 'Strong Consensus', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (c.consensus_strength === 'majority') {
        return { icon: '✓', label: 'Reviewer Majority', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    return { icon: '⚠', label: 'Mixed Recommendations', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
};

/* ── Recommendation Summary bar chart (spec §5) ─────────── */

const RecommendationBars: React.FC<{ tally: Record<string, number>; total: number }> = ({ tally, total }) => {
    const max = Math.max(1, ...Object.values(tally));
    return (
        <div className="space-y-2">
            {REC_ORDER.map((k) => {
                const n = tally[k] || 0;
                const style = REC_STYLES[k];
                return (
                    <div key={k} className="flex items-center gap-3">
                        <div className="w-40 flex-shrink-0 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span aria-hidden>{style.emoji}</span> {style.label}
                        </div>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                            <div
                                className={`h-full rounded-full ${style.bar} transition-all`}
                                style={{ width: `${(100 * n) / max}%` }}
                            />
                        </div>
                        <div className="w-10 text-right text-sm font-bold text-gray-800">{n}</div>
                    </div>
                );
            })}
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold text-right mt-1">
                {total} report{total === 1 ? '' : 's'} received
            </div>
        </div>
    );
};

/* ── Formatting helpers ─────────────────────────────────── */

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
    });
};

/* ── Tabs ───────────────────────────────────────────────── */

type TabKey = 'submission' | 'reviewers' | 'reports' | 'decision' | 'history' | 'files' | 'communication';

const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'submission',    label: 'Submission' },
    { key: 'reviewers',     label: 'Reviewers' },
    { key: 'reports',       label: 'Reviewer Reports' },
    { key: 'decision',      label: 'Decision' },
    { key: 'history',       label: 'History' },
    { key: 'files',         label: 'Files' },
    { key: 'communication', label: 'Communication' },
];

/* ── Editorial-decision options ─────────────────────────── */

const DECISION_OPTIONS = [
    { value: 'accepted',            label: '🟢 Accept' },
    { value: 'minor_revision',      label: '🟡 Minor Revision' },
    { value: 'major_revision',      label: '🔶 Major Revision' },
    { value: 'rejected',            label: '🔴 Reject' },
    { value: 'reject_and_resubmit', label: '↻ Reject and Resubmit' },
];

const REJECT_REASON_OPTIONS = [
    { code: 'out_of_scope',         label: 'Out of scope' },
    { code: 'insufficient_novelty', label: 'Insufficient novelty' },
    { code: 'methodology_flawed',   label: 'Methodology flawed' },
    { code: 'inconclusive_results', label: 'Inconclusive results' },
    { code: 'poor_writing',         label: 'Poor writing' },
    { code: 'ethics_concern',       label: 'Ethics concern' },
    { code: 'plagiarism_suspected', label: 'Plagiarism suspected' },
    { code: 'duplicate_submission', label: 'Duplicate submission' },
];

const DECISION_LETTER_TEMPLATES: Array<{ id: string; name: string; body: (paperTitle: string) => string }> = [
    {
        id: 'accept_plain',
        name: 'Accept — plain',
        body: (t) => `Dear Author,\n\nWe are pleased to inform you that "${t}" has been accepted for publication. Congratulations. The production team will be in touch shortly regarding typesetting and proofs.\n\nSincerely,\nEditorial Office`,
    },
    {
        id: 'minor_rev_general',
        name: 'Minor Revision — general',
        body: (t) => `Dear Author,\n\nThank you for submitting "${t}". After careful consideration, we are prepared to accept the manuscript pending minor revisions in line with the reviewer comments. Please prepare a revised version together with a response letter addressing each point.\n\nSincerely,\nEditorial Office`,
    },
    {
        id: 'major_rev_general',
        name: 'Major Revision — general',
        body: (t) => `Dear Author,\n\nThank you for submitting "${t}". The reviewers have identified substantial concerns that require major revision. Please prepare a substantially revised manuscript addressing every concern raised, together with a detailed response letter.\n\nSincerely,\nEditorial Office`,
    },
    {
        id: 'reject_general',
        name: 'Reject — general',
        body: (t) => `Dear Author,\n\nThank you for submitting "${t}". After careful consideration of the reviewer reports, we regret that we cannot accept the manuscript for publication. Thank you for considering our journal; we wish you success in placing your work elsewhere.\n\nSincerely,\nEditorial Office`,
    },
];

/* ── Page ───────────────────────────────────────────────── */

export default function EditorManuscriptWorkspacePage() {
    const { submissionId = '' } = useParams();
    const navigate = useNavigate();

    const [rows, setRows] = useState<ReviewerReportsResponse | null>(null);
    const [consensus, setConsensus] = useState<ConsensusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>('reports');

    // Editorial decision state
    const [decision, setDecision] = useState<string>('');
    const [editorNote, setEditorNote] = useState<string>('');
    const [rejectReason, setRejectReason] = useState<string>('');
    const [letterDraft, setLetterDraft] = useState<string>('');
    const letterDraftKey = `editor-letter-draft:${submissionId}`;
    const [letterBusy, setLetterBusy] = useState(false);
    const [issuing, setIssuing] = useState(false);
    const [roundBusy, setRoundBusy] = useState(false);
    const [showRoundPicker, setShowRoundPicker] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const [handlingEditor, setHandlingEditor] = useState<{ handling_editor_id: number | null; handling_editor_name?: string | null; handling_editor_email?: string | null } | null>(null);
    const [me, setMe] = useState<{ id: number; email: string; full_name?: string } | null>(null);
    useEffect(() => {
        fetchHandlingEditor(submissionId).then(setHandlingEditor).catch(() => setHandlingEditor(null));
        fetchEditorMe().then(setMe).catch(() => setMe(null));
    }, [submissionId]);
    const handleClaim = async () => {
        if (!me) return;
        try {
            const res = await assignHandlingEditor(submissionId, me.id);
            setHandlingEditor({
                handling_editor_id: res.handling_editor_id,
                handling_editor_name: me.full_name || me.email,
                handling_editor_email: me.email,
            });
            setFlash('You are now the handling editor.');
            setTimeout(() => setFlash(null), 3000);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not assign.');
        }
    };
    const handleUnclaim = async () => {
        if (!window.confirm('Release this submission from your queue?')) return;
        try {
            await assignHandlingEditor(submissionId, null);
            setHandlingEditor({ handling_editor_id: null });
            setFlash('Submission released.');
            setTimeout(() => setFlash(null), 3000);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not release.');
        }
    };

    // Restore editor's in-progress letter across page reloads. Local
    // storage keyed per submission so opening a different manuscript
    // doesn't hand the wrong draft.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(letterDraftKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.decision) setDecision(parsed.decision);
                if (parsed.editorNote) setEditorNote(parsed.editorNote);
                if (parsed.rejectReason) setRejectReason(parsed.rejectReason);
                if (parsed.letterDraft) setLetterDraft(parsed.letterDraft);
            }
        } catch { /* ignore corrupt draft */ }
    }, [letterDraftKey]);

    useEffect(() => {
        try {
            localStorage.setItem(letterDraftKey, JSON.stringify({
                decision, editorNote, rejectReason, letterDraft,
            }));
        } catch { /* localStorage full or blocked */ }
    }, [letterDraftKey, decision, editorNote, rejectReason, letterDraft]);

    useEffect(() => {
        Promise.all([
            fetchReviewerReports(submissionId),
            fetchReviewerConsensus(submissionId).catch(() => null),
        ])
            .then(([r, c]) => { setRows(r); setConsensus(c); })
            .catch((err: any) => {
                if (err?.response?.status === 401) {
                    navigate('/editor-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load the workspace.');
            })
            .finally(() => setLoading(false));
    }, [submissionId, navigate]);

    const submittedCount = useMemo(
        () => (rows ? rows.reviews.filter((r) => r.state === 'submitted').length : 0),
        [rows],
    );
    const totalCount = rows?.reviews.length || 0;
    const progressPct = totalCount === 0 ? 0 : Math.round((100 * submittedCount) / totalCount);
    const badge = consensusBadge(consensus);

    const handleGenerateLetter = async () => {
        if (!decision) {
            alert('Choose a decision before drafting a letter.');
            return;
        }
        setLetterBusy(true);
        try {
            const res = await draftDecisionLetter(submissionId, decision, editorNote);
            setLetterDraft(res.letter);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not draft the letter.');
        } finally {
            setLetterBusy(false);
        }
    };

    const handleIssue = async () => {
        if (!decision) {
            alert('Choose a decision first.');
            return;
        }
        if (!window.confirm('Issue this decision to the author? This cannot be undone.')) return;
        setIssuing(true);
        try {
            const payload: Record<string, unknown> = {
                decision,
                editor_comments: letterDraft || editorNote,
            };
            if (decision === 'rejected' && rejectReason) {
                payload.reject_reason_code = rejectReason;
            }
            await submitDecision(submissionId, payload);
            setFlash('Decision issued. The author has been notified.');
            // Clear the local draft — the decision is now permanent.
            try { localStorage.removeItem(letterDraftKey); } catch { /* ignore */ }
            setTimeout(() => setFlash(null), 4000);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not issue the decision.');
        } finally {
            setIssuing(false);
        }
    };

    const handleOpenRound = () => {
        // Open the picker instead of firing straight away — editor
        // picks whether to carry the previous reviewers, and can add
        // new ones from the agent's suggestions.
        setShowRoundPicker(true);
    };

    const performOpenRound = async (opts: { carry_previous: boolean; new_reviewer_ids: string[] }) => {
        setRoundBusy(true);
        try {
            const res = await openReviewRound(submissionId, opts);
            setFlash(res.message || 'Round opened.');
            setShowRoundPicker(false);
            window.location.reload();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not open a new round.');
        } finally {
            setRoundBusy(false);
        }
    };

    if (loading) return <div className="p-10">Loading…</div>;
    if (error || !rows) return <div className="p-10 text-red-700">{error || 'Not found.'}</div>;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto py-8 px-4">
                {flash && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">
                        {flash}
                    </div>
                )}
                <div className="mb-4">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                </div>

                {/* Header */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Manuscript</div>
                            <div className="font-mono text-sm text-gray-600">{rows.submission_id}</div>
                            <h1 className="text-2xl font-black text-gray-900 mt-1">Editor Manuscript Workspace</h1>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-blue-100 text-blue-800">
                                Round {rows.round}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-amber-100 text-amber-800">
                                Under Review
                            </span>
                            {badge && (
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${badge.cls}`}>
                                    <span aria-hidden>{badge.icon}</span> {badge.label}
                                </span>
                            )}
                            {/* Handling editor pill */}
                            {handlingEditor?.handling_editor_id ? (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-indigo-100 text-indigo-800">
                                    Handling: {handlingEditor.handling_editor_name || handlingEditor.handling_editor_email}
                                    {me && me.id === handlingEditor.handling_editor_id && (
                                        <button type="button" onClick={handleUnclaim} title="Release" className="ml-1 text-indigo-700 hover:text-rose-700">✕</button>
                                    )}
                                </span>
                            ) : (
                                <button
                                    type="button" onClick={handleClaim}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-white border border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                    Assign to me
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Progress */}
                    <div className="mt-5">
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                            <span className="font-semibold text-gray-700">
                                <strong>{submittedCount}</strong> of {totalCount} reviews received
                            </span>
                            <span className="text-gray-500">{progressPct}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                    </div>
                </div>

                {/* Tab strip */}
                <div className="bg-white rounded-2xl border border-gray-200 mb-6 shadow-sm">
                    <div className="flex flex-wrap border-b border-gray-100 px-2">
                        {TABS.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                className={
                                    'px-4 py-3 text-sm font-bold transition border-b-2 -mb-px whitespace-nowrap ' +
                                    (tab === t.key
                                        ? 'text-brand-700 border-brand-700'
                                        : 'text-gray-500 hover:text-gray-800 border-transparent')
                                }
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="p-6">
                        {tab === 'reports' && (
                            <div className="space-y-6">
                                <SafetyChecksCard submissionId={submissionId} />
                                {/* Recommendation Summary + Consensus + AI Summary */}
                                {consensus && consensus.reviewer_count > 0 && (
                                    <>
                                        <div className="rounded-xl border border-gray-200 p-5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                                                    Recommendation Summary
                                                </h2>
                                                {badge && (
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.cls}`}>
                                                        <span aria-hidden>{badge.icon}</span> {badge.label}
                                                    </span>
                                                )}
                                            </div>
                                            <RecommendationBars tally={consensus.recommendation_tally} total={consensus.reviewer_count} />
                                        </div>

                                        <div className="rounded-xl border border-gray-200 p-5">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                                                    AI-Assisted Review Summary
                                                </h2>
                                                <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-bold">
                                                    Consensus Agent
                                                </span>
                                            </div>
                                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                                                ⚠ This is an AI-generated summary. The original reviewer reports remain the authoritative record.
                                            </p>
                                            {consensus.common_concerns.length > 0 && (
                                                <div className="mb-3">
                                                    <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Common concerns</div>
                                                    <ol className="list-decimal pl-5 space-y-1">
                                                        {consensus.common_concerns.slice(0, 5).map((c, i) => (
                                                            <li key={i} className="text-sm text-gray-800">
                                                                {c.seed}
                                                                <span className="ml-2 text-[10px] font-mono text-gray-500">
                                                                    Mentioned by {c.reviewer_count} reviewer{c.reviewer_count === 1 ? '' : 's'}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </div>
                                            )}
                                            {consensus.positive_aspects.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Positive aspects</div>
                                                    <ul className="list-disc pl-5 space-y-1">
                                                        {consensus.positive_aspects.slice(0, 4).map((c, i) => (
                                                            <li key={i} className="text-sm text-gray-800">{c.seed}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {consensus.conflicting_signals.length > 0 && (
                                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Conflicting signals</div>
                                                    <ul className="list-disc pl-5 space-y-1">
                                                        {consensus.conflicting_signals.map((s, i) => (
                                                            <li key={i} className="text-sm text-amber-900">{s}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Per-reviewer cards */}
                                <div>
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-3">Reviewer Reports</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {rows.reviews.map((r) => (
                                            <div key={r.review_id} className="rounded-xl border border-gray-200 p-5 bg-white hover:shadow-md transition">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="text-sm font-bold text-gray-900">{r.reviewer_display_name}</div>
                                                    <span className={
                                                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' +
                                                        (r.state === 'submitted'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-amber-100 text-amber-800')
                                                    }>
                                                        {r.state.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                {r.recommendation && <div className="mb-3"><RecPill rec={r.recommendation} /></div>}
                                                {r.confidence && (
                                                    <div className="text-xs text-gray-500 mb-2">
                                                        Confidence: <strong className="text-gray-800 uppercase">{r.confidence}</strong>
                                                    </div>
                                                )}
                                                {r.ethics_flag && (
                                                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-2">
                                                        ⚠ Ethics concern flagged
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-4 gap-2 text-center text-xs text-gray-600 mb-3">
                                                    <div><div className="font-bold text-rose-700">{r.counts.major}</div>Major</div>
                                                    <div><div className="font-bold text-amber-700">{r.counts.minor}</div>Minor</div>
                                                    <div><div className="font-bold text-blue-700">{r.counts.suggestions}</div>Sug.</div>
                                                    <div><div className="font-bold text-gray-700">{r.counts.annotations}</div>Anno.</div>
                                                </div>
                                                <div className="text-xs text-gray-500 mb-3">Submitted: {formatDate(r.submitted_at)}</div>
                                                <div className="flex justify-end">
                                                    {r.state === 'submitted' ? (
                                                        <Link
                                                            to={`/editor/reviewer-report/${r.review_id}`}
                                                            className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                                        >
                                                            View Full Report →
                                                        </Link>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">Not submitted yet</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {tab === 'decision' && (
                            <div className="space-y-6">
                                {/* Reviewer recommendations recap */}
                                {consensus && consensus.reviewer_count > 0 && (
                                    <div className="rounded-xl border border-gray-200 p-5">
                                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mb-3">
                                            Reviewer Recommendations
                                        </h2>
                                        <ul className="space-y-1.5 text-sm">
                                            {consensus.per_reviewer.map((p, i) => (
                                                <li key={i} className="flex items-center gap-3">
                                                    <span className="w-52 font-medium text-gray-900">{p.reviewer_display_name}</span>
                                                    <RecPill rec={p.recommendation} />
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Editorial Decision panel */}
                                <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-6">
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-brand-800 mb-1">
                                        Editorial Decision
                                    </h2>
                                    <p className="text-xs text-gray-600 mb-4">
                                        Reviewer recommendations are inputs. The editor makes the final call.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                                        {DECISION_OPTIONS.map((o) => (
                                            <label
                                                key={o.value}
                                                className={
                                                    'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm font-semibold ' +
                                                    (decision === o.value
                                                        ? 'border-brand-500 bg-white shadow-sm'
                                                        : 'border-gray-200 bg-white hover:border-brand-300')
                                                }
                                            >
                                                <input
                                                    type="radio" name="decision"
                                                    checked={decision === o.value}
                                                    onChange={() => setDecision(o.value)}
                                                />
                                                <span>{o.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {/* Reject-reason code — visible only when the decision is Reject */}
                                    {decision === 'rejected' && (
                                        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
                                            <div className="text-[10px] uppercase tracking-widest text-rose-800 font-bold mb-2">
                                                Reject reason (structured — feeds decision analytics)
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {REJECT_REASON_OPTIONS.map((r) => (
                                                    <label key={r.code} className="flex items-center gap-2 text-sm">
                                                        <input
                                                            type="radio" name="reject-reason"
                                                            checked={rejectReason === r.code}
                                                            onChange={() => setRejectReason(r.code)}
                                                        />
                                                        <span>{r.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Template picker — pre-populates the letter drafting textarea. */}
                                    <div className="mb-4">
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                                            Insert template
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {DECISION_LETTER_TEMPLATES.map((tpl) => (
                                                <button
                                                    key={tpl.id}
                                                    type="button"
                                                    onClick={() => setLetterDraft(tpl.body(rows.reviews[0]?.reviewer_display_name ? 'this manuscript' : 'this manuscript'))}
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800"
                                                >
                                                    {tpl.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <label className="block mb-4">
                                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                            Editor note (optional — supplements the AI-drafted letter)
                                        </span>
                                        <textarea
                                            value={editorNote}
                                            onChange={(e) => setEditorNote(e.target.value)}
                                            rows={3}
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                            placeholder="Any additional guidance for the author…"
                                        />
                                    </label>

                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <button
                                            type="button"
                                            onClick={handleGenerateLetter}
                                            disabled={letterBusy || !decision}
                                            className="px-4 py-2 rounded-lg text-sm font-bold text-blue-700 bg-white border border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                                        >
                                            {letterBusy ? 'Drafting…' : '✨ Generate Decision Letter'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleIssue}
                                            disabled={issuing || !decision}
                                            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-brand-700 hover:bg-brand-800 disabled:opacity-50 ml-auto"
                                        >
                                            {issuing ? 'Issuing…' : 'Issue Decision'}
                                        </button>
                                    </div>

                                    {letterDraft && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                                                    Decision Letter Draft
                                                </span>
                                                <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-bold">
                                                    Decision Letter Agent
                                                </span>
                                            </div>
                                            <textarea
                                                value={letterDraft}
                                                onChange={(e) => setLetterDraft(e.target.value)}
                                                rows={16}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono"
                                            />
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                Edit the letter above as needed. Clicking <strong>Issue Decision</strong> sends
                                                this text to the author as the editor's comments.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === 'reviewers' && (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                                        Reviewer roster · Round {rows.round}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={handleOpenRound}
                                        disabled={roundBusy}
                                        className="text-xs font-bold text-blue-700 hover:underline disabled:opacity-50"
                                    >
                                        {roundBusy ? 'Working…' : `Open Round ${rows.round + 1} →`}
                                    </button>
                                </div>
                                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white">
                                    {rows.reviews.map((r) => (
                                        <li key={r.review_id} className="flex items-center gap-3 px-4 py-3">
                                            <span className="font-medium text-gray-900 flex-1">{r.reviewer_display_name}</span>
                                            <span className={
                                                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' +
                                                (r.state === 'submitted'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-amber-100 text-amber-800')
                                            }>
                                                {r.state.replace('_', ' ')}
                                            </span>
                                            <RecPill rec={r.recommendation} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {tab === 'submission' && <SubmissionTab submissionId={submissionId} />}
                        {tab === 'history' && <HistoryTab submissionId={submissionId} rows={rows} />}
                        {tab === 'files' && <FilesTab submissionId={submissionId} />}
                        {tab === 'communication' && <CommunicationTab submissionId={submissionId} />}
                    </div>
                </div>

                {showRoundPicker && (
                    <RoundPickerModal
                        submissionId={submissionId}
                        currentReviewers={rows.reviews}
                        onClose={() => setShowRoundPicker(false)}
                        onConfirm={performOpenRound}
                        busy={roundBusy}
                    />
                )}
            </div>
        </div>
    );
}


/* ── Safety Checks card ──────────────────────────────────
 * Runs three deterministic detection agents in parallel and
 * surfaces their verdicts as a single card at the top of the
 * Reviewer Reports tab.
 */

const SafetyChecksCard: React.FC<{ submissionId: string }> = ({ submissionId }) => {
    const [dup, setDup] = useState<any>(null);
    const [panel, setPanel] = useState<any>(null);
    const [cross, setCross] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([
            runDuplicateCheck(submissionId).catch(() => null),
            runPanelBalance(submissionId).catch(() => null),
            runCrossRoundConsistency(submissionId).catch(() => null),
        ]).then(([d, p, c]) => { setDup(d); setPanel(p); setCross(c); })
          .finally(() => setLoading(false));
    }, [submissionId]);
    if (loading) {
        return (
            <div className="rounded-xl border border-gray-200 p-4 text-xs text-gray-500">
                Running detection agents…
            </div>
        );
    }
    const hasProblem =
        (dup && dup.is_duplicate) ||
        (panel && panel.ok === false) ||
        (cross && cross.repeated_concerns && cross.repeated_concerns.length > 0);
    return (
        <div className={
            'rounded-xl border p-4 ' +
            (hasProblem ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50')
        }>
            <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-800">
                    {hasProblem ? '⚠ Safety Checks — attention' : '✓ Safety Checks — clear'}
                </h2>
                <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-bold">
                    Detection Agents
                </span>
            </div>
            {dup && dup.is_duplicate && (
                <div className="mb-2">
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Duplicate submission</div>
                    <ul className="text-sm text-gray-800 list-disc pl-5">
                        {(dup.hits || []).slice(0, 3).map((h: any) => (
                            <li key={h.submission_id}>
                                <span className="font-mono text-xs">{h.submission_id.slice(-6).toUpperCase()}</span> · <em>{h.paper_title}</em> — {h.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {panel && panel.ok === false && (
                <div className="mb-2">
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Panel balance</div>
                    <ul className="text-sm text-gray-800 list-disc pl-5">
                        {(panel.warnings || []).map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}
            {cross && cross.repeated_concerns && cross.repeated_concerns.length > 0 && (
                <div>
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Cross-round consistency</div>
                    <ul className="text-sm text-gray-800 list-disc pl-5">
                        {cross.repeated_concerns.slice(0, 3).map((r: any, i: number) => (
                            <li key={i}>
                                <em>{r.current}</em>
                                <div className="text-[11px] text-gray-500">Previously raised: “{r.previous}” · overlap {(r.overlap * 100).toFixed(0)}%</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {!hasProblem && (
                <p className="text-xs text-emerald-900">
                    No duplicate submissions, no panel-balance concerns, and no repeated cross-round issues.
                </p>
            )}
        </div>
    );
};


/* ── Workspace tab content ───────────────────────────────
 *
 * Small self-contained components — each fetches its own data so a
 * tab click never re-renders the whole workspace.
 */

const SubmissionTab: React.FC<{ submissionId: string }> = ({ submissionId }) => {
    const [data, setData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        fetchSubmissionStatus(submissionId)
            .then(setData)
            .catch((e) => setErr(e?.response?.data?.detail || 'Could not load submission.'));
    }, [submissionId]);
    if (err) return <div className="text-sm text-rose-700">{err}</div>;
    if (!data) return <div className="text-sm text-gray-500">Loading…</div>;
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
                ['Paper ID', data.paper_id_code],
                ['Title', data.paper_title],
                ['Status', data.status],
                ['Research field', data.research_field],
                ['Classification', data.classified_field],
                ['Confidence', data.classification_confidence !== undefined && data.classification_confidence !== null ? `${Math.round((data.classification_confidence || 0) * 100)}%` : null],
                ['Submitted at', data.created_at ? new Date(data.created_at).toLocaleString() : null],
            ].map(([label, val]) => (
                <div key={label as string}>
                    <dt className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{label}</dt>
                    <dd className="mt-0.5 text-gray-900">{val || <span className="text-gray-400">—</span>}</dd>
                </div>
            ))}
            {data.abstract && (
                <div className="sm:col-span-2">
                    <dt className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Abstract</dt>
                    <dd className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{data.abstract}</dd>
                </div>
            )}
        </dl>
    );
};

const HistoryTab: React.FC<{ submissionId: string; rows: ReviewerReportsResponse }> = ({ submissionId, rows }) => {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        client.get(`/submission-timeline/${submissionId}`)
            .then((r) => setEvents(Array.isArray(r.data) ? r.data : (r.data?.events || [])))
            .catch(() => setEvents([]))
            .finally(() => setLoading(false));
    }, [submissionId]);
    // Synthesise a decisions row per round so a submission with a
    // decided outcome still shows the milestone if the timeline
    // endpoint isn't populated.
    if (loading) return <div className="text-sm text-gray-500">Loading history…</div>;
    if (!events.length) {
        return (
            <div className="text-sm text-gray-500 text-center py-8">
                No timeline events yet — reviewer submissions and editor decisions land here as they happen.
                <div className="mt-4 text-xs text-gray-600">
                    Round {rows.round} · {rows.reviews.filter((r) => r.state === 'submitted').length}/{rows.reviews.length} reviews received.
                </div>
            </div>
        );
    }
    return (
        <ol className="relative border-l border-gray-200 ml-3 space-y-4">
            {events.map((e: any, i: number) => (
                <li key={i} className="ml-4">
                    <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" aria-hidden />
                    <div className="text-xs text-gray-500">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</div>
                    <div className="text-sm font-semibold text-gray-900">{e.event || e.action || 'Event'}</div>
                    {e.details && <p className="text-xs text-gray-600 mt-0.5">{e.details}</p>}
                </li>
            ))}
        </ol>
    );
};

const FilesTab: React.FC<{ submissionId: string }> = ({ submissionId }) => {
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        client.get(`/publication/versions/${submissionId}`)
            .then((r) => setVersions(Array.isArray(r.data) ? r.data : (r.data?.versions || [])))
            .catch(() => setVersions([]))
            .finally(() => setLoading(false));
    }, [submissionId]);
    if (loading) return <div className="text-sm text-gray-500">Loading files…</div>;
    if (!versions.length) return <div className="text-sm text-gray-500">No files attached.</div>;
    return (
        <div className="space-y-4">
            {versions.map((v: any) => (
                <div key={v.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-gray-900">{v.label || `Version ${v.version_number}`}</div>
                        <span className="text-xs text-gray-500">{v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}</span>
                    </div>
                    {(v.files || []).length === 0 ? (
                        <p className="text-xs text-gray-500">No files.</p>
                    ) : (
                        <ul className="text-sm space-y-1">
                            {v.files.map((f: any) => (
                                <li key={f.id} className="flex items-center justify-between gap-3">
                                    <span className="truncate">📄 {f.original_filename || f.filename}</span>
                                    <span className="text-xs text-gray-400 whitespace-nowrap">{f.mime_type} · {f.size_bytes ? `${(f.size_bytes/1024).toFixed(0)} KB` : ''}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </div>
    );
};

const CommunicationTab: React.FC<{ submissionId: string }> = ({ submissionId }) => {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        client.get(`/submission-messages/${submissionId}`)
            .then((r) => setMessages(Array.isArray(r.data) ? r.data : (r.data?.messages || [])))
            .catch(() => setMessages([]))
            .finally(() => setLoading(false));
    }, [submissionId]);
    if (loading) return <div className="text-sm text-gray-500">Loading messages…</div>;
    if (!messages.length) {
        return (
            <div className="text-sm text-gray-500 text-center py-8">
                No messages on this manuscript yet.
            </div>
        );
    }
    return (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
            {messages.map((m: any, i: number) => (
                <li key={m.id || i} className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{m.from || m.sender || 'System'}</div>
                        <div className="text-xs text-gray-500">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>
                    </div>
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{m.body || m.message || ''}</p>
                </li>
            ))}
        </ul>
    );
};


/* ── Round-N Reviewer Picker ─────────────────────────────
 *
 * Two-column selector. Left: current-round reviewers (carry-forward
 * toggle). Right: agent-suggested candidates from the existing
 * suggester + free-text search across the reviewer directory.
 * Editor picks a mix; Confirm invokes /open-round with the union.
 */

interface RoundPickerReviewer {
    review_id?: string;
    reviewer_id?: string;
    reviewer_display_name?: string;
    state?: string;
    recommendation?: string | null;
    // From /reviewers/ directory
    id?: string;
    name?: string;
    email?: string;
    institution?: string;
    expertise_tags?: string[];
}

const RoundPickerModal: React.FC<{
    submissionId: string;
    currentReviewers: any[];
    onClose: () => void;
    onConfirm: (opts: { carry_previous: boolean; new_reviewer_ids: string[] }) => void;
    busy: boolean;
}> = ({ submissionId, currentReviewers, onClose, onConfirm, busy }) => {
    const [carryPrevious, setCarryPrevious] = useState(true);
    const [suggested, setSuggested] = useState<any[]>([]);
    const [directory, setDirectory] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [sug, dir] = await Promise.all([
                    suggestReviewers(submissionId).catch(() => []),
                    fetchReviewers({ is_active: true }).catch(() => []),
                ]);
                // Some routers return {suggestions:[]}, others plain arrays.
                const sugList = Array.isArray(sug) ? sug : (sug?.suggestions || []);
                setSuggested(sugList);
                setDirectory(Array.isArray(dir) ? dir : []);
            } finally {
                setLoading(false);
            }
        })();
    }, [submissionId]);

    // IDs of reviewers already on the current round — excluded from
    // the "add new" side to prevent duplicates.
    const currentIds = new Set(
        currentReviewers.map((r) => String(r.reviewer_id || '')).filter(Boolean),
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const merged: Map<string, any> = new Map();
        for (const s of suggested) {
            const id = String(s.reviewer_id || s.id || '');
            if (id && !currentIds.has(id)) merged.set(id, { ...s, id, _from: 'agent' });
        }
        for (const r of directory) {
            const id = String(r.id || '');
            if (id && !currentIds.has(id) && !merged.has(id)) merged.set(id, { ...r, _from: 'dir' });
        }
        const arr = Array.from(merged.values());
        if (!q) return arr;
        return arr.filter((r) => {
            const hay = [
                r.name, r.email, r.institution,
                ...(r.expertise_tags || []),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [suggested, directory, search, currentIds]);

    // Reviewer Bias Agent runs on each candidate the editor eyes.
    // Cache keyed by reviewer id so we don't re-hit the agent.
    const [bias, setBias] = useState<Record<string, { severity: string; reasons: string[] }>>({});
    const checkBias = async (rid: string) => {
        if (bias[rid]) return;
        try {
            const res = await runReviewerBiasCheck(submissionId, rid);
            setBias((prev) => ({
                ...prev,
                [rid]: { severity: res.severity, reasons: res.reasons || [] },
            }));
        } catch { /* leave uncached — user can retry */ }
    };

    const toggle = (id: string) => {
        const next = new Set(picked);
        next.has(id) ? next.delete(id) : next.add(id);
        setPicked(next);
        // Kick the agent when the editor considers this reviewer.
        checkBias(id);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Open Next Review Round</h3>
                        <p className="text-xs text-gray-500">
                            Carry the current reviewers, add new ones from the suggestion agent, or both.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-700" aria-label="Close">×</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                    {/* Carry previous */}
                    <div className="rounded-xl border border-gray-200 p-4">
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input type="checkbox" className="mt-1" checked={carryPrevious} onChange={(e) => setCarryPrevious(e.target.checked)} />
                            <div>
                                <span className="font-bold text-gray-900">Carry previous reviewers</span>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    Re-invite everyone who submitted a report in the current round.
                                </div>
                            </div>
                        </label>
                        {carryPrevious && (
                            <ul className="mt-3 space-y-1 text-xs text-gray-700 pl-6">
                                {currentReviewers.filter((r) => r.state === 'submitted').map((r) => (
                                    <li key={r.review_id}>· {r.reviewer_display_name} <span className="text-gray-400">— {r.recommendation ? r.recommendation.replace('_', ' ') : '—'}</span></li>
                                ))}
                                {currentReviewers.filter((r) => r.state === 'submitted').length === 0 && (
                                    <li className="text-gray-400">No submitted reports in the current round.</li>
                                )}
                            </ul>
                        )}
                    </div>

                    {/* Add new reviewers */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Add new reviewers</h4>
                            <input
                                type="search" value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name / expertise / institution"
                                className="text-xs w-64 px-3 py-1.5 border border-gray-300 rounded-lg"
                            />
                        </div>
                        {loading ? (
                            <div className="text-sm text-gray-500 py-6 text-center">Loading suggestions…</div>
                        ) : filtered.length === 0 ? (
                            <div className="text-sm text-gray-500 py-6 text-center">No matching reviewers.</div>
                        ) : (
                            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl max-h-72 overflow-y-auto">
                                {filtered.slice(0, 20).map((r) => (
                                    <li key={r.id} className="flex items-start gap-3 p-3 hover:bg-gray-50">
                                        <input
                                            type="checkbox" className="mt-1"
                                            checked={picked.has(String(r.id))}
                                            onChange={() => toggle(String(r.id))}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                                {r.name}
                                                {r._from === 'agent' && (
                                                    <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded px-1.5 py-0.5">Agent</span>
                                                )}
                                                {typeof r.similarity_score === 'number' && (
                                                    <span className="text-[10px] font-mono text-gray-500">match {(r.similarity_score * 100).toFixed(0)}%</span>
                                                )}
                                                {bias[String(r.id)]?.severity === 'hard' && (
                                                    <span className="text-[10px] font-bold uppercase bg-rose-100 text-rose-700 rounded px-1.5 py-0.5" title={bias[String(r.id)].reasons.join(' ')}>⚠ COI</span>
                                                )}
                                                {bias[String(r.id)]?.severity === 'soft' && (
                                                    <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5" title={bias[String(r.id)].reasons.join(' ')}>⚠ Soft COI</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {[r.institution, r.email].filter(Boolean).join(' · ')}
                                            </div>
                                            {bias[String(r.id)]?.reasons?.length > 0 && (
                                                <div className="text-[11px] text-rose-700 mt-0.5">
                                                    {bias[String(r.id)].reasons.join(' · ')}
                                                </div>
                                            )}
                                            {(r.expertise_tags || []).length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {(r.expertise_tags || []).slice(0, 5).map((t: string) => (
                                                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">{t}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                        {picked.size} new · {carryPrevious ? currentReviewers.filter((r) => r.state === 'submitted').length : 0} carried
                    </span>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">Cancel</button>
                        <button
                            type="button" disabled={busy}
                            onClick={() => onConfirm({
                                carry_previous: carryPrevious,
                                new_reviewer_ids: Array.from(picked),
                            })}
                            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                        >
                            {busy ? 'Opening round…' : 'Open Round'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
