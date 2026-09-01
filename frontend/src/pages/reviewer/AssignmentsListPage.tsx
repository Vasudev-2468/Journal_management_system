import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { AssignmentSummary, fetchAssignments } from '../../api/reviewerPortal';

// Split the "pending" concept in two — matches the dashboard cards:
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

const rowActionLabel = (state: string): string => {
    if (state === 'invited') return 'View & Respond';
    if (state === 'accepted') return 'Start Review';
    if (state === 'in_progress' || state === 'overdue') return 'Continue Review';
    if (state === 'submitted') return 'View Report';
    return 'View';
};

const fmt = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function AssignmentsListPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<AssignmentSummary[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'submitted'>('active');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAssignments()
            .then(setRows)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError('Could not load your assignments.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const filtered = rows.filter((r) => {
        if (filter === 'all') return true;
        if (filter === 'submitted') return r.state === 'submitted';
        return ['invited', 'accepted', 'in_progress', 'overdue'].includes(r.state);
    });

    return (
        <ReviewerPortalLayout active="assignments">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs font-semibold">
                    {(['active', 'submitted', 'all'] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setFilter(k)}
                            className={
                                'px-3 py-1.5 rounded-md ' +
                                (filter === k ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900')
                            }
                        >
                            {k[0].toUpperCase() + k.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                    Nothing to show for this filter.
                </div>
            ) : (
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
                            {filtered.map((r) => {
                                const style = STATUS_STYLES[r.state] || STATUS_STYLES.invited;
                                return (
                                    <tr key={r.review_id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.manuscript_id}</td>
                                        <td className="px-4 py-3 text-gray-900">
                                            <div className="line-clamp-1">{r.paper_title}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmt(r.assigned_at)}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmt(r.deadline)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${style.cls}`}>
                                                {style.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                to={`/reviewer/assignment/${r.review_id}`}
                                                className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                            >
                                                {rowActionLabel(r.state)} →
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </ReviewerPortalLayout>
    );
}
