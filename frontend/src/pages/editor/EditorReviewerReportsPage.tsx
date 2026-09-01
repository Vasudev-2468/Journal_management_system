import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    fetchReviewerReports, fetchReviewerConsensus, openReviewRound,
} from '../../api/editor';

// Multi-reviewer panel + Reviewer Consensus card (spec §14 + §15).
//
// One page per submission — lists every reviewer's report side-by-side
// with a per-row Recommendation pill, plus the cross-reviewer AI
// consensus card at the top. The consensus card carries the
// reviewers' own first-sentence excerpts, never rewritten.

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

interface ConsensusExcerpt {
    reviewer: string;
    review_id: string;
    text: string;
    kind: string;
}

interface ConsensusCluster {
    seed: string;
    excerpts: ConsensusExcerpt[];
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
    minor_concerns: ConsensusCluster[];
    positive_aspects: ConsensusCluster[];
    conflicting_signals: string[];
    ethics_flag_count: number;
    text_summary: string;
}

const REC_STYLES: Record<string, { cls: string; label: string }> = {
    accept:         { cls: 'bg-emerald-100 text-emerald-800',   label: 'Accept' },
    minor_revision: { cls: 'bg-blue-100 text-blue-800',         label: 'Minor Revision' },
    major_revision: { cls: 'bg-amber-100 text-amber-900',       label: 'Major Revision' },
    reject:         { cls: 'bg-rose-100 text-rose-800',         label: 'Reject' },
};

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
    });
};

const STRENGTH_LABEL: Record<ConsensusResponse['consensus_strength'], string> = {
    unanimous: 'unanimous',
    majority:  'majority',
    split:     'split',
    'n/a':     'n/a',
};

export default function EditorReviewerReportsPage() {
    const { submissionId = '' } = useParams();
    const navigate = useNavigate();
    const [rows, setRows] = useState<ReviewerReportsResponse | null>(null);
    const [consensus, setConsensus] = useState<ConsensusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [roundBusy, setRoundBusy] = useState(false);

    useEffect(() => {
        Promise.all([
            fetchReviewerReports(submissionId),
            fetchReviewerConsensus(submissionId).catch(() => null),
        ])
            .then(([r, c]) => {
                setRows(r);
                setConsensus(c);
            })
            .catch((err: any) => {
                if (err?.response?.status === 401) {
                    navigate('/editor-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load the reviews.');
            })
            .finally(() => setLoading(false));
    }, [submissionId, navigate]);

    const handleOpenRound = async () => {
        if (!window.confirm('Open a new review round? This creates fresh review rows for the same reviewers at the next round number.')) return;
        setRoundBusy(true);
        try {
            await openReviewRound(submissionId);
            window.location.reload();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not open a new round.');
        } finally {
            setRoundBusy(false);
        }
    };

    if (loading) return <div className="p-8">Loading…</div>;
    if (error || !rows) return <div className="p-8 text-red-700">{error || 'Not found.'}</div>;

    const rec = consensus?.consensus_recommendation ? REC_STYLES[consensus.consensus_recommendation] : null;

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-5xl mx-auto">
                <div className="mb-4">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                </div>

                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Reviewer Reports</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Round {rows.round} · {rows.reviews.length} reviewer{rows.reviews.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleOpenRound}
                        disabled={roundBusy}
                        className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {roundBusy ? 'Working…' : `Open Round ${rows.round + 1}`}
                    </button>
                </div>

                {/* Consensus card */}
                {consensus && consensus.reviewer_count > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-2">
                                AI Review Summary
                                <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Consensus Agent</span>
                            </div>
                            <div className="text-xs text-gray-500">
                                Round {consensus.round} · {consensus.reviewer_count} report{consensus.reviewer_count === 1 ? '' : 's'}
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Reviewer consensus</div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {rec ? (
                                    <span className={`inline-block px-3 py-1 rounded-full font-bold text-sm ${rec.cls}`}>
                                        {rec.label}
                                    </span>
                                ) : (
                                    <span className="text-sm text-gray-500">No majority recommendation</span>
                                )}
                                <span className="text-xs text-gray-600">({STRENGTH_LABEL[consensus.consensus_strength]})</span>
                            </div>
                        </div>

                        {/* Tally chips */}
                        <div className="flex gap-2 flex-wrap mb-4">
                            {Object.entries(consensus.recommendation_tally).map(([k, v]) => (
                                <span
                                    key={k}
                                    className={`text-xs px-2 py-1 rounded-full font-semibold ${v > 0 ? (REC_STYLES[k]?.cls || 'bg-gray-100 text-gray-700') : 'bg-gray-50 text-gray-400'}`}
                                >
                                    {REC_STYLES[k]?.label || k}: {v}
                                </span>
                            ))}
                        </div>

                        {consensus.common_concerns.length > 0 && (
                            <div className="mb-3">
                                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Common concerns</div>
                                <ol className="list-decimal pl-5 space-y-1">
                                    {consensus.common_concerns.slice(0, 6).map((c, i) => (
                                        <li key={i} className="text-sm text-gray-800">
                                            {c.seed}
                                            <span className="ml-2 text-[10px] font-mono text-gray-500">
                                                × {c.reviewer_count} reviewer{c.reviewer_count === 1 ? '' : 's'}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}

                        {consensus.positive_aspects.length > 0 && (
                            <div className="mb-3">
                                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Positive aspects</div>
                                <ol className="list-decimal pl-5 space-y-1">
                                    {consensus.positive_aspects.slice(0, 4).map((c, i) => (
                                        <li key={i} className="text-sm text-gray-800">{c.seed}</li>
                                    ))}
                                </ol>
                            </div>
                        )}

                        {consensus.conflicting_signals.length > 0 && (
                            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mt-2">
                                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Conflicting signals</div>
                                <ul className="list-disc pl-5 space-y-1">
                                    {consensus.conflicting_signals.map((s, i) => (
                                        <li key={i} className="text-sm text-amber-900">{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p className="text-[11px] text-gray-500 mt-3">
                            The AI summary does not replace the original reviewer reports —
                            open each report to read the exact submission.
                        </p>
                    </div>
                )}

                {/* Per-reviewer cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rows.reviews.map((r) => {
                        const style = r.recommendation ? REC_STYLES[r.recommendation] : null;
                        return (
                            <div key={r.review_id} className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-bold text-gray-900">{r.reviewer_display_name}</div>
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${r.state === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                        {r.state.replace('_', ' ')}
                                    </span>
                                </div>
                                {style && (
                                    <div className="mb-3">
                                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-xs ${style.cls}`}>
                                            {style.label}
                                        </span>
                                        {r.confidence && (
                                            <span className="ml-2 text-xs text-gray-500 uppercase">Confidence: {r.confidence}</span>
                                        )}
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
                                            View Report →
                                        </Link>
                                    ) : (
                                        <span className="text-xs text-gray-400">Not submitted yet</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
