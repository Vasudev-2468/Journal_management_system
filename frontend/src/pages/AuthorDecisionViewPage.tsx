import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import AuthorSidebar from '../components/authors/AuthorSidebar';

/*
 * Author decision-time view (spec §17).
 *
 * Wrapped in AuthorSidebar (not the public marketing Header) so the
 * page belongs to the Author Portal and the sidebar's cross-navigation
 * is available. Renders:
 *
 *   - Manuscript ID + title
 *   - Progress steps: Decision → Respond → Upload → Submit
 *   - Consensus panel across reviewers (from backend)
 *   - Editor decision letter body (backend synthesizes one if empty)
 *   - Revision deadline with a colour-coded countdown
 *   - Round-by-round decision history
 *   - Three CTAs: Respond · Submit revision · Download decision letter
 *   - Contact-editor mailto link
 *   - Each reviewer's report — Overall Assessment, Major/Minor comments
 *     (with a proper "Section X" label — the old "Page 1, 0" display bug
 *     is fixed by filtering "0"/empty section strings before rendering)
 *   - Recommendation-vs-comment-count mismatch flag when a reviewer
 *     recommends minor revision but raises major concerns
 *
 * Confidential comments-to-editor are DELIBERATELY never fetched by
 * the backend endpoint, so this page cannot leak them.
 */

interface StructuredComment {
    page?: string;
    section?: string;
    line?: string;
    comment: string;
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

interface ConsensusSummary {
    recommendation: string | null;
    strength: string | null;
    breakdown: Record<string, number>;
}

interface DecisionHistoryEntry {
    round_number: number;
    decision: string;
    decided_at?: string | null;
}

interface AuthorDecisionResponse {
    submission_id: string;
    paper_id_code?: string | null;
    paper_title: string;
    editor_decision?: string | null;
    editor_decision_letter: string;
    decided_at?: string | null;
    round_number: number;
    revision_deadline?: string | null;
    manuscript_url?: string | null;
    editorial_email?: string | null;
    consensus: ConsensusSummary;
    history: DecisionHistoryEntry[];
    reports: AuthorReviewerReport[];
}

const REC_STYLES: Record<string, { cls: string; label: string; emoji: string }> = {
    accepted:            { cls: 'bg-emerald-100 text-emerald-800', label: 'Accept',              emoji: '🟢' },
    accept:              { cls: 'bg-emerald-100 text-emerald-800', label: 'Accept',              emoji: '🟢' },
    minor_revision:      { cls: 'bg-blue-100 text-blue-800',       label: 'Minor Revision',      emoji: '🟡' },
    major_revision:      { cls: 'bg-amber-100 text-amber-900',     label: 'Major Revision',      emoji: '🔶' },
    revision_requested:  { cls: 'bg-amber-100 text-amber-900',     label: 'Revision Required',   emoji: '🔶' },
    rejected:            { cls: 'bg-rose-100 text-rose-800',       label: 'Reject',              emoji: '🔴' },
    reject_and_resubmit: { cls: 'bg-slate-200 text-slate-800',     label: 'Reject and Resubmit', emoji: '↻' },
    unknown:             { cls: 'bg-gray-100 text-gray-700',       label: 'No recommendation',   emoji: '·' },
};

const STRENGTH_LABEL: Record<string, string> = {
    unanimous: 'Unanimous',
    majority:  'Majority',
    split:     'Split',
};

const isRevision = (d?: string | null) =>
    !!d && ['minor_revision', 'major_revision', 'revision_requested', 'revision'].includes(d);

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

/** Render "Page 5, Section 3.1, line 12" — labels every part, drops
 *  blanks, and drops "0" (the backend's empty-value placeholder that
 *  used to leak into the UI as an unlabelled second number). */
function formatLocation(c: StructuredComment): string | null {
    const clean = (v?: string) => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        if (!s || s === '0') return null;
        return s;
    };
    const parts: string[] = [];
    const page = clean(c.page); if (page) parts.push(`Page ${page}`);
    const section = clean(c.section); if (section) parts.push(`Section ${section}`);
    const line = clean(c.line); if (line) parts.push(`Line ${line}`);
    return parts.length ? parts.join(', ') : null;
}

function daysUntil(iso?: string | null): number | null {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return null;
    return Math.ceil((target - Date.now()) / 86400000);
}

