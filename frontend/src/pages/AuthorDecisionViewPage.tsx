import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import client from '../api/client';

/*
 * Author decision-time view (spec §17).
 *
 * Renders each reviewer's report as the author sees it — Overall
 * Assessment, Major / Minor / Suggestions / Comments-to-Authors, and
 * the recommendation. Confidential-comments-to-editor is never fetched
 * (backend endpoint refuses to return it), so this page cannot leak it.
 */

interface StructuredComment {
    page?: string; section?: string; line?: string; comment: string;
}

interface AuthorReviewerReport {
    review_id: string;
    reviewer_display_name: string;
    round_number: number;
    submitted_at?: string | null;
    overall_assessment: string;
    major_comments: StructuredComment[];
    minor_comments: StructuredComment[];
    suggestions: string[];
    comments_to_authors: string;
    recommendation?: string | null;
}

interface AuthorDecisionResponse {
    submission_id: string;
    paper_title: string;
    editor_decision?: string | null;
    editor_decision_letter: string;
    decided_at?: string | null;
    round_number: number;
    reports: AuthorReviewerReport[];
}

const REC_STYLES: Record<string, { cls: string; label: string; emoji: string }> = {
    accepted:            { cls: 'bg-emerald-100 text-emerald-800', label: 'Accept',              emoji: '🟢' },
    minor_revision:      { cls: 'bg-blue-100 text-blue-800',       label: 'Minor Revision',      emoji: '🟡' },
    major_revision:      { cls: 'bg-amber-100 text-amber-900',     label: 'Major Revision',      emoji: '🔶' },
    revision_requested:  { cls: 'bg-amber-100 text-amber-900',     label: 'Revision Required',   emoji: '🔶' },
    rejected:            { cls: 'bg-rose-100 text-rose-800',       label: 'Reject',              emoji: '🔴' },
    reject_and_resubmit: { cls: 'bg-slate-200 text-slate-800',     label: 'Reject and Resubmit', emoji: '↻' },
};

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
    });
};

export default function AuthorDecisionViewPage() {
    const { submissionId = '' } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<AuthorDecisionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        client.get<AuthorDecisionResponse>(`/author-revision/submissions/${submissionId}/decision`)
            .then((r) => setData(r.data))
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/author-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load the decision.');
            })
            .finally(() => setLoading(false));
    }, [submissionId, navigate]);

    if (loading) return <div className="min-h-screen bg-gray-50"><Header /><Loading /><Footer /></div>;
    if (error || !data) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 py-12 max-w-4xl mx-auto w-full px-4">
                    <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error || 'Not found.'}</div>
                </main>
                <Footer />
            </div>
        );
    }

    const rec = data.editor_decision ? REC_STYLES[data.editor_decision] : null;

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-8 max-w-4xl mx-auto w-full px-4">
                <div className="mb-4">
                    <Link
                        to={`/author-dashboard/${submissionId}`}
                        className="text-sm text-gray-500 hover:text-blue-700"
                    >
                        ← Back to submission
                    </Link>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Editorial Decision</div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">{data.paper_title}</h1>
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                        {rec && (
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-bold text-sm ${rec.cls}`}>
                                <span aria-hidden>{rec.emoji}</span> {rec.label}
                            </span>
                        )}
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
                            Round {data.round_number}
                        </span>
                        {data.decided_at && (
                            <span className="text-xs text-gray-500">Decided: {formatDate(data.decided_at)}</span>
                        )}
                    </div>
                    {data.editor_decision_letter && (
                        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1">
                                Editor's decision letter
                            </div>
                            <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800">
                                {data.editor_decision_letter}
                            </pre>
                        </div>
                    )}
                    {(data.editor_decision === 'minor_revision' || data.editor_decision === 'major_revision' || data.editor_decision === 'revision_requested') && (
                        <div className="mt-4">
                            <Link
                                to={`/author-dashboard/${submissionId}/respond`}
                                className="inline-block px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-800"
                            >
                                Respond to reviewer comments →
                            </Link>
                        </div>
                    )}
                </div>

                <h2 className="text-lg font-black text-gray-900 mb-3">Reviewer Reports</h2>
                {data.reports.length === 0 ? (
                    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-500 text-sm">
                        No reviewer reports on this round.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {data.reports.map((r) => {
                            const rc = r.recommendation ? REC_STYLES[r.recommendation] : null;
                            return (
                                <div key={r.review_id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <div>
                                            <h3 className="text-base font-black text-gray-900">{r.reviewer_display_name}</h3>
                                            <div className="text-xs text-gray-500">Submitted: {formatDate(r.submitted_at)}</div>
                                        </div>
                                        {rc && (
                                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-bold text-xs ${rc.cls}`}>
                                                <span aria-hidden>{rc.emoji}</span> {rc.label}
                                            </span>
                                        )}
                                    </div>
                                    {r.overall_assessment && (
                                        <section className="mb-3">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                                                Overall Assessment
                                            </div>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.overall_assessment}</p>
                                        </section>
                                    )}
                                    {r.major_comments.length > 0 && (
                                        <section className="mb-3">
                                            <div className="text-[10px] uppercase tracking-widest text-rose-700 font-bold mb-1">
                                                Major Comments ({r.major_comments.length})
                                            </div>
                                            <ol className="list-decimal pl-5 space-y-2 text-sm">
                                                {r.major_comments.map((c, i) => (
                                                    <li key={i}>
                                                        {(c.page || c.section || c.line) && (
                                                            <div className="text-[11px] font-mono text-gray-500">
                                                                {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                    {r.minor_comments.length > 0 && (
                                        <section className="mb-3">
                                            <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold mb-1">
                                                Minor Comments ({r.minor_comments.length})
                                            </div>
                                            <ol className="list-decimal pl-5 space-y-2 text-sm">
                                                {r.minor_comments.map((c, i) => (
                                                    <li key={i}>
                                                        {(c.page || c.section || c.line) && (
                                                            <div className="text-[11px] font-mono text-gray-500">
                                                                {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                    {r.suggestions.length > 0 && (
                                        <section className="mb-3">
                                            <div className="text-[10px] uppercase tracking-widest text-blue-700 font-bold mb-1">
                                                Suggestions ({r.suggestions.length})
                                            </div>
                                            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                                                {r.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                            </ul>
                                        </section>
                                    )}
                                    {r.comments_to_authors && (
                                        <section>
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                                                Comments to Author
                                            </div>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.comments_to_authors}</p>
                                        </section>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="mt-6 text-xs text-gray-500 text-center">
                    Confidential comments from reviewers to the editor are not shown here.
                </p>
            </main>
            <Footer />
        </div>
    );
}
