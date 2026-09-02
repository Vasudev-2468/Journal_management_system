import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { SecurityResponse, fetchSecurity } from '../../api/reviewerPortal';
import client from '../../api/client';
import { clearReviewerToken } from '../../api/reviewerAuth';

// Account Security — spec §20 + this-turn's real endpoints.

export default function SecurityPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<SecurityResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showPwd, setShowPwd] = useState(false);
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [pwdBusy, setPwdBusy] = useState(false);

    const [totpEnrol, setTotpEnrol] = useState<null | { qr_data_uri: string; secret: string }>(null);
    const [totpCode, setTotpCode] = useState('');
    const [totpBusy, setTotpBusy] = useState(false);

    const [flash, setFlash] = useState<string | null>(null);
    const [sessions, setSessions] = useState<Array<{
        id: number; device_label: string; ip_address?: string | null;
        created_at: string; last_seen_at: string; is_current?: boolean;
    }>>([]);

    const loadSessions = () => {
        client.get('/reviewer-auth/sessions').then((r) => setSessions(r.data || [])).catch(() => setSessions([]));
    };
    useEffect(() => { loadSessions(); }, []);

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

    const handleChangePassword = async () => {
        if (newPwd.length < 8) { alert('New password must be at least 8 characters.'); return; }
        setPwdBusy(true);
        try {
            await client.post('/reviewer-auth/change-password', {
                current_password: currentPwd, new_password: newPwd,
            });
            setFlash('Password updated.');
            setCurrentPwd(''); setNewPwd(''); setShowPwd(false);
            setTimeout(() => setFlash(null), 3000);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not change password.');
        } finally {
            setPwdBusy(false);
        }
    };

    const handleSignOutEverywhere = async () => {
        if (!window.confirm('Sign out of every device? You will need to sign in again on this browser.')) return;
        try {
            await client.post('/reviewer-auth/sign-out-everywhere');
            clearReviewerToken();
            navigate('/reviewer-login', { replace: true });
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not sign out.');
        }
    };

    const startTotp = async () => {
        setTotpBusy(true);
        try {
            const { data: res } = await client.post('/reviewer-auth/totp/start');
            setTotpEnrol({ qr_data_uri: res.qr_data_uri, secret: res.secret });
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not start TOTP enrolment.');
        } finally {
            setTotpBusy(false);
        }
    };
    const confirmTotp = async () => {
        setTotpBusy(true);
        try {
            await client.post('/reviewer-auth/totp/confirm', { code: totpCode });
            setTotpEnrol(null); setTotpCode('');
            setFlash('Authenticator enrolled.');
            setTimeout(() => setFlash(null), 3000);
            const res = await fetchSecurity();
            setData(res);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Code did not match.');
        } finally {
            setTotpBusy(false);
        }
    };
    const disableTotp = async () => {
        if (!window.confirm('Disable authenticator?')) return;
        try {
            await client.post('/reviewer-auth/totp/disable');
            setFlash('Authenticator disabled.');
            setTimeout(() => setFlash(null), 3000);
            const res = await fetchSecurity();
            setData(res);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not disable authenticator.');
        }
    };

    const humanTime = (iso?: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    };

    return (
        <ReviewerPortalLayout active="security">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Account Security</h1>
            {flash && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{flash}</div>}
            {loading ? (
                <Loading />
            ) : error || !data ? (
                <div role="alert" className="text-red-700">{error}</div>
            ) : (
                <div className="space-y-4">
                    {/* Email */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Email</div>
                            <div className="text-sm text-gray-600">{data.email}</div>
                        </div>
                        <span className={'text-[11px] font-bold px-2 py-0.5 rounded ' + (data.email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
                            {data.email_verified ? '✓ Verified' : 'Unverified'}
                        </span>
                    </div>

                    {/* Password */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Password</div>
                                <div className="text-sm text-gray-600">Last changed: {humanTime(data.password_last_changed_at)}</div>
                            </div>
                            <button
                                type="button" onClick={() => setShowPwd((v) => !v)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold"
                            >
                                {showPwd ? 'Cancel' : 'Change Password'}
                            </button>
                        </div>
                        {showPwd && (
                            <div className="mt-3 space-y-2">
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-700">Current password</span>
                                    <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-700">New password</span>
                                    <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                </label>
                                <button
                                    type="button" onClick={handleChangePassword} disabled={pwdBusy}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                                >
                                    {pwdBusy ? 'Saving…' : 'Save new password'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 2FA */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Two-Factor Authentication</div>
                                <div className="text-sm text-gray-600">
                                    {data.twofa_enabled ? 'Enabled — codes generated via authenticator app' : 'Disabled'}
                                </div>
                            </div>
                            {data.twofa_enabled ? (
                                <button type="button" onClick={disableTotp} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 font-semibold">
                                    Disable
                                </button>
                            ) : (
                                <button type="button" onClick={startTotp} disabled={totpBusy} className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-50">
                                    {totpBusy ? 'Working…' : 'Enable 2FA'}
                                </button>
                            )}
                        </div>
                        {totpEnrol && (
                            <div className="mt-4 rounded-lg border border-gray-200 p-4 bg-gray-50">
                                <p className="text-sm text-gray-700 mb-2">
                                    Scan this QR with your authenticator app, then enter the 6-digit code below to finish enrolment.
                                </p>
                                <img src={totpEnrol.qr_data_uri} alt="Authenticator QR" className="w-40 h-40 border border-gray-200 rounded bg-white" />
                                <p className="text-xs text-gray-600 mt-2">
                                    Or paste this secret into your app: <span className="font-mono">{totpEnrol.secret}</span>
                                </p>
                                <div className="mt-3 flex gap-2">
                                    <input type="text" inputMode="numeric" pattern="[0-9]{6}" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 font-mono" placeholder="123456" />
                                    <button type="button" onClick={confirmTotp} disabled={totpBusy || totpCode.length !== 6} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50">Confirm</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sessions */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Active Sessions</div>
                                <div className="text-sm text-gray-600">
                                    {sessions.length} device{sessions.length === 1 ? '' : 's'} signed in
                                </div>
                            </div>
                            <button
                                type="button" onClick={handleSignOutEverywhere}
                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
                            >
                                Sign out of all devices
                            </button>
                        </div>
                        {sessions.length === 0 ? (
                            <p className="text-xs text-gray-500">No active sessions listed.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                                {sessions.map((s) => (
                                    <li key={s.id} className="flex items-center gap-3 p-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                {s.device_label || 'Unknown device'}
                                                {s.is_current && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">This device</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {s.ip_address ? `IP ${s.ip_address} · ` : ''}
                                                Signed in {new Date(s.created_at).toLocaleDateString()} · Last seen {new Date(s.last_seen_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        {!s.is_current && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (!window.confirm(`Revoke ${s.device_label}?`)) return;
                                                    await client.post(`/reviewer-auth/sessions/${s.id}/revoke`);
                                                    loadSessions();
                                                }}
                                                className="text-xs px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </ReviewerPortalLayout>
    );
}
