import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { AssignmentSummary, fetchHistory } from '../../api/reviewerPortal';

const fmt = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const REC_LABELS: Record<string, string> = {
    accept: 'Accept',
    minor_revision: 'Minor Revision',
    major_revision: 'Major Revision',
    reject: 'Reject',
};

export default function ReviewHistoryPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<AssignmentSummary[]>([]);
    const [year, setYear] = useState<string>('');
    const [rec, setRec] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const params: any = {};
        if (year) params.year = Number(year);
        if (rec) params.recommendation = rec;
        fetchHistory(params)
            .then(setRows)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError('Could not load your review history.');
            })
            .finally(() => setLoading(false));
    }, [year, rec, navigate]);

    // Only completed reviews count as "history".
    const history = useMemo(() => rows.filter((r) => r.state === 'submitted'), [rows]);
    const years = useMemo(() => {
        const s = new Set<number>();
        rows.forEach((r) => {
            const y = new Date(r.completed_at || r.assigned_at).getFullYear();
            if (!Number.isNaN(y)) s.add(y);
        });
        return Array.from(s).sort((a, b) => b - a);
    }, [rows]);

    return (
        <ReviewerPortalLayout active="history">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900">
                    Review History <span className="text-sm font-normal text-gray-500 ml-2">Total: {history.length}</span>
                </h1>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                <select
                    value={year} onChange={(e) => setYear(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                    <option value="">All years</option>
                    {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select
                    value={rec} onChange={(e) => setRec(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                    <option value="">All recommendations</option>
                    {Object.entries(REC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>

            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : history.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                    No completed reviews match this filter.
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Manuscript</th>
                                <th className="px-4 py-3">Title</th>
                                <th className="px-4 py-3">Submitted</th>
                                <th className="px-4 py-3">Recommendation</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {history.map((r) => (
                                <tr key={r.review_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.manuscript_id}</td>
                                    <td className="px-4 py-3 text-gray-900">
                                        <div className="line-clamp-1">{r.paper_title}</div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmt(r.completed_at)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                                        {r.recommendation ? REC_LABELS[r.recommendation] || r.recommendation : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            to={`/reviewer/assignment/${r.review_id}`}
                                            className="inline-block text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold"
                                        >
                                            View →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </ReviewerPortalLayout>
    );
}
