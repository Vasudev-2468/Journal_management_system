import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../components/reviewer/ReviewerPortalLayout';
import Loading from '../components/common/Loading';
import { getReviewerToken } from '../api/reviewerAuth';
import {
    AssignmentSummary, Alert, DashboardResponse, fetchDashboard,
} from '../api/reviewerPortal';

// Reviewer dashboard — the landing page for the reviewer portal.
// Uses the shared /reviewer-portal/dashboard endpoint so counters,
// alerts, and the active-assignments preview are all computed
// server-side, and every value is honest against a single source of
// truth. See spec §2-4 for the layout.

// Status pill labels — split the "pending" concept into two distinct
// user-visible states so the reviewer knows exactly what they owe:
//   invited      → PENDING INVITATION  (needs accept/decline decision)
//   accepted     → REVIEW PENDING       (accepted, hasn't started)
//   in_progress  → IN PROGRESS          (accepted, draft saved)
const STATUS_STYLES: Record<string, { cls: string; label: string }> = {
    invited:     { cls: 'bg-blue-100 text-blue-700',       label: 'PENDING INVITATION' },
    accepted:    { cls: 'bg-indigo-100 text-indigo-700',   label: 'REVIEW PENDING' },
    in_progress: { cls: 'bg-amber-100 text-amber-800',     label: 'IN PROGRESS' },
    submitted:   { cls: 'bg-emerald-100 text-emerald-700', label: 'SUBMITTED' },
    overdue:     { cls: 'bg-rose-100 text-rose-700',       label: 'OVERDUE' },
    declined:    { cls: 'bg-slate-200 text-slate-700',     label: 'DECLINED' },
    cancelled:   { cls: 'bg-gray-200 text-gray-700',       label: 'CANCELLED' },
    expired:     { cls: 'bg-gray-200 text-gray-600',       label: 'EXPIRED' },
};

const formatDate = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// ── Summary card ─────────────────────────────────────────

const TONE: Record<string, { border: string; value: string; label: string }> = {
    blue:    { border: 'border-blue-200',    value: 'text-blue-700',    label: 'text-blue-900' },
    amber:   { border: 'border-amber-200',   value: 'text-amber-700',   label: 'text-amber-900' },
    rose:    { border: 'border-rose-200',    value: 'text-rose-700',    label: 'text-rose-900' },
    emerald: { border: 'border-emerald-200', value: 'text-emerald-700', label: 'text-emerald-900' },
};

