import React, { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { getAuthorToken } from '../../api/authorAuth';
import AuthorSidebar from '../../components/authors/AuthorSidebar';

/*
 * Author-portal chrome wrapper.
 *
 * The sidebar has ten nav items. Some (Dashboard, Revisions, Profile,
 * Revise / Respond / Decision) land on fully-built pages; the others
 * — Messages, Notifications, Decision Letters, Published Articles,
 * Settings, My Manuscripts filter views — either share the dashboard's
 * submissions data or don't have a bespoke workspace yet. Rather than
 * spawning six near-empty page components, this one wrapper renders
 * the sidebar chrome around whatever the caller passes as ``children``,
 * and exposes ``useAuthorSubmissions()`` so a caller that needs the
 * standard submissions list doesn't have to re-fetch it.
 */

interface Submission {
    id: string;
    paper_id_code: string | null;
    paper_title: string;
    status: string;
    submitted_at?: string;
    updated_at?: string;
}

export function useAuthorSubmissions() {
    const navigate = useNavigate();
    const [subs, setSubs] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!getAuthorToken()) { navigate('/author-login', { replace: true }); return; }
        setLoading(true);
        client.get('/submissions/my-submissions', {
            headers: { Authorization: `Bearer ${getAuthorToken()}` },
        })
            .then((r) => setSubs(r.data?.items || []))
            .catch((e: any) => {
                if (e?.response?.status === 401) navigate('/author-login', { replace: true });
                else setError(e?.response?.data?.detail || 'Could not load submissions.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const counts = {
        total: subs.length,
        revisions_required: subs.filter(
            (s) => s.status === 'revision_requested' || s.status === 'returned_to_author',
        ).length,
    };

    return { subs, loading, error, counts };
}

interface Props {
    title: string;
    icon: string;
    subtitle?: string;
    children: ReactNode;
    counts?: Record<string, number>;
}

const AuthorPageChrome: React.FC<Props> = ({ title, icon, subtitle, children, counts }) => {
    return (
        <div className="flex min-h-screen bg-[#f0f7f0]">
            <AuthorSidebar pendingCounts={counts || {}} />
            <main className="flex-1 min-w-0 py-8 px-4 lg:px-8">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <span aria-hidden>{icon}</span> {title}
                        </h1>
                        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
                    </div>
                    {children}
                </div>
            </main>
        </div>
    );
};

// ── Individual page components ─────────────────────────

function SubmissionsList({
    filter,
    empty,
}: {
    filter?: (s: Submission) => boolean;
    empty: string;
}) {
    const { subs, loading, error, counts } = useAuthorSubmissions();
    const rows = filter ? subs.filter(filter) : subs;

    if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>;
    if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>;
    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                {empty}
            </div>
        );
    }
    return (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Manuscript</th>
                        <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Title</th>
                        <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                        <th className="text-right text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.paper_id_code || s.id.slice(0, 8)}</td>
                            <td className="px-4 py-3">
                                <div className="text-sm font-semibold text-gray-900 truncate max-w-md">{s.paper_title}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700">{s.status.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-3 text-right">
                                <Link to={`/author-dashboard/${s.id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                                    Open →
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                Total submissions on file: {counts.total}
            </div>
        </div>
    );
}

export const AuthorManuscriptsPage: React.FC = () => {
    const { counts } = useAuthorSubmissions();
    return (
        <AuthorPageChrome
            title="My Manuscripts" icon="📄"
            subtitle="Every paper you have submitted to JGAIR."
            counts={counts}
        >
            <SubmissionsList empty="You haven't submitted any papers yet." />
        </AuthorPageChrome>
    );
};

export const AuthorPublishedPage: React.FC = () => {
    const { counts } = useAuthorSubmissions();
    return (
        <AuthorPageChrome
            title="Published Articles" icon="📚"
            subtitle="Papers that have been accepted and are now part of the record."
            counts={counts}
        >
            <SubmissionsList
                filter={(s) => s.status === 'accepted'}
                empty="No published papers yet. Accepted papers land here once production is complete."
            />
        </AuthorPageChrome>
    );
};

export const AuthorDecisionLettersPage: React.FC = () => {
    const { subs, loading, error, counts } = useAuthorSubmissions();
    const rows = subs.filter((s) =>
        ['revision_requested', 'accepted', 'rejected', 'reject_and_resubmit', 'returned_to_author'].includes(s.status),
    );
    return (
        <AuthorPageChrome
            title="Decision Letters" icon="📜"
            subtitle="Editorial decisions the editor has issued on your papers."
            counts={counts}
        >
            {loading ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
            ) : error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
            ) : rows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                    No decision letters yet. You'll see one here as soon as the editor issues a decision.
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((s) => (
                        <Link
                            key={s.id} to={`/author-dashboard/${s.id}/decision`}
                            className="block bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all no-underline"
                        >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="min-w-0">
                                    <div className="text-xs font-mono text-gray-500">{s.paper_id_code || s.id.slice(0, 8)}</div>
                                    <div className="text-sm font-semibold text-gray-900 truncate">{s.paper_title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Decision: {s.status.replace(/_/g, ' ')}</div>
                                </div>
                                <span className="text-xs font-semibold text-blue-700">View letter →</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </AuthorPageChrome>
    );
};

export const AuthorMessagesPage: React.FC = () => {
    const { counts } = useAuthorSubmissions();
    return (
        <AuthorPageChrome
            title="Messages" icon="💬"
            subtitle="Direct messages from the editorial office and reviewers."
            counts={counts}
        >
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                Messaging is available on each submission's page. Open a paper from{' '}
                <Link to="/author/manuscripts" className="text-blue-700 hover:underline">My Manuscripts</Link>{' '}
                to view its message thread with the editor.
            </div>
        </AuthorPageChrome>
    );
};

export const AuthorNotificationsPage: React.FC = () => {
    const { counts } = useAuthorSubmissions();
    return (
        <AuthorPageChrome
            title="Notifications" icon="🔔"
            subtitle="A running log of every event on your papers."
            counts={counts}
        >
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                Real-time notifications appear in the bell menu on the dashboard header. A dedicated inbox view is coming.
            </div>
        </AuthorPageChrome>
    );
};

export const AuthorSettingsPage: React.FC = () => {
    const { counts } = useAuthorSubmissions();
    return (
        <AuthorPageChrome
            title="Settings" icon="⚙️"
            subtitle="Manage your account preferences."
            counts={counts}
        >
            <ul className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                <li>
                    <Link to="/author-profile" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 no-underline">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Edit profile</div>
                            <div className="text-xs text-gray-500">Name, affiliation, ORCID, and contact details.</div>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Open →</span>
                    </Link>
                </li>
                <li>
                    <Link to="/change-password" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 no-underline">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Change password</div>
                            <div className="text-xs text-gray-500">Rotate the password on your author account.</div>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Open →</span>
                    </Link>
                </li>
                <li>
                    <Link to="/sessions" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 no-underline">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Active sessions</div>
                            <div className="text-xs text-gray-500">Review or revoke devices signed into your account.</div>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Open →</span>
                    </Link>
                </li>
                <li>
                    <Link to="/recovery-codes" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 no-underline">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Recovery codes</div>
                            <div className="text-xs text-gray-500">Backup codes for signing in without your authenticator.</div>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Open →</span>
                    </Link>
                </li>
                <li>
                    <Link to="/privacy-controls" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 no-underline">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Privacy controls</div>
                            <div className="text-xs text-gray-500">Data export and account deletion requests.</div>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Open →</span>
                    </Link>
                </li>
            </ul>
        </AuthorPageChrome>
    );
};
