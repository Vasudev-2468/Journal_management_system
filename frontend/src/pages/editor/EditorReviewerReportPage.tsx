import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchReviewerReport } from '../../api/editor';

// Side-by-side PDF viewer (spec §8) — editor keeps the manuscript
// open while reading the reviewer report so they can verify claims
// against the paper without page-switching. The iframe uses the
// editor session JWT via query param because iframes can't send an
// Authorization header.
const buildEditorPdfUrl = (reviewId: string): string => {
    const base =
        (process.env.REACT_APP_API_URL as string | undefined) || 'http://localhost:8000';
    const token = localStorage.getItem('editor_token') || '';
    return `${base.replace(/\/$/, '')}/editor-portal/reviews/${reviewId}/pdf?token=${encodeURIComponent(token)}`;
};

// Full structured Reviewer Report as the editor sees it (spec §7-13).
// Renders the exact same shape the reviewer's Preview modal shows, but
// with the reviewer identity masked to "Anonymous Reviewer #N".

type StructuredComment = {
    page: string; section: string; line: string; comment: string;
};

interface ReviewerReport {
    review_id: string;
    manuscript_id: string;
    paper_title: string;
    reviewer_display_name: string;
    round_number: number;
    state: string;
    submitted_at?: string | null;
    overall_assessment: string;
    rubric_answers: Record<string, string>;
    major_comments: StructuredComment[];
    minor_comments: StructuredComment[];
    suggestions: string[];
    comments_to_authors: string;
    comments_to_editor: string;
    ethics_flag: boolean;
    ethics_note: string;
    recommendation?: string | null;
    confidence?: string | null;
    willing_to_review_revision?: boolean | null;
    editor_summary: string;
}

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

// Star rendering — turns a rubric answer ("excellent" / "good" / "fair"
// / "poor" or yes/partially/no) into a 4-star visual so the editor's
// card matches the spec §7 mockup.
const RATING_TO_STARS: Record<string, number> = {
    excellent: 5, good: 4, fair: 3, poor: 2,
    yes: 5, partially: 3, no: 1,
};

const StarRating: React.FC<{ value: string }> = ({ value }) => {
    const stars = RATING_TO_STARS[(value || '').toLowerCase()] || 0;
    return (
        <span className="text-amber-500 font-mono text-sm">
            {'★'.repeat(stars)}
            <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - stars))}</span>
        </span>
    );
};

const RUBRIC_LABEL: Record<string, string> = {
    originality: 'Originality',
    methodology: 'Methodology',
    technical_quality: 'Technical Quality',
    clarity: 'Presentation',
    references: 'References',
    in_scope: 'In scope for journal',
    research_question: 'Research question clear',
    novelty_contribution: 'Novel contribution',
    method_appropriate: 'Methodology appropriate',
    results_supported: 'Results supported',
};

const REC_STYLES: Record<string, { cls: string; label: string }> = {
    accept:         { cls: 'bg-emerald-100 text-emerald-800',   label: 'ACCEPT' },
    minor_revision: { cls: 'bg-blue-100 text-blue-800',         label: 'MINOR REVISION' },
    major_revision: { cls: 'bg-amber-100 text-amber-900',       label: '🔶 MAJOR REVISION' },
    reject:         { cls: 'bg-rose-100 text-rose-800',         label: 'REJECT' },
};

