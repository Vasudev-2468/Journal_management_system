import React from 'react';
import { Link } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';

// Reviewer Guidelines + Help. Static content, but rendered inside the
// same portal shell so the reviewer never has to leave the workspace.

const CHECKLIST = [
    'Evaluate the originality of the contribution.',
    'Evaluate the technical quality and methodology.',
    'Check that the results are supported by the evidence presented.',
    'Verify references — completeness, accuracy, and relevance.',
    'Identify major limitations and clearly state them.',
    'Keep comments constructive; separate opinion from evidence.',
    'Preserve confidentiality — do not share the manuscript.',
    'Declare any conflict of interest immediately.',
];

const FAQ: Array<{ q: string; a: string }> = [
    {
        q: 'What happens after I submit my review?',
        a: 'The editor is notified and the Editor Summary Agent compresses your review into a card for the editorial decision. You cannot modify your review after submission unless the editor re-opens it.',
    },
    {
        q: 'What does the Review Assistant do?',
        a: 'It scans your draft for structural gaps (missing rubric answers, thin comments, recommendation vs. rubric mismatch). It never rewrites your text — your scientific judgement stays yours.',
    },
    {
        q: 'Can I take multiple sessions to complete a review?',
        a: 'Yes — the portal autosaves your draft every 12 seconds while you edit. You can log out and return; your draft is preserved until you submit.',
    },
    {
        q: "I can't complete the review in time — what should I do?",
        a: 'Decline the assignment from the Assignment Details page. The editor will be notified and can invite another reviewer.',
    },
];

export default function GuidelinesPage() {
    return (
        <ReviewerPortalLayout active="guidelines">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Reviewer Guidelines</h1>
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Before submitting a review
                </h2>
                <ul className="space-y-2 text-sm text-gray-800">
                    {CHECKLIST.map((c) => (
                        <li key={c} className="flex items-start gap-2">
                            <span aria-hidden className="text-emerald-600">✓</span>
                            <span>{c}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Frequently Asked Questions
                </h2>
                <div className="space-y-4">
                    {FAQ.map(({ q, a }) => (
                        <div key={q}>
                            <div className="text-sm font-semibold text-gray-900">{q}</div>
                            <p className="text-sm text-gray-700 mt-1">{a}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                    Need help?
                </h2>
                <p className="text-sm text-gray-700">
                    Reach out to the editorial office from the{' '}
                    <Link to="/contact" className="text-blue-700 hover:underline">contact page</Link>.
                </p>
            </div>
        </ReviewerPortalLayout>
    );
}
