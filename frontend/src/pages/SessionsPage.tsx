import React, { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import ProtectedAuthorRoute from '../components/common/ProtectedAuthorRoute';
import {
    fetchMySessions,
    revokeSession,
    revokeOthers,
    SessionRow,
} from '../api/sessions';

/**
 * "Signed in on these devices" page.
 *
 * Shows every non-revoked session the current user has and lets them
 * kill one at a time or all-others in one click. The row matching the
 * current token comes back with ``is_current=true`` — its Revoke
 * button is disabled so a mis-click can't sign the user out of the
 * tab they're already on.
 *
 * The device column parses just enough of the User-Agent to be human
 * readable — full browser sniffing lives out of scope; we surface a
 * short label and truncate the raw UA below it for the tinkerers.
 */

const errorFrom = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return fallback;
};

const parseDevice = (ua: string | null): string => {
    if (!ua) return 'Unknown device';
    // Cheap sniff — we only need a friendly label. The full UA is
    // rendered in a muted line below.
    const s = ua;
    let os = '';
    if (/Windows/i.test(s)) os = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS';
    else if (/Android/i.test(s)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
    else if (/Linux/i.test(s)) os = 'Linux';

    let browser = '';
    if (/Edg\//i.test(s)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
    else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
    else if (/Firefox\//i.test(s)) browser = 'Firefox';
    else if (/Safari\//i.test(s)) browser = 'Safari';

    if (os && browser) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return os;
    return 'Unknown device';
};

const truncate = (s: string | null, n: number): string => {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

const relative = (iso: string): string => {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return iso;
    const diff = Date.now() - then;
    if (diff < 0) return 'just now';
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
};

const absolute = (iso: string): string => {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

const SessionsInner: React.FC = () => {
    const [rows, setRows] = useState<SessionRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchMySessions();
            setRows(data);
        } catch (err) {
            setError(errorFrom(err, 'Could not load your active sessions.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // load() closes over nothing that changes — safe to omit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRevoke = async (row: SessionRow) => {
        setError(null);
        setNotice(null);
        if (row.is_current) return; // UI disables the button anyway
        const label = parseDevice(row.user_agent);
        if (!window.confirm(`Sign out ${label}? This can't be undone.`)) return;

        setBusyId(row.id);
        try {
            await revokeSession(row.id);
            setNotice('That session has been signed out.');
            await load();
        } catch (err) {
            setError(errorFrom(err, 'Could not revoke that session.'));
        } finally {
            setBusyId(null);
        }
    };

    const handleRevokeOthers = async () => {
        setError(null);
        setNotice(null);
        if (
            !window.confirm(
                'Sign out every OTHER device you are signed into? You will stay signed in on this one.',
            )
        )
            return;
        setBulkBusy(true);
        try {
            const res = await revokeOthers();
            setNotice(
                res.revoked === 0
                    ? 'No other sessions were active.'
                    : `Signed out ${res.revoked} other session${res.revoked === 1 ? '' : 's'}.`,
            );
            await load();
        } catch (err) {
            setError(errorFrom(err, 'Could not revoke your other sessions.'));
        } finally {
            setBulkBusy(false);
        }
    };

    const otherCount = rows
        ? rows.filter((r) => !r.is_current).length
        : 0;

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-16">
                <div className="mx-auto max-w-4xl px-4">
                    <div className="mb-8">
                        <p className="text-xs uppercase tracking-widest text-brand-600 font-bold">
                            Account security
                        </p>
                        <h1 className="mt-1 text-3xl font-extrabold text-gray-900">
                            Signed in on these devices
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Every device that is currently signed into your
                            account is listed here. If you don't recognise one
                            — or you're using a shared computer and want to
                            clean up — you can sign it out with one click.
                        </p>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                        >
                            {error}
                        </div>
                    )}
                    {notice && (
                        <div
                            role="status"
                            className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-3"
                        >
                            {notice}
                        </div>
                    )}

                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="text-sm text-gray-500">
                                    Active sessions
                                </p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">
                                    {loading ? '…' : (rows?.length ?? 0)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleRevokeOthers}
                                disabled={bulkBusy || otherCount === 0 || loading}
                                className="rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-5 py-3 transition shadow"
                            >
                                {bulkBusy
                                    ? 'Signing out…'
                                    : 'Revoke all other sessions'}
                            </button>
                        </div>
                        {otherCount === 0 && rows && !loading && (
                            <p className="mt-3 text-xs text-gray-500">
                                You're only signed in on this device.
                            </p>
                        )}
                    </section>

                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">
                                            Device
                                        </th>
                                        <th className="px-4 py-3 font-semibold">
                                            IP
                                        </th>
                                        <th className="px-4 py-3 font-semibold">
                                            Last seen
                                        </th>
                                        <th className="px-4 py-3 font-semibold">
                                            Created
                                        </th>
                                        <th className="px-4 py-3 font-semibold text-right">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-8 text-center text-gray-500"
                                            >
                                                Loading your sessions…
                                            </td>
                                        </tr>
                                    )}
                                    {!loading && rows && rows.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-8 text-center text-gray-500"
                                            >
                                                No active sessions found.
                                            </td>
                                        </tr>
                                    )}
                                    {!loading &&
                                        rows &&
                                        rows.map((r) => (
                                            <tr
                                                key={r.id}
                                                className={
                                                    r.is_current
                                                        ? 'bg-brand-50/60'
                                                        : ''
                                                }
                                            >
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-gray-900">
                                                        {parseDevice(
                                                            r.user_agent,
                                                        )}
                                                        {r.is_current && (
                                                            <span className="ml-2 inline-block rounded-full bg-brand-600 text-white text-[10px] font-bold uppercase px-2 py-0.5 align-middle">
                                                                This device
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="text-xs text-gray-400 mt-1 font-mono break-all"
                                                        title={
                                                            r.user_agent || ''
                                                        }
                                                    >
                                                        {truncate(
                                                            r.user_agent,
                                                            80,
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top text-gray-700 font-mono text-xs">
                                                    {r.ip_address || '—'}
                                                </td>
                                                <td
                                                    className="px-4 py-3 align-top text-gray-700"
                                                    title={absolute(
                                                        r.last_seen_at,
                                                    )}
                                                >
                                                    {relative(r.last_seen_at)}
                                                </td>
                                                <td className="px-4 py-3 align-top text-gray-700">
                                                    {absolute(r.created_at)}
                                                </td>
                                                <td className="px-4 py-3 align-top text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleRevoke(r)
                                                        }
                                                        disabled={
                                                            r.is_current ||
                                                            busyId === r.id
                                                        }
                                                        className="rounded-lg bg-white hover:bg-red-50 border border-red-200 text-red-700 hover:text-red-800 text-xs font-semibold px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {busyId === r.id
                                                            ? 'Revoking…'
                                                            : r.is_current
                                                              ? 'Current'
                                                              : 'Revoke'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <p className="mt-6 text-xs text-gray-500">
                        Not sure how a device got here? Change your password
                        right away and revoke every other session.
                    </p>
                </div>
            </main>
            <Footer />
        </div>
    );
};

const SessionsPage: React.FC = () => (
    <ProtectedAuthorRoute>
        <SessionsInner />
    </ProtectedAuthorRoute>
);

export default SessionsPage;
