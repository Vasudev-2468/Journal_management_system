import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { Alert, fetchNotifications } from '../../api/reviewerPortal';

const ICON: Record<Alert['kind'], string> = {
    new_invite: '🔵',
    deadline:   '🟡',
    submitted:  '🟢',
};

export default function NotificationsPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchNotifications()
            .then(setRows)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError('Could not load notifications.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    return (
        <ReviewerPortalLayout active="notifications">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Notifications</h1>
            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : rows.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                    You're all caught up.
                </div>
            ) : (
                <ul className="space-y-2">
                    {rows.map((n, i) => (
                        <li key={`${n.kind}-${n.review_id}-${i}`} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                            <span aria-hidden className="text-xl leading-none">{ICON[n.kind]}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900">{n.title}</div>
                                <div className="text-sm text-gray-700 mt-0.5">{n.detail}</div>
                            </div>
                            {n.action_url && (
                                <Link
                                    to={n.action_url}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold whitespace-nowrap"
                                >
                                    View
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </ReviewerPortalLayout>
    );
}
