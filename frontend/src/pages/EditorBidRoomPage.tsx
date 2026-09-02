import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { AlertBanner, PageHeader, LoadingIndicator } from '../components/ui';
import {
    BidRoomResponse,
    BidRoomReviewer,
    ComparisonResponse,
    fetchBidRoom,
    fetchReviewerComparison,
    fetchReviewerDetail,
    remindReviewer,
    resendReviewInvitation,
    resetReviewerCredentials,
    ReviewerCredentialsReveal,
    ReviewerDetail,
} from '../api/bidRoom';
import { DecisionBriefing, fetchDecisionBriefing } from '../api/workflow';
import client from '../api/client';

/**
 * Bid Room — one workspace for one paper + all assigned reviewers.
 *
 * Route: /editor/bid-room/:submissionId  (accepts UUID or paper_id_code)
 *
 * Consolidates paper info, per-reviewer status, overall progress, and
 * activity timeline into a single view so editors stop hopping between
 * four different screens. Write actions (send reminder, finalise
 * decision, publish) each route through their existing endpoints so
 * authorisation stays enforced at the mutation surface.
 */
const EditorBidRoomPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [data, setData] = useState<BidRoomResponse | null>(null);
    const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
    const [briefing, setBriefing] = useState<DecisionBriefing | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reminding, setReminding] = useState<string | null>(null);
    const [resending, setResending] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [detailReviewerId, setDetailReviewerId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ReviewerDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        if (!detailReviewerId) { setDetail(null); return; }
        let cancelled = false;
        setDetailLoading(true); setDetailError(null); setDetail(null);
        fetchReviewerDetail(detailReviewerId)
            .then((d) => { if (!cancelled) setDetail(d); })
            .catch((e: any) => {
                if (!cancelled) setDetailError(e?.response?.data?.detail || e?.message || 'Could not load reviewer.');
            })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
    }, [detailReviewerId]);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [r, c, b] = await Promise.all([
                fetchBidRoom(submissionId),
                fetchReviewerComparison(submissionId).catch(() => null),
                fetchDecisionBriefing(submissionId).catch(() => null),
            ]);
            setData(r);
            setComparison(c);
            setBriefing(b);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Failed to load Review Room.');
        } finally {
            setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => {
        if (submissionId) reload();
    }, [submissionId, reload]);

    const sendReminder = async (reviewId: string, reviewerName: string | null) => {
        setReminding(reviewId);
        try {
            const res = await remindReviewer(reviewId);
            setToast(
                res.email_sent
                    ? `Reminder sent to ${reviewerName || res.reviewer_email}.`
                    : `Reminder queued but delivery failed — check the notification log.`,
            );
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Reminder failed.');
        } finally {
            setReminding(null);
        }
    };

    const resendInvite = async (reviewId: string, reviewerName: string | null) => {
        setResending(reviewId);
        try {
            const res = await resendReviewInvitation(reviewId);
            setToast(
                res?.email_sent
                    ? `Invitation resent to ${reviewerName || res?.reviewer_email || 'reviewer'}.`
                    : `Resend attempted but delivery failed — check the notification log.`,
            );
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Resend failed.');
        } finally {
            setResending(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="🏠"
                    title="Review Room"
                    subtitle={
                        data ? (
                            <>
                                <span className="font-mono">{data.paper_id_code || data.submission_id.slice(0, 8)}</span>{' '}
                                · {data.paper_title}
                            </>
                        ) : (
                            `Submission ${submissionId}`
                        )
                    }
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}
                {toast && (
                    <div className="mb-4">
                        <AlertBanner tone="success" onDismiss={() => setToast(null)}>
                            {toast}
                        </AlertBanner>
                    </div>
                )}

                {detailReviewerId && (
                    <ReviewerDetailModal
                        loading={detailLoading}
                        error={detailError}
                        detail={detail}
                        onClose={() => setDetailReviewerId(null)}
                    />
                )}

                {loading ? (
                    <LoadingIndicator label="Loading Review Room…" fullPage />
                ) : !data ? null : (
                    <>
                        {/* ── Paper header + status ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-gray-900">📄 {data.paper_title}</h2>
                                    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 mt-3 text-sm">
                                        <div>
                                            <dt className="text-xs uppercase tracking-wider text-gray-500">Paper ID</dt>
                                            <dd className="font-mono">{data.paper_id_code || data.submission_id.slice(0, 8)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs uppercase tracking-wider text-gray-500">Author</dt>
                                            <dd>{data.author_name || '—'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs uppercase tracking-wider text-gray-500">Submitted</dt>
                                            <dd>{new Date(data.submitted_at).toLocaleDateString()}</dd>
                                        </div>
                                    </dl>
                                </div>
                                <StatusPill status={data.status} />
                            </div>
                        </section>

                        {/* ── Progress card ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                                📊 Review progress
                            </h3>
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                                <ProgressTile label="Total" value={data.progress.total} tone="neutral" />
                                <ProgressTile label="Completed" value={data.progress.completed} tone="emerald" />
                                <ProgressTile label="In progress" value={data.progress.in_progress} tone="amber" />
                                <ProgressTile label="Not started" value={data.progress.not_started} tone="gray" />
                                <ProgressTile label="Overdue" value={data.progress.overdue} tone="rose" />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 transition-all"
                                        style={{ width: `${data.progress.percent}%` }}
                                        role="progressbar"
                                        aria-valuenow={data.progress.percent}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                    />
                                </div>
                                <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                    {data.progress.completed}/{data.progress.total} · {data.progress.percent}%
                                </span>
                            </div>
                        </section>

                        {/* ── Reviewer panel ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                                👥 Reviewers ({data.reviewers.length})
                            </h3>
                            {data.reviewers.length === 0 ? (
                                <InlineReviewerPicker
                                    submissionId={data.submission_id}
                                    onAssigned={reload}
                                />
                            ) : (
                                <div className="space-y-3">
                                    {data.reviewers.map((r) => (
                                        <ReviewerCard
                                            key={r.review_id}
                                            reviewer={r}
                                            reminding={reminding === r.review_id}
                                            resending={resending === r.review_id}
                                            onRemind={() => sendReminder(r.review_id, r.reviewer_name)}
                                            onResend={() => resendInvite(r.review_id, r.reviewer_name)}
                                            onOpenDetail={() => r.reviewer_id && setDetailReviewerId(r.reviewer_id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* ── Reviewer comparison table ── */}
                        {comparison && comparison.rows.length > 0 && (
                            <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                                        💬 Reviewer comparison
                                    </h3>
                                    {comparison.has_conflict && (
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                            ⚠️ Recommendations conflict
                                        </span>
                                    )}
                                </div>
                                {comparison.has_conflict && (
                                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
                                        Reviewers picked different recommendations:{' '}
                                        <span className="font-semibold">
                                            {comparison.unique_recommendations.map((r) => r.replace(/_/g, ' ')).join(', ')}
                                        </span>
                                        . Open the decision workspace to see the AI briefing and finalise.
                                    </p>
                                )}
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                                            <tr>
                                                <th className="text-left px-3 py-2">Reviewer</th>
                                                {comparison.dimensions.map((d) => (
                                                    <th key={d} className="text-center px-3 py-2 capitalize">{d}</th>
                                                ))}
                                                <th className="text-center px-3 py-2">Recommendation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {comparison.rows.map((row, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-2 font-medium text-gray-900">
                                                        {row.reviewer_name || `Reviewer ${i + 1}`}
                                                        {row.ethics_flag && (
                                                            <span className="ml-1 text-rose-700" title="Ethics flagged">⚠️</span>
                                                        )}
                                                    </td>
                                                    <ScoreCell v={row.score_originality} />
                                                    <ScoreCell v={row.score_technical} />
                                                    <ScoreCell v={row.score_relevance} />
                                                    <ScoreCell v={row.score_clarity} />
                                                    <ScoreCell v={row.score_references} />
                                                    <td className="px-3 py-2 text-center">
                                                        {row.overall_recommendation ? (
                                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${recTone(row.overall_recommendation)}`}>
                                                                {row.overall_recommendation.replace(/_/g, ' ')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">
                                    Scores are 1–10 as reported by reviewers. Empty cells mean the reviewer hasn't submitted yet.
                                </p>
                            </section>
                        )}

                        {/* ── AI Agent Analysis (embedded from briefing endpoint) ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                                    🤖 AI Agent analysis
                                </h3>
                                {briefing && (
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
                                )}
                            </div>
                            {!briefing ? (
                                <p className="text-sm text-gray-500">
                                    Briefing unavailable — the AI produces analysis once at least one reviewer has submitted.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                                        <p className="text-xs text-blue-800 mb-1 font-semibold uppercase tracking-wider">
                                            Suggested decision
                                        </p>
                                        <p className="text-lg font-bold text-blue-900">
                                            {briefing.suggested_decision.replace(/_/g, ' ')}
                                        </p>
                                        <p className="text-sm text-blue-800 mt-1">
                                            {briefing.suggestion_reason}
                                        </p>
                                        <p className="text-xs text-blue-700 mt-2 italic">
                                            Consensus: {briefing.consensus.replace(/_/g, ' ')} — the editor makes the authoritative call.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                                Reviews received
                                            </p>
                                            <p className="text-sm text-gray-800">
                                                {briefing.reviews_received} of {briefing.reviews_expected}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                                Signal flags
                                            </p>
                                            <p className="text-sm text-gray-800">
                                                {briefing.ethics_flags > 0 && (
                                                    <span className="text-rose-700 font-medium">
                                                        ⚠️ {briefing.ethics_flags} ethics
                                                    </span>
                                                )}
                                                {briefing.ethics_flags === 0 && briefing.coi_declared === 0 && '—'}
                                            </p>
                                        </div>
                                    </div>

                                    {briefing.common_concerns.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                                                Critical unresolved issues
                                            </p>
                                            <ul className="space-y-1.5">
                                                {briefing.common_concerns.slice(0, 6).map((c, i) => (
                                                    <li key={i} className="text-sm text-gray-700 border-l-2 border-gray-200 pl-3">
                                                        <span className="text-xs text-gray-500">{c.reviewer}</span>
                                                        <p className="mt-0.5">{c.concern}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="mt-4 pt-3 border-t border-gray-100">
                                <Link
                                    to={`/editor/submissions/${data.paper_id_code || data.submission_id}/decision`}
                                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
                                >
                                    <span aria-hidden>⚖️</span> Open decision workspace to finalise →
                                </Link>
                            </div>
                        </section>

                        {/* ── Activity timeline ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                                📅 Activity timeline
                            </h3>
                            {data.timeline.length === 0 ? (
                                <p className="text-sm text-gray-500">No events recorded yet.</p>
                            ) : (
                                <ol className="space-y-2">
                                    {data.timeline.map((e, i) => (
                                        <li key={i} className="flex items-start gap-3 text-sm">
                                            <span
                                                className={`flex-none w-2 h-2 mt-1.5 rounded-full ${
                                                    e.kind === 'reviewer_completed' ? 'bg-emerald-500' :
                                                    e.kind === 'reviewer_accepted' ? 'bg-blue-500' :
                                                    e.kind === 'reviewer_assigned' ? 'bg-amber-500' :
                                                    'bg-gray-400'
                                                }`}
                                                aria-hidden
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-gray-800">{e.label}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {new Date(e.at).toLocaleString()}
                                                    {e.actor && ` · ${e.actor}`}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Reviewer card ───────────────────────────────────────

const ReviewerCard: React.FC<{
    reviewer: BidRoomReviewer;
    reminding: boolean;
    resending: boolean;
    onRemind: () => void;
    onResend: () => void;
    onOpenDetail?: () => void;
}> = ({ reviewer: r, reminding, resending, onRemind, onResend, onOpenDetail }) => {
    const done = r.status === 'completed';
    const overdue = r.is_overdue;
    // A reviewer whose account is still ``pending`` on the review (not
    // yet accepted the panel invitation) is a candidate for a resend
    // of the invitation email. Once they've accepted, the reminder
    // button is the right action instead.
    const pendingInvite = r.status === 'pending' || r.state === 'invited';
    return (
        <div
            className={`rounded-xl border p-4 ${
                done ? 'border-emerald-200 bg-emerald-50/40'
                : overdue ? 'border-rose-200 bg-rose-50/40'
                : 'border-gray-200 bg-white'
            }`}
        >
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span aria-hidden>👤</span>
                        {onOpenDetail && r.reviewer_id ? (
                            <button
                                type="button"
                                onClick={onOpenDetail}
                                className="font-semibold text-blue-700 hover:underline focus:outline-none"
                                title="View reviewer details"
                            >
                                {r.reviewer_name || 'Reviewer'}
                            </button>
                        ) : (
                            <span className="font-semibold text-gray-900">{r.reviewer_name || 'Reviewer'}</span>
                        )}
                        <StatusChip status={r.status} state={r.state} overdue={overdue} />
                        {r.overall_recommendation && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                {r.overall_recommendation.replace(/_/g, ' ')}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Assigned {new Date(r.assigned_at).toLocaleDateString()}
                        {r.deadline && ` · Deadline ${new Date(r.deadline).toLocaleDateString()}`}
                        {r.completed_at && ` · Submitted ${new Date(r.completed_at).toLocaleDateString()}`}
                        {overdue && ` · ${r.days_overdue} day${r.days_overdue === 1 ? '' : 's'} overdue`}
                    </p>
                </div>
                {!done && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={onResend}
                            disabled={resending}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300"
                            title="Re-send the per-paper invitation email for this manuscript"
                        >
                            {resending ? 'Resending…' : '📧 Resend invitation'}
                        </button>
                        <button
                            type="button"
                            onClick={onRemind}
                            disabled={reminding}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                                overdue
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                            } disabled:bg-gray-300`}
                            title="Send a deadline nudge to a reviewer who has already accepted"
                        >
                            {reminding ? 'Sending…' : '⏰ Send reminder'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Small helpers ───────────────────────────────────────

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
    const map: Record<string, { cls: string; label: string }> = {
        pending_classification:        { cls: 'bg-gray-100 text-gray-800', label: 'Pending classification' },
        awaiting_format_check:         { cls: 'bg-amber-100 text-amber-900', label: 'Format check' },
        awaiting_consult_review:       { cls: 'bg-amber-100 text-amber-900', label: 'Consult review' },
        awaiting_reviewer_suggestions: { cls: 'bg-blue-100 text-blue-800', label: 'Awaiting reviewer suggestions' },
        pending_assignment:            { cls: 'bg-blue-100 text-blue-800', label: 'Awaiting assignment' },
        under_review:                  { cls: 'bg-blue-100 text-blue-800', label: 'Under review' },
        revision_requested:            { cls: 'bg-amber-100 text-amber-900', label: 'Revision requested' },
        returned_to_author:            { cls: 'bg-amber-100 text-amber-900', label: 'Returned to author' },
        accepted:                      { cls: 'bg-emerald-100 text-emerald-800', label: 'Accepted' },
        rejected:                      { cls: 'bg-rose-100 text-rose-800', label: 'Rejected' },
    };
    const spec = map[status] || { cls: 'bg-gray-100 text-gray-800', label: status };
    return <span className={`text-xs font-semibold px-3 py-1 rounded-full ${spec.cls}`}>{spec.label}</span>;
};

const StatusChip: React.FC<{ status: string; state: string | null; overdue: boolean }> = ({ status, state, overdue }) => {
    if (status === 'completed') {
        return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">🟢 Completed</span>;
    }
    if (overdue) {
        return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">🔴 Overdue</span>;
    }
    if (state === 'accepted' || state === 'in_progress') {
        return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900">🟡 In progress</span>;
    }
    if (state === 'declined') {
        return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700">✗ Declined</span>;
    }
    return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">⚪ Not started</span>;
};

// ── Reviewer detail modal ───────────────────────────────
//
// Opens when the editor clicks a reviewer's name in the Reviewers
// list. Shows contact identity, access lifecycle, workload, and past
// assignments. The reviewer's password is stored as a bcrypt hash
// and is never returned — we only tell the editor whether the
// reviewer has completed onboarding (``password_set``).

const fmtDateTime = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString() : '—';
const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString() : '—';

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-gray-100 last:border-b-0">
        <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
        <div className="col-span-2 text-sm text-gray-900 break-words">{value}</div>
    </div>
);

const CopyableField: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => {
    const [copied, setCopied] = useState(false);
    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
    };
    return (
        <div className="flex items-start gap-2 py-1.5">
            <div className="w-32 text-xs font-semibold text-gray-500 uppercase tracking-wider pt-1.5">{label}</div>
            <div className={`flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm ${mono ? 'font-mono' : ''} break-all`}>
                {value}
            </div>
            <button
                type="button" onClick={doCopy}
                className="text-xs px-2 py-1.5 rounded bg-white border border-gray-300 hover:bg-gray-50 font-semibold text-gray-800 whitespace-nowrap"
            >
                {copied ? '✓ Copied' : 'Copy'}
            </button>
        </div>
    );
};

const ReviewerDetailModal: React.FC<{
    loading: boolean;
    error: string | null;
    detail: ReviewerDetail | null;
    onClose: () => void;
}> = ({ loading, error, detail, onClose }) => {
    const [reveal, setReveal] = useState<ReviewerCredentialsReveal | null>(null);
    const [resetting, setResetting] = useState(false);
    const [resetError, setResetError] = useState<string | null>(null);

    const doReset = async () => {
        if (!detail) return;
        if (!window.confirm(
            'This will replace the reviewer\'s current password with a freshly-generated one.' +
            ' They will need the new credentials to sign in. Continue?',
        )) return;
        setResetting(true); setResetError(null);
        try {
            const res = await resetReviewerCredentials(detail.id);
            setReveal(res);
        } catch (e: any) {
            setResetError(e?.response?.data?.detail || e?.message || 'Reset failed.');
        } finally {
            setResetting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Reviewer</div>
                        <h2 className="text-lg font-black text-gray-900 mt-0.5">
                            {loading ? 'Loading…' : detail?.name || 'Reviewer'}
                        </h2>
                    </div>
                    <button
                        type="button" onClick={onClose}
                        className="text-gray-400 hover:text-gray-800 text-2xl leading-none"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className="px-6 py-4">
                    {loading && <div className="text-sm text-gray-500">Loading reviewer profile…</div>}
                    {error && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
                    )}

                    {detail && (
                        <>
                            <section className="mb-5">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-2">Contact &amp; Identity</h3>
                                <DetailRow label="Name" value={detail.name} />
                                <DetailRow label="Email (username)" value={
                                    <a href={`mailto:${detail.email}`} className="text-blue-700 hover:underline">{detail.email}</a>
                                } />
                                <DetailRow label="WhatsApp" value={detail.whatsapp_number || '—'} />
                                <DetailRow label="Institution" value={detail.institution || '—'} />
                                <DetailRow label="Expertise" value={
                                    detail.expertise_tags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {detail.expertise_tags.map((t) => (
                                                <span key={t} className="text-[11px] px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-full">{t}</span>
                                            ))}
                                        </div>
                                    ) : '—'
                                } />
                            </section>

                            <section className="mb-5">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-blue-700">Access</h3>
                                    {!reveal && (
                                        <button
                                            type="button" onClick={doReset} disabled={resetting}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 font-semibold disabled:opacity-50"
                                            title="Reset the reviewer's password and reveal it once"
                                        >
                                            {resetting ? 'Generating…' : '🔑 Reset & reveal credentials'}
                                        </button>
                                    )}
                                </div>
                                {resetError && (
                                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900 mb-2">{resetError}</div>
                                )}
                                {reveal && (
                                    <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 mb-3">
                                        <div className="text-xs font-bold uppercase tracking-widest text-emerald-800 mb-2">
                                            ✓ New credentials — shown once
                                        </div>
                                        <p className="text-xs text-emerald-900 mb-3">
                                            Save these somewhere safe and send them to the reviewer through a secure channel. Refreshing this page will hide them.
                                        </p>
                                        <CopyableField label="Username" value={reveal.username} />
                                        <CopyableField label="Password" value={reveal.password} mono />
                                        <CopyableField label="Login URL" value={reveal.login_url} />
                                        {reveal.invitation_url && (
                                            <CopyableField label="Invitation URL" value={reveal.invitation_url} />
                                        )}
                                        {reveal.invitation_expires_at && (
                                            <div className="mt-1 text-[11px] text-emerald-900">
                                                Invitation URL expires {fmtDateTime(reveal.invitation_expires_at)}.
                                            </div>
                                        )}
                                    </div>
                                )}
                                <DetailRow
                                    label="Password"
                                    value={
                                        <span className={detail.password_set ? 'text-emerald-800' : 'text-amber-800'}>
                                            {detail.password_set ? '✓ Set (stored as hash — cannot be shown)' : '⚠ Not set — reviewer has not completed onboarding'}
                                        </span>
                                    }
                                />
                                <DetailRow label="Email verified" value={fmtDateTime(detail.email_verified_at)} />
                                <DetailRow label="Last login" value={fmtDateTime(detail.last_login_at)} />
                                <DetailRow label="Invitation sent" value={fmtDateTime(detail.invitation_sent_at)} />
                                <DetailRow label="Invitation accepted" value={fmtDateTime(detail.invitation_accepted_at)} />
                                {detail.invitation_declined_at && (
                                    <DetailRow label="Invitation declined" value={fmtDateTime(detail.invitation_declined_at)} />
                                )}
                                {detail.invitation_revoked_at && (
                                    <DetailRow label="Invitation revoked" value={fmtDateTime(detail.invitation_revoked_at)} />
                                )}
                                <DetailRow label="Invitation expires" value={fmtDateTime(detail.invitation_expires_at)} />
                            </section>

                            <section className="mb-5">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-2">Workload</h3>
                                <DetailRow label="Current load" value={`${detail.current_load} / ${detail.max_assignments}`} />
                                <DetailRow label="Account active" value={detail.is_active ? '✓ Active' : '✗ Inactive'} />
                                <DetailRow label="Registered" value={fmtDate(detail.created_at)} />
                            </section>

                            <section>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-2">
                                    Review history ({detail.review_history.length})
                                </h3>
                                {detail.review_history.length === 0 ? (
                                    <p className="text-sm text-gray-500">No prior reviews.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {detail.review_history.map((h) => (
                                            <li key={h.review_id} className="rounded-lg border border-gray-200 p-2 text-sm">
                                                <div className="font-semibold text-gray-900 line-clamp-1">{h.paper_title}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    Status <span className="font-mono">{h.status}</span> · Assigned {fmtDate(h.assigned_at)}
                                                    {h.completed_at && ` · Completed ${fmtDate(h.completed_at)}`}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <p className="mt-6 text-[11px] text-gray-400 italic">
                                Passwords are stored as bcrypt hashes and cannot be revealed — an existing password can only be replaced. Use "Reset &amp; reveal credentials" above to generate a new password the reviewer can sign in with, or point the reviewer at the "Forgot password" flow on the login page.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProgressTile: React.FC<{ label: string; value: number; tone: 'neutral' | 'emerald' | 'amber' | 'gray' | 'rose' }> = ({ label, value, tone }) => {
    const styles = {
        neutral: 'bg-gray-50 border-gray-200 text-gray-800',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        amber:   'bg-amber-50 border-amber-200 text-amber-900',
        gray:    'bg-gray-100 border-gray-200 text-gray-700',
        rose:    'bg-rose-50 border-rose-200 text-rose-900',
    }[tone];
    return (
        <div className={`rounded-lg border p-3 ${styles}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
};

// ── Inline reviewer picker ──────────────────────────────
//
// When the Review Room opens with zero reviewers assigned, this
// picker takes over the reviewer-panel slot: pull the AI-ranked
// shortlist from ``GET /reviewers/suggest/{id}``, let the editor
// tick 3–4, confirm, and fire ``POST /editor-portal/assign-reviewers/{id}``.
// Refresh callback then re-hydrates the whole Bid Room so the new
// reviewer rows land in place.

interface Suggestion {
    reviewer_id: string;
    name: string;
    similarity_score: number;
    current_load: number;
    max_assignments: number;
    expertise_tags: string[];
}

const InlineReviewerPicker: React.FC<{
    submissionId: string;
    onAssigned: () => void;
}> = ({ submissionId, onAssigned }) => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [assigning, setAssigning] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        client
            .get(`/reviewers/suggest/${submissionId}`)
            .then((r) => {
                if (!cancelled) setSuggestions(Array.isArray(r.data) ? r.data : []);
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(
                        e?.response?.data?.detail ||
                            e?.message ||
                            'Could not load reviewer suggestions.',
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [submissionId]);

    const toggle = (rid: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(rid)) next.delete(rid);
            else next.add(rid);
            return next;
        });
    };

    const canDispatch = selected.size >= 1;

    const dispatch = async () => {
        setAssigning(true);
        setError(null);
        try {
            await client.post(
                `/editor-portal/assign-reviewers/${submissionId}`,
                { reviewer_ids: Array.from(selected) },
                { headers: { Authorization: `Bearer ${localStorage.getItem('editor_token') || ''}` } },
            );
            setConfirmOpen(false);
            // The backend fires Review-row creation on a daemon thread and
            // returns 200 immediately. Refetch now to catch the fast path,
            // and again after ~1.5s to catch the slow path (agent4 finishes
            // token minting / commit). Without the second refetch a fresh
            // invitation can appear "lost" until the editor manually reloads.
            onAssigned();
            setTimeout(onAssigned, 1500);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Assignment failed.');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 mb-4">
                <p className="text-sm font-semibold text-blue-900">🤖 Ready to assign reviewers</p>
                <p className="text-xs text-blue-800 mt-1">
                    The Reviewer Suggester Agent has ranked candidates by expertise-match to this manuscript.
                    Pick as many as this manuscript warrants — your editorial judgement decides the number.
                    Nothing dispatches until you confirm.
                </p>
            </div>

            {loading ? (
                <p className="text-sm text-gray-500">Loading suggestions…</p>
            ) : error ? (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {error}
                </div>
            ) : suggestions.length === 0 ? (
                <p className="text-sm text-gray-500">
                    No matching reviewers found. Register more reviewers or broaden expertise tags first.
                </p>
            ) : (
                <div className="space-y-2">
                    {suggestions.map((r) => {
                        const checked = selected.has(r.reviewer_id);
                        const overloaded = r.current_load >= r.max_assignments;
                        const disabled = !checked && overloaded;
                        return (
                            <label
                                key={r.reviewer_id}
                                className={`flex items-start gap-3 rounded-lg px-4 py-3 border transition ${
                                    checked
                                        ? 'bg-blue-50 border-blue-300'
                                        : disabled
                                        ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
                                        : 'bg-gray-50 border-gray-100 hover:border-blue-200 cursor-pointer'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-1 accent-blue-600"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggle(r.reviewer_id)}
                                    aria-label={`Select ${r.name}`}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{r.name}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {(r.expertise_tags || []).join(', ') || '—'}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                        Load: {r.current_load}/{r.max_assignments}
                                        {overloaded && (
                                            <span className="ml-2 text-rose-700 font-semibold">at capacity</span>
                                        )}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                                    {Math.round(r.similarity_score * 100)}%
                                </span>
                            </label>
                        );
                    })}
                    <div className="mt-3 flex items-center justify-between">
                        <p className={`text-xs font-medium ${canDispatch ? 'text-emerald-700' : 'text-amber-800'}`}>
                            Selected: {selected.size} {canDispatch ? '· ready to invite' : '· pick at least one'}
                        </p>
                        <button
                            type="button"
                            onClick={() => setConfirmOpen(true)}
                            disabled={assigning || !canDispatch}
                            className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {assigning ? 'Assigning…' : `Invite ${selected.size || '…'} reviewers`}
                        </button>
                    </div>
                </div>
            )}

            {confirmOpen && canDispatch && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            Invite {selected.size} reviewers?
                        </h3>
                        <p className="text-sm text-gray-700 mb-3">
                            An email invitation with a signed review link will be sent to each of the
                            reviewers below. Nothing sends until you confirm.
                        </p>
                        <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm mb-4">
                            {suggestions
                                .filter((r) => selected.has(r.reviewer_id))
                                .map((r) => (
                                    <li key={r.reviewer_id} className="px-3 py-2 flex items-center justify-between">
                                        <span className="font-medium">{r.name}</span>
                                        <span className="text-xs text-blue-700">
                                            {Math.round(r.similarity_score * 100)}%
                                        </span>
                                    </li>
                                ))}
                        </ul>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                disabled={assigning}
                                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={dispatch}
                                disabled={assigning}
                                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:bg-gray-300"
                            >
                                {assigning ? 'Sending…' : 'Confirm & invite'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ScoreCell: React.FC<{ v: number | null }> = ({ v }) => {
    if (v == null) return <td className="px-3 py-2 text-center text-xs text-gray-300">—</td>;
    const tone =
        v >= 8 ? 'bg-emerald-50 text-emerald-800' :
        v >= 5 ? 'bg-amber-50 text-amber-900' :
        'bg-rose-50 text-rose-800';
    return (
        <td className="px-3 py-2 text-center">
            <span className={`inline-block w-9 rounded font-mono text-xs font-semibold py-0.5 ${tone}`}>
                {v.toFixed(1)}
            </span>
        </td>
    );
};

function recTone(rec: string): string {
    if (rec === 'accept') return 'bg-emerald-100 text-emerald-800';
    if (rec === 'reject') return 'bg-rose-100 text-rose-800';
    if (rec.includes('major')) return 'bg-orange-100 text-orange-900';
    if (rec.includes('minor')) return 'bg-amber-100 text-amber-900';
    return 'bg-gray-100 text-gray-800';
}

export default EditorBidRoomPage;
