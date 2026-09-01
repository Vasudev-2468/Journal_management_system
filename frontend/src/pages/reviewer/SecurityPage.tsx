import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { SecurityResponse, fetchSecurity } from '../../api/reviewerPortal';

// Account Security — spec §20. Read-only snapshot for now; the
// change-password / 2FA / "sign out everywhere" actions land on the
// reviewer-auth router as follow-on work.
export default function SecurityPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<SecurityResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchSecurity()
            .then(setData)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError('Could not load account security.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const humanTime = (iso?: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    };

    return (
        <ReviewerPortalLayout active="security">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Account Security</h1>
            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="text-red-700">{error}</div>
            ) : !data ? null : (
                <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Email</div>
                                <div className="text-sm text-gray-600">{data.email}</div>
                            </div>
                            <span className={
                                'text-[11px] font-bold px-2 py-0.5 rounded ' +
                                (data.email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')
                            }>
                                {data.email_verified ? '✓ Verified' : 'Unverified'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Password</div>
                                <div className="text-sm text-gray-600">
                                    Last changed: {humanTime(data.password_last_changed_at)}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold"
                                onClick={() => alert('Change-password flow ships as part of the next release.')}
                            >
                                Change Password
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Two-Factor Authentication</div>
                                <div className="text-sm text-gray-600">
                                    {data.twofa_enabled ? 'Enabled — codes generated via authenticator app' : 'Disabled'}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold"
                                onClick={() => alert('2FA enrollment for reviewers ships as part of the next release.')}
                            >
                                {data.twofa_enabled ? 'Manage 2FA' : 'Enable 2FA'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Active Sessions</div>
                                <div className="text-sm text-gray-600">{data.active_sessions}</div>
                            </div>
                            <button
                                type="button"
                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
                                onClick={() => alert('Session revocation for reviewers ships as part of the next release.')}
                            >
                                Sign out of all devices
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ReviewerPortalLayout>
    );
}
