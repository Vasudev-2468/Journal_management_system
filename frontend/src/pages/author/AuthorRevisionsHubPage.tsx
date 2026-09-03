import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { getAuthorToken } from '../../api/authorAuth';
import AuthorSidebar from '../../components/authors/AuthorSidebar';

/*
 * Revisions hub — the landing page for the Revisions nav item.
 *
 * Lists every submission that currently needs the author's attention
 * (``revision_requested`` or ``returned_to_author``), and every
 * submission whose revision has already been sent back to the editor,
 * with clear CTAs into the existing revision workflow:
 *
 *   /author-dashboard/:id/decision → View decision letter
 *   /author-dashboard/:id/respond  → Point-by-point response
 *   /author-dashboard/:id/revise   → Upload revised manuscript
 *
 * Purely a hub — the actual writing / uploading UIs live in the
 * per-page workspaces that were built earlier.
 */

interface Submission {
    id: string;
    paper_id_code: string | null;
    paper_title: string;
    status: string;
    submitted_at?: string;
    updated_at?: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
    revision_requested: { label: 'Revision requested', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
    returned_to_author: { label: 'Returned to author', tone: 'bg-orange-100 text-orange-900 border-orange-300' },
    under_review:       { label: 'Under review',        tone: 'bg-blue-100 text-blue-800 border-blue-300' },
};

export default function AuthorRevisionsHubPage() {
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
                else setError(e?.response?.data?.detail || 'Could not load your revisions.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const openRevisions = subs.filter(
        (s) => s.status === 'revision_requested' || s.status === 'returned_to_author',
    );
    const inFlightReview = subs.filter((s) => s.status === 'under_review');
    const revisionCounts = { revisions_required: openRevisions.length };

    return (
        <div className="flex min-h-screen bg-[#f0f7f0]">
            <AuthorSidebar pendingCounts={revisionCounts} />

            <main className="flex-1 min-w-0 py-8 px-4 lg:px-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <span aria-hidden>🔄</span> Revisions
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Papers waiting on your response, and revisions currently back with the editor.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                            {error}
                        </div>
                    )}

                    {/* ── Action required ────────────────────── */}
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-800">
                                Action required
                            </h2>
                            <span className="text-xs text-gray-500">
                                {openRevisions.length} paper{openRevisions.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        {loading ? (
                            <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
                        ) : openRevisions.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                                No revisions pending. Anything the editor sends back will land here.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {openRevisions.map((s) => (
                                    <RevisionCard key={s.id} submission={s} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── In flight ──────────────────────────── */}
                    {inFlightReview.length > 0 && (
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-2">
                                Revision back with the editor
                            </h2>
                            <div className="space-y-3">
                                {inFlightReview.map((s) => (
                                    <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div className="min-w-0">
                                                <div className="text-xs font-mono text-gray-500">
                                                    {s.paper_id_code || s.id.slice(0, 8)}
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 truncate">
                                                    {s.paper_title}
                                                </div>
                                            </div>
                                            <Link
                                                to={`/author-dashboard/${s.id}`}
                                                className="text-xs text-blue-700 hover:underline font-semibold"
                                            >
                                                View status →
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}

const RevisionCard: React.FC<{ submission: Submission }> = ({ submission: s }) => {
    const status = STATUS_LABEL[s.status] || { label: s.status, tone: 'bg-gray-100 text-gray-700 border-gray-300' };
    return (
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span aria-hidden className="text-lg">✏️</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-900">
                        Revision required
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${status.tone}`}>
                        {status.label}
                    </span>
                </div>
                <div className="text-xs font-mono text-gray-600">
                    {s.paper_id_code || s.id.slice(0, 8)}
                </div>
            </div>

            <div className="p-5">
                <div className="text-base font-black text-gray-900 mb-1">{s.paper_title}</div>
                {s.updated_at && (
                    <div className="text-xs text-gray-500">
                        Decision received {new Date(s.updated_at).toLocaleDateString()}
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Link
                        to={`/author-dashboard/${s.id}/decision`}
                        className="text-center text-xs font-bold px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
                    >
                        📜 View decision
                    </Link>
                    <Link
                        to={`/author-dashboard/${s.id}/respond`}
                        className="text-center text-xs font-bold px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
                    >
                        💬 Respond to reviewers
                    </Link>
                    <Link
                        to={`/author-dashboard/${s.id}/revise`}
                        className="text-center text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        📤 Submit revision
                    </Link>
                </div>
            </div>
        </div>
    );
};