export default function AuthorDecisionViewPage() {
    const { submissionId = '' } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<AuthorDecisionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        client
            .get<AuthorDecisionResponse>(`/author-revision/submissions/${submissionId}/decision`)
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

    // Shell — sidebar chrome around the content column.
    const shell = (children: React.ReactNode) => (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-container { padding: 0 !important; }
                    aside { display: none !important; }
                }
            `}</style>
            <div className="flex min-h-screen bg-[#f0f7f0]">
                <div className="no-print">
                    <AuthorSidebar />
                </div>
                <main className="flex-1 min-w-0 py-8 px-4 lg:px-8 print-container">
                    <div className="max-w-4xl mx-auto">{children}</div>
                </main>
            </div>
        </>
    );

    if (loading) return shell(<div className="text-sm text-gray-500 py-16 text-center">Loading decision…</div>);
    if (error || !data) {
        return shell(
            <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700">
                {error || 'Not found.'}
            </div>,
        );
    }

    // Defensive defaults — an older backend (before this deploy) doesn't
    // return ``consensus``, ``history``, or ``revision_deadline``; treat
    // every optional list as empty and every optional object as empty so
    // the page renders instead of throwing on ``.length`` / ``.breakdown``.
    const rec = data.editor_decision ? REC_STYLES[data.editor_decision] : null;
    const consensus = data.consensus || { recommendation: null, strength: null, breakdown: {} };
    const consensusRec = consensus.recommendation ? REC_STYLES[consensus.recommendation] : null;
    const consensusBreakdown = consensus.breakdown || {};
    const history = data.history || [];
    const reports = data.reports || [];
    const daysLeft = daysUntil(data.revision_deadline);
    const showRevisionCtas = isRevision(data.editor_decision);

    const deadlineTone =
        daysLeft === null ? 'bg-gray-50 border-gray-200 text-gray-700'
        : daysLeft < 0    ? 'bg-rose-50 border-rose-200 text-rose-800'
        : daysLeft <= 7   ? 'bg-rose-50 border-rose-200 text-rose-800'
        : daysLeft <= 14  ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900';

    return shell(
        <>
            {/* Breadcrumb */}
            <nav className="text-xs text-gray-500 mb-4 no-print">
                <Link to="/author-dashboard" className="hover:underline">Dashboard</Link>
                <span className="mx-1">›</span>
                <Link to="/author/manuscripts" className="hover:underline">My Manuscripts</Link>
                <span className="mx-1">›</span>
                <Link to={`/author-dashboard/${submissionId}`} className="hover:underline">
                    {data.paper_id_code || submissionId.slice(0, 8)}
                </Link>
                <span className="mx-1">›</span>
                <span className="text-gray-700 font-semibold">Decision</span>
            </nav>

            {/* Progress steps (only shown for revision decisions) */}
            {showRevisionCtas && (
                <ol className="flex items-center gap-2 mb-4 text-xs no-print">
                    {[
                        { label: 'Decision received', done: true },
                        { label: 'Respond to reviewers', done: false, current: true },
                        { label: 'Upload revised manuscript', done: false },
                        { label: 'Submit revision', done: false },
                    ].map((s, i) => (
                        <li key={i} className="flex items-center gap-2">
                            <span className={
                                'inline-flex items-center gap-1 px-2 py-1 rounded-full font-semibold ' +
                                (s.done ? 'bg-emerald-100 text-emerald-800'
                                    : (s as any).current ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-500')
                            }>
                                {s.done ? '✓' : i + 1}
                                <span>{s.label}</span>
                            </span>
                            {i < 3 && <span className="text-gray-300">›</span>}
                        </li>
                    ))}
                </ol>
            )}

            {/* Decision card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
                <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Editorial Decision</div>
                <div className="flex items-start justify-between gap-4 flex-wrap mt-1">
                    <div className="min-w-0 flex-1">
                        {data.paper_id_code && (
                            <div className="text-xs font-mono text-gray-500 mb-1">{data.paper_id_code}</div>
                        )}
                        <h1 className="text-2xl font-black text-gray-900">{data.paper_title}</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="no-print text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50"
                        title="Download decision as PDF (via browser Print)"
                    >
                        📄 Download PDF
                    </button>
                </div>

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

                {/* Deadline */}
                {showRevisionCtas && (
                    <div className={`mt-4 rounded-lg border p-3 flex items-center gap-3 ${deadlineTone}`}>
                        <span aria-hidden className="text-lg">⏰</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold uppercase tracking-wider">
                                Revision deadline
                            </div>
                            <div className="text-sm font-semibold">
                                {formatDate(data.revision_deadline)}
                                {daysLeft !== null && (
                                    <span className="ml-2 text-xs opacity-80">
                                        ({daysLeft < 0 ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue` : `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Letter body */}
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

                {/* CTAs */}
                <div className="mt-5 flex flex-wrap gap-2 no-print">
                    {showRevisionCtas && (
                        <>
                            <Link
                                to={`/author-dashboard/${submissionId}/respond`}
                                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-800"
                            >
                                💬 Respond to reviewer comments →
                            </Link>
                            <Link
                                to={`/author-dashboard/${submissionId}/revise`}
                                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                            >
                                📤 Submit revised manuscript →
                            </Link>
                        </>
                    )}
                    {data.manuscript_url && (
                        <a
                            href={data.manuscript_url}
                            target="_blank" rel="noopener noreferrer"
                            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-sm font-bold hover:bg-gray-50"
                        >
                            📎 View manuscript
                        </a>
                    )}
                    {data.editorial_email && (
                        <a
                            href={`mailto:${data.editorial_email}?subject=${encodeURIComponent(`Question about ${data.paper_id_code || 'my submission'}`)}`}
                            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-sm font-bold hover:bg-gray-50"
                        >
                            ✉ Contact editor
                        </a>
                    )}
                </div>
            </div>

            {/* Consensus panel */}
            {consensus.recommendation && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-2">
                        Reviewer consensus
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {consensusRec && (
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-bold text-sm ${consensusRec.cls}`}>
                                <span aria-hidden>{consensusRec.emoji}</span> {consensusRec.label}
                            </span>
                        )}
                        {consensus.strength && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                {STRENGTH_LABEL[consensus.strength] || consensus.strength}
                            </span>
                        )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {Object.entries(consensusBreakdown).map(([k, v]) => {
                            const s = REC_STYLES[k] || REC_STYLES.unknown;
                            return (
                                <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>
                                    {s.label} × {v}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* History */}
            {history.length > 1 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-2">
                        Decision history
                    </div>
                    <ol className="space-y-1 text-sm text-gray-700">
                        {history.map((h, i) => {
                            const s = REC_STYLES[h.decision] || REC_STYLES.unknown;
                            return (
                                <li key={i} className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-500 w-16">Round {h.round_number}</span>
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>
                                        {s.label}
                                    </span>
                                    <span className="text-xs text-gray-500">{formatDate(h.decided_at)}</span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}

            {/* Reviewer reports */}
            <h2 className="text-lg font-black text-gray-900 mb-3">Reviewer Reports</h2>
            {reports.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-500 text-sm">
                    No reviewer reports on this round.
                </div>
            ) : (
                <div className="space-y-4">
                    {reports.map((r) => {
                        const rc = r.recommendation ? REC_STYLES[r.recommendation] : null;
                        // Defensive locals — a legacy backend may not include
                        // every array in the payload, so treat missing lists
                        // as empty rather than crash on ``.length``/``.map``.
                        const majorComments = r.major_comments || [];
                        const minorComments = r.minor_comments || [];
                        const suggestions = r.suggestions || [];
                        const mismatch =
                            r.recommendation === 'minor_revision' && majorComments.length > 0;
                        return (
                            <article key={r.review_id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                                <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                    <div>
                                        <h3 className="text-base font-black text-gray-900">{r.reviewer_display_name}</h3>
                                        <div className="text-xs text-gray-500">Submitted: {formatDate(r.submitted_at)}</div>
                                    </div>
                                    {rc && (
                                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-bold text-xs ${rc.cls}`}>
                                            <span aria-hidden>{rc.emoji}</span> {rc.label}
                                        </span>
                                    )}
                                </header>

                                {mismatch && (
                                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                                        <span aria-hidden>⚠</span>
                                        <span>
                                            This reviewer marked the paper as <strong>Minor Revision</strong> but
                                            raised <strong>{majorComments.length} major comment{majorComments.length === 1 ? '' : 's'}</strong>.
                                            Read the major comments carefully before assuming the changes are light.
                                        </span>
                                    </div>
                                )}

                                {r.overall_assessment && (
                                    <section className="mb-3">
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                                            Overall Assessment
                                        </div>
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.overall_assessment}</p>
                                    </section>
                                )}

                                {majorComments.length > 0 && (
                                    <section className="mb-3">
                                        <div className="text-[10px] uppercase tracking-widest text-rose-700 font-bold mb-1">
                                            Major Comments ({majorComments.length})
                                        </div>
                                        <ol className="list-decimal pl-5 space-y-2 text-sm">
                                            {majorComments.map((c, i) => {
                                                const loc = formatLocation(c);
                                                return (
                                                    <li key={i}>
                                                        {loc && <div className="text-[11px] font-mono text-gray-500">{loc}</div>}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    </section>
                                )}

                                {minorComments.length > 0 && (
                                    <section className="mb-3">
                                        <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold mb-1">
                                            Minor Comments ({minorComments.length})
                                        </div>
                                        <ol className="list-decimal pl-5 space-y-2 text-sm">
                                            {minorComments.map((c, i) => {
                                                const loc = formatLocation(c);
                                                return (
                                                    <li key={i}>
                                                        {loc && <div className="text-[11px] font-mono text-gray-500">{loc}</div>}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    </section>
                                )}

                                {suggestions.length > 0 && (
                                    <section className="mb-3">
                                        <div className="text-[10px] uppercase tracking-widest text-blue-700 font-bold mb-1">
                                            Suggestions ({suggestions.length})
                                        </div>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                                            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
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
                            </article>
                        );
                    })}
                </div>
            )}

            <p className="mt-6 text-xs text-gray-500 text-center">
                Confidential comments from reviewers to the editor are not shown here.
            </p>
        </>,
    );
}
