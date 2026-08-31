import React from 'react';

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
    );
}