const SummaryCard: React.FC<{
    label: string; value: number; tone: keyof typeof TONE; hint?: string;
}> = ({ label, value, tone, hint }) => {
    const t = TONE[tone];
    return (
        <div className={`bg-white rounded-xl border ${t.border} p-4`}>
            <div className={`text-xs uppercase tracking-wider font-semibold ${t.label}`}>{label}</div>
            <div className={`mt-2 text-3xl font-bold ${t.value}`}>{value}</div>
            {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
        </div>
    );
};

// ── Alert card ───────────────────────────────────────────

const ALERT_STYLES: Record<Alert['kind'], { border: string; bg: string; icon: string }> = {
    deadline:   { border: 'border-amber-200',   bg: 'bg-amber-50',   icon: '⚠️' },
    new_invite: { border: 'border-blue-200',    bg: 'bg-blue-50',    icon: '📩' },
    submitted:  { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: '✅' },
};

const AlertCard: React.FC<{ alert: Alert }> = ({ alert }) => {
    const s = ALERT_STYLES[alert.kind];
    const label =
        alert.kind === 'new_invite' ? 'View Invitation' :
        alert.kind === 'deadline' ? 'Continue Review' :
        'View Details';
    return (
        <div className={`flex items-start gap-3 rounded-xl border ${s.border} ${s.bg} p-4`}>
            <span aria-hidden className="text-xl leading-none">{s.icon}</span>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{alert.title}</div>
                <div className="text-sm text-gray-700 mt-0.5">{alert.detail}</div>
            </div>
            {alert.action_url && (
                <Link
                    to={alert.action_url}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 whitespace-nowrap"
                >
                    {label}
                </Link>
            )}
        </div>
    );
};

// ── Assignments table ────────────────────────────────────

const AssignmentsTable: React.FC<{ rows: AssignmentSummary[] }> = ({ rows }) => {
    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
                <span className="text-3xl block mb-2" aria-hidden>📬</span>
                <p className="text-sm text-gray-500">
                    You have no active manuscripts right now.
                </p>
            </div>
        );
    }
    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                        <th className="px-4 py-3">Manuscript</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Assigned</th>
                        <th className="px-4 py-3">Deadline</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => {
                        const style = STATUS_STYLES[r.state] || STATUS_STYLES.invited;
                        // Row action label follows the two-pending split:
                        // invited     → "View & Respond" (leads to the COI card)
                        // accepted    → "Start Review"   (opens the workspace)
                        // in_progress → "Continue Review"
                        // overdue     → "Continue Review" (still owed)
                        // submitted   → "View Report"
                        const actionLabel =
                            r.state === 'invited' ? 'View & Respond' :
                            r.state === 'accepted' ? 'Start Review' :
                            r.state === 'in_progress' ? 'Continue Review' :
                            r.state === 'overdue' ? 'Continue Review' :
                            r.state === 'submitted' ? 'View Report' :
                            'View';
                        return (
                            <tr key={r.review_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.manuscript_id}</td>
                                <td className="px-4 py-3 text-gray-900">
                                    <div className="line-clamp-1">{r.paper_title}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(r.assigned_at)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(r.deadline)}</td>
                                <td className="px-4 py-3">
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${style.cls}`}>{style.label}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Link
                                        to={`/reviewer/assignment/${r.review_id}`}
                                        className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                    >
                                        {actionLabel} →
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ── Page ─────────────────────────────────────────────────

export default function ReviewerDashboardPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!getReviewerToken()) {
            navigate('/reviewer-login', { replace: true });
            return;
        }
        fetchDashboard()
            .then(setData)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                // Surface the backend's detail (e.g. FastAPI's HTTPException
                // string, or the SQL error message wrapped by a 500) so the
                // user gets an actionable message instead of a generic one.
                const detail = err?.response?.data?.detail;
                const status = err?.response?.status;
                const detailStr = typeof detail === 'string'
                    ? detail
                    : (detail && JSON.stringify(detail)) || err?.message || '';
                setError(
                    status
                        ? `Could not load the dashboard (${status}): ${detailStr || 'server error'}`
                        : `Could not load the dashboard: ${detailStr || 'network error'}`,
                );
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    return (
        <ReviewerPortalLayout active="dashboard" pendingInvites={data?.counters.invited || 0}>
            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : !data ? null : (
                <>
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">
                            Welcome, {data.reviewer_name.split(' ')[0] || 'Reviewer'}
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Here's what needs your attention today.</p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
                        <SummaryCard
                            label="New Invitations" tone="blue"
                            value={data.counters.invited}
                            hint="Needs response"
                        />
                        <SummaryCard
                            label="Pending Reviews" tone="amber"
                            value={data.counters.pending_reviews}
                            hint="Needs completion"
                        />
                        <SummaryCard
                            label="Due Soon" tone="amber"
                            value={data.counters.due_soon}
                            hint="Within 7 days"
                        />
                        <SummaryCard
                            label="Completed" tone="emerald"
                            value={data.counters.completed_this_year}
                            hint="This year"
                        />
                        <SummaryCard
                            label="Overdue" tone="rose"
                            value={data.counters.overdue}
                            hint={data.counters.overdue === 0 ? 'Nothing overdue' : 'Action required'}
                        />
                    </div>

                    {data.alerts.length > 0 && (
                        <div className="space-y-2 mb-8">
                            {data.alerts.map((a, i) => <AlertCard key={`${a.kind}-${i}`} alert={a} />)}
                        </div>
                    )}

                    <section className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold text-gray-900">Assigned Manuscripts</h2>
                            <Link to="/reviewer/assignments" className="text-sm text-blue-700 hover:underline">
                                View all →
                            </Link>
                        </div>
                        <AssignmentsTable rows={data.active} />
                    </section>
                </>
            )}
        </ReviewerPortalLayout>
    );
}