export default function EditorReviewerReportPage() {
    const { reviewId = '' } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<ReviewerReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Side-by-side toggle — some editors prefer full-width report on
    // smaller displays. Defaults to on for wide screens.
    const [showPdf, setShowPdf] = useState(true);

    useEffect(() => {
        fetchReviewerReport(reviewId)
            .then(setReport)
            .catch((err: any) => {
                if (err?.response?.status === 401) {
                    navigate('/editor-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load the report.');
            })
            .finally(() => setLoading(false));
    }, [reviewId, navigate]);

    if (loading) return <div className="p-8">Loading…</div>;
    if (error || !report) return <div className="p-8 text-red-700">{error || 'Not found.'}</div>;

    const rec = report.recommendation ? REC_STYLES[report.recommendation] : null;

    const pdfUrl = buildEditorPdfUrl(reviewId);

    return (
        <div className="min-h-screen bg-gray-50 py-6 px-4">
            <div className="max-w-[1600px] mx-auto">
                <div className="mb-4 flex items-center justify-between">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                    <button
                        type="button"
                        onClick={() => setShowPdf((v) => !v)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
                    >
                        {showPdf ? '📄 Hide PDF' : '📄 Show PDF side-by-side'}
                    </button>
                </div>

                <div className={showPdf ? 'grid grid-cols-1 xl:grid-cols-2 gap-6' : ''}>
                    {showPdf && (
                        <div className="hidden xl:block">
                            <div className="bg-white rounded-xl border border-gray-200 sticky top-6 h-[calc(100vh-96px)] overflow-hidden flex flex-col">
                                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between text-xs">
                                    <span className="font-medium text-gray-700 truncate">Manuscript PDF</span>
                                    <a
                                        href={pdfUrl}
                                        target="_blank" rel="noreferrer"
                                        className="text-blue-700 hover:underline"
                                    >Open ↗</a>
                                </div>
                                <iframe
                                    src={pdfUrl}
                                    title="Manuscript"
                                    className="flex-1 w-full"
                                />
                            </div>
                        </div>
                    )}

                    <div className="min-w-0">

                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                    <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">Reviewer Report</div>
                    <h1 className="text-2xl font-bold text-gray-900">{report.paper_title}</h1>
                    <div className="mt-1 font-mono text-xs text-gray-500">{report.manuscript_id}</div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Reviewer</div>
                            <div className="text-sm font-medium text-gray-900">{report.reviewer_display_name}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Round</div>
                            <div className="text-sm font-medium text-gray-900">Round {report.round_number}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Submitted</div>
                            <div className="text-sm text-gray-800">{formatDate(report.submitted_at)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Confidence</div>
                            <div className="text-sm font-medium text-gray-900">{(report.confidence || '—').toUpperCase()}</div>
                        </div>
                    </div>
                    {rec && (
                        <div className="mt-4">
                            <span className={`inline-block px-3 py-1 rounded-full font-bold text-sm ${rec.cls}`}>
                                {rec.label}
                            </span>
                            {report.willing_to_review_revision !== null && (
                                <span className="ml-3 text-xs text-gray-600">
                                    Willing to review revised version: <strong>{report.willing_to_review_revision ? 'YES' : 'NO'}</strong>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {report.ethics_flag && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
                        <div className="text-sm font-bold text-rose-800 mb-1">⚠ Ethics concern flagged</div>
                        <p className="text-sm text-rose-900 whitespace-pre-wrap">
                            {report.ethics_note || '(no note provided)'}
                        </p>
                    </div>
                )}

                {/* Rubric with stars */}
                {Object.keys(report.rubric_answers).length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Overall Evaluation</h2>
                        <table className="w-full text-sm">
                            <tbody>
                                {Object.entries(report.rubric_answers).map(([k, v]) => (
                                    <tr key={k} className="border-b border-gray-100 last:border-b-0">
                                        <td className="py-2 text-gray-700">{RUBRIC_LABEL[k] || k}</td>
                                        <td className="py-2 text-right"><StarRating value={v} /></td>
                                        <td className="py-2 pl-3 text-xs text-gray-500 uppercase w-20">{v}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {report.overall_assessment && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Overall Assessment</h2>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.overall_assessment}</p>
                    </div>
                )}

                {report.major_comments.length > 0 && (
                    <div className="bg-white rounded-xl border border-rose-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-2">
                            Major Comments ({report.major_comments.length})
                        </h2>
                        <ol className="list-decimal pl-5 space-y-3">
                            {report.major_comments.map((c, i) => (
                                <li key={i}>
                                    {(c.page || c.section || c.line) && (
                                        <div className="text-[11px] font-mono text-gray-500">
                                            {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                        </div>
                                    )}
                                    <div className="text-sm text-gray-900 whitespace-pre-wrap">{c.comment}</div>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {report.minor_comments.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2">
                            Minor Comments ({report.minor_comments.length})
                        </h2>
                        <ol className="list-decimal pl-5 space-y-3">
                            {report.minor_comments.map((c, i) => (
                                <li key={i}>
                                    {(c.page || c.section || c.line) && (
                                        <div className="text-[11px] font-mono text-gray-500">
                                            {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                        </div>
                                    )}
                                    <div className="text-sm text-gray-900 whitespace-pre-wrap">{c.comment}</div>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {report.suggestions.length > 0 && (
                    <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-2">
                            Suggestions ({report.suggestions.length})
                        </h2>
                        <ul className="list-disc pl-5 space-y-1">
                            {report.suggestions.map((s, i) => (
                                <li key={i} className="text-sm text-gray-800">{s}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {report.comments_to_authors && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">Comments to Author</h2>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.comments_to_authors}</p>
                    </div>
                )}

                {report.comments_to_editor && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 mb-4">
                        <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider mb-1">
                            Confidential Comments to Editor
                        </h2>
                        <p className="text-xs text-amber-800 mb-2">The author cannot access this section.</p>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{report.comments_to_editor}</p>
                    </div>
                )}

                {report.editor_summary && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-2">
                            Editor Summary <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agent</span>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap text-gray-800 font-sans">{report.editor_summary}</pre>
                    </div>
                )}
                    </div>
                </div>
            </div>
        </div>
    );
}
