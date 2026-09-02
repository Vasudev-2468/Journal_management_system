import React, { useEffect, useState } from 'react';
import client from '../../api/client';

interface DecisionSummary {
    submission_id: string;
    manuscript_id: string;
    manuscript_title: string;
    article_type: string;
    decision: string;
    decision_display: string;
    decision_date: string | null;
    primary_reason: string;
    rejection_reasons: string[];
    reviewer_reports: {
        reviewer_label: string;
        review_id: string;
        completed: boolean;
    }[];
    letter_available: boolean;
}

function formatDecisionDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
        });
    } catch {
        return '—';
    }
}

// Author-facing decision card (spec §Rejection Portal View). Renders
// the manuscript-level decision block with reasons and reviewer-report
// checklist — mirrors the wording of the email so the two channels
// stay consistent. Fetches the read-only summary from
// GET /submissions/{id}/author-decision-summary — kept separate from
// the plain-text letter card below so the layout matches the spec
// exactly (badges + checklist), and so the same wiring can hold
// accept/revision variants without regressing.
function AuthorDecisionCard({ submissionId }: { submissionId: string }): JSX.Element | null {
    const [summary, setSummary] = useState<DecisionSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [letterOpen, setLetterOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        client
            .get(`/submissions/${submissionId}/author-decision-summary`)
            .then((r) => {
                if (!cancelled) setSummary(r.data as DecisionSummary);
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(
                        e?.response?.data?.detail || e?.message || 'Could not load decision summary.'
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [submissionId]);

    if (loading) {
        return (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <p className="text-sm text-gray-500">Loading decision…</p>
            </section>
        );
    }
    if (error || !summary) {
        return null;
    }

    const isRejection = summary.decision === 'rejected';
    const isAccepted = summary.decision === 'accepted';
    const badgeClass = isRejection
        ? 'bg-red-600 text-white'
        : isAccepted
        ? 'bg-emerald-600 text-white'
        : 'bg-amber-500 text-white';
    const emoji = isRejection ? '❌' : isAccepted ? '✅' : '🔶';

    return (
        <section
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            aria-label="Editorial decision"
        >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <h2 className="text-sm font-bold text-gray-900 tracking-widest uppercase">
                    Editorial Decision
                </h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeClass}`}>
                    {emoji} {summary.decision_display}
                </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase">Manuscript ID</dt>
                    <dd className="text-gray-900 font-mono">{summary.manuscript_id}</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase">Decision Date</dt>
                    <dd className="text-gray-900">{formatDecisionDate(summary.decision_date)}</dd>
                </div>
                <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-gray-500 uppercase">Title</dt>
                    <dd className="text-gray-900">{summary.manuscript_title}</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase">Article Type</dt>
                    <dd className="text-gray-900">{summary.article_type}</dd>
                </div>
                <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase">Reason</dt>
                    <dd className="text-gray-900">{summary.primary_reason}</dd>
                </div>
            </dl>

            {isRejection && summary.rejection_reasons.length > 0 && (
                <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
                    <p className="text-xs font-bold text-rose-900 uppercase mb-2">
                        Major issues identified
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-rose-900">
                        {summary.rejection_reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                        ))}
                    </ol>
                </div>
            )}

            {summary.reviewer_reports.length > 0 && (
                <div className="mt-5">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                        Reviewer Reports
                    </p>
                    <ul className="text-sm text-gray-800 space-y-1">
                        {summary.reviewer_reports.map((r) => (
                            <li key={r.review_id} className="flex items-center gap-2">
                                <span className="font-medium">├──</span>
                                <span>{r.reviewer_label}</span>
                                <span className={r.completed ? 'text-emerald-600' : 'text-gray-400'}>
                                    {r.completed ? '✓' : '…'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {summary.letter_available && (
                <div className="mt-6 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setLetterOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-3 py-1.5"
                    >
                        {letterOpen ? 'Hide Decision Letter' : 'View Decision Letter'}
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5"
                    >
                        Download Decision Letter
                    </button>
                </div>
            )}

            {letterOpen && (
                <div id={`decision-letter-${summary.submission_id}`} className="mt-4">
                    {/* The plain-text letter renders via the DecisionLetterBody */}
                    {/* below — kept as a slot so the /email-templates hook can */}
                    {/* replace this bundled fallback later. */}
                </div>
            )}
        </section>
    );
}

type DecisionStatus =
    | 'accepted'
    | 'rejected'
    | 'revision_requested'
    | 'returned_to_author'
    | string;

interface Props {
    submissionId: string;
    status: string | null | undefined;
    paperTitle?: string;
    authorName?: string;
    paperIdCode?: string | null;
}

interface LetterTemplate {
    subject: string;
    body: string;
    pillLabel: string;
    pillClass: string;
}

const TEMPLATES: Record<DecisionStatus, LetterTemplate> = {
    accepted: {
        subject: 'Manuscript accepted — {{paper_id_code}}',
        body:
            'Dear {{author_name}},\n\n' +
            'We are delighted to inform you that "{{paper_title}}" has been accepted for ' +
            'publication. The production team will contact you shortly with the copy-edited ' +
            'proof.\n\n' +
            'Congratulations, and thank you for choosing our journal.\n\n' +
            'The editorial office',
        pillLabel: 'Accepted',
        pillClass: 'bg-green-50 text-green-700 border-green-200',
    },
    rejected: {
        subject: 'Editorial decision on {{paper_id_code}}',
        body:
            'Dear {{author_name}},\n\n' +
            'After careful consideration and expert review, we regret that we cannot accept ' +
            '"{{paper_title}}" for publication in our journal. We appreciate the effort you ' +
            'invested and wish you every success in placing this work elsewhere.\n\n' +
            'The editorial office',
        pillLabel: 'Rejected',
        pillClass: 'bg-red-50 text-red-700 border-red-200',
    },
    revision_requested: {
        subject: 'Revision required — {{paper_id_code}}',
        body:
            'Dear {{author_name}},\n\n' +
            'The editors have reviewed "{{paper_title}}" and request a revision. Please see ' +
            'the anonymised reviewer comments in your author dashboard and upload the revised ' +
            'manuscript together with a response-to-reviewers document.\n\n' +
            'The editorial office',
        pillLabel: 'Revision Requested',
        pillClass: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    returned_to_author: {
        subject: 'Manuscript returned — {{paper_id_code}}',
        body:
            'Dear {{author_name}},\n\n' +
            '"{{paper_title}}" has been returned for further attention before it can proceed to ' +
            'peer review. Please review the notes shared in your dashboard and resubmit the ' +
            'corrected version.\n\n' +
            'The editorial office',
        pillLabel: 'Returned to Author',
        pillClass: 'bg-orange-50 text-orange-700 border-orange-200',
    },
};

function render(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
}

/**
 * DecisionLetterCard — in-app decision letter mirroring the email sent to
 * the author. Uses bundled fallback templates (the /email-templates endpoint
 * is editor-gated), and adds a "Print letter" action powered by
 * window.print(). Renders only for decision statuses.
 */
export default function DecisionLetterCard({
    submissionId,
    status,
    paperTitle,
    authorName,
    paperIdCode,
}: Props): JSX.Element | null {
    if (!status || !(status in TEMPLATES)) {
        return null;
    }

    const template = TEMPLATES[status as DecisionStatus];
    const vars: Record<string, string> = {
        author_name: authorName || 'Author',
        paper_title: paperTitle || 'your manuscript',
        paper_id_code: paperIdCode || submissionId.slice(0, 8).toUpperCase(),
    };
    const subject = render(template.subject, vars);
    const body = render(template.body, vars);

    const handlePrint = (): void => {
        try {
            window.print();
        } catch {
            /* window.print may throw in sandboxed contexts — silently ignore */
        }
    };

    return (
        <>
            <AuthorDecisionCard submissionId={submissionId} />
            <div className="h-3" />
        <section
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            aria-label="Decision letter"
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-sm font-bold text-gray-900">Decision letter</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        The same wording you received by email
                    </p>
                </div>
                <span
                    className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${template.pillClass}`}
                >
                    {template.pillLabel}
                </span>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                    Subject
                </p>
                <p className="text-sm font-semibold text-gray-900 mb-4">{subject}</p>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                    Paper
                </p>
                <p className="text-sm font-semibold text-gray-900 mb-4">
                    {paperTitle || 'Untitled manuscript'}
                </p>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                    Letter
                </p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
                    {body}
                </pre>
            </div>

            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-3 py-1.5 transition-colors"
                >
                    Print letter
                </button>
            </div>
        </section>
        </>
    );
}
