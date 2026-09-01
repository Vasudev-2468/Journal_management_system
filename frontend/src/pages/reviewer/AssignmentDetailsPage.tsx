import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import {
    AssignmentDetail,
    acceptAssignment,
    declineAssignment,
    fetchAssignment,
} from '../../api/reviewerPortal';

// Assignment details page — spec §5-8.
//
// Two states share this route:
//   * Pre-accept  → shows the "Review Invitation" card with the paper
//                   summary and the COI declaration + Accept / Decline.
//   * Post-accept → shows the manuscript workspace (files, guidelines,
//                   and a Continue Review CTA that opens the form).

const formatDate = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const humanBytes = (n?: number | null) => {
    if (!n || n <= 0) return '';
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
};

const GUIDELINES = [
    'Evaluate originality',
    'Evaluate methodology',
    'Evaluate technical quality',
    'Check references',
    'Identify major limitations',
    'Provide constructive comments',
    'Maintain confidentiality',
];

export default function AssignmentDetailsPage() {
    const { reviewId = '' } = useParams();
    const navigate = useNavigate();

    const [detail, setDetail] = useState<AssignmentDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // COI form state
    const [coiChoice, setCoiChoice] = useState<'none' | 'declared' | null>(null);
    const [coiReason, setCoiReason] = useState('');
    const [declineReason, setDeclineReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [flashError, setFlashError] = useState<string | null>(null);

    const reload = () => {
        if (!reviewId) return;
        setLoading(true);
        fetchAssignment(reviewId)
            .then(setDetail)
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load this assignment.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [reviewId]);

    const handleAccept = async () => {
        if (!detail) return;
        if (coiChoice === null) {
            setFlashError('Please make a conflict-of-interest declaration first.');
            return;
        }
        if (coiChoice === 'declared' && coiReason.trim().length < 10) {
            setFlashError('Please briefly describe the conflict (at least 10 characters).');
            return;
        }
        setBusy(true); setFlashError(null);
        try {
            await acceptAssignment(detail.review_id, {
                coi_declared: coiChoice === 'none',
                coi_reason: coiChoice === 'declared' ? coiReason.trim() : undefined,
            });
            reload();
        } catch (err: any) {
            setFlashError(err?.response?.data?.detail || 'Could not accept the assignment.');
        } finally {
            setBusy(false);
        }
    };

    const handleDecline = async () => {
        if (!detail) return;
        if (!window.confirm('Decline this review assignment? This cannot be undone.')) return;
        setBusy(true); setFlashError(null);
        try {
            await declineAssignment(detail.review_id, declineReason.trim() || undefined);
            navigate('/reviewer-dashboard', { replace: true });
        } catch (err: any) {
            setFlashError(err?.response?.data?.detail || 'Could not decline the assignment.');
        } finally {
            setBusy(false);
        }
    };

    const preAccept = detail && !detail.accepted_at && detail.state !== 'submitted' && detail.state !== 'declined';

    return (
        <ReviewerPortalLayout active="assignments">
            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : !detail ? null : (
                <>
                    <div className="mb-4">
                        <Link to="/reviewer/assignments" className="text-sm text-gray-500 hover:text-blue-700">
                            ← Back to assignments
                        </Link>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                                    Review Invitation
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 mt-1">
                                    {detail.paper_title}
                                </h1>
                                <div className="mt-1 font-mono text-xs text-gray-500">{detail.manuscript_id}</div>
                            </div>
                            <span className="text-[11px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 uppercase">
                                {detail.state.replace('_', ' ')}
                            </span>
                        </div>

                        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            <div>
                                <dt className="text-gray-500">Manuscript ID</dt>
                                <dd className="font-medium text-gray-900">{detail.manuscript_id}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Article Type</dt>
                                <dd className="font-medium text-gray-900">{detail.article_type || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Research Area</dt>
                                <dd className="font-medium text-gray-900">{detail.subject || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Assigned Date</dt>
                                <dd className="font-medium text-gray-900">{formatDate(detail.assigned_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Review Deadline</dt>
                                <dd className="font-medium text-gray-900">{formatDate(detail.deadline)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Authors</dt>
                                <dd className="font-medium text-gray-900">{detail.authors_display}</dd>
                            </div>
                        </dl>

                        {detail.abstract && (
                            <div className="mt-6">
                                <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">
                                    Abstract
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.abstract}</p>
                            </div>
                        )}
                    </div>

                    {preAccept ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-2">Conflict of Interest Declaration</h2>
                            <p className="text-sm text-gray-600 mb-3">
                                Please confirm your position before accepting the review.
                                {' '}
                                <span className="text-gray-500">
                                    Author identities are hidden — the COI check is for institutional or topical
                                    conflicts you can infer from the paper.
                                </span>
                            </p>
                            <label className="flex items-start gap-2 mb-2 text-sm">
                                <input
                                    type="radio" name="coi"
                                    checked={coiChoice === 'none'}
                                    onChange={() => setCoiChoice('none')}
                                />
                                <span>I have <strong>no conflict of interest</strong> with the authors or this manuscript.</span>
                            </label>
                            <label className="flex items-start gap-2 mb-3 text-sm">
                                <input
                                    type="radio" name="coi"
                                    checked={coiChoice === 'declared'}
                                    onChange={() => setCoiChoice('declared')}
                                />
                                <span>I have a <strong>conflict of interest</strong> — I'll describe it below.</span>
                            </label>
                            {coiChoice === 'declared' && (
                                <textarea
                                    value={coiReason} onChange={(e) => setCoiReason(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg text-sm p-2 mb-2"
                                    rows={3}
                                    placeholder="Briefly describe the nature of the conflict…"
                                />
                            )}
                            {flashError && (
                                <div role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                    {flashError}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                    type="button" onClick={handleAccept} disabled={busy}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                                >
                                    {busy ? 'Working…' : 'Accept Review'}
                                </button>
                                <button
                                    type="button" onClick={handleDecline} disabled={busy}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                                >
                                    Decline Review
                                </button>
                            </div>
                            <div className="mt-3">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Decline reason (optional)
                                </label>
                                <input
                                    type="text" value={declineReason}
                                    onChange={(e) => setDeclineReason(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg text-sm p-2"
                                    placeholder="Out of scope, time constraint, etc."
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900">Manuscript Files</h2>
                                <Link
                                    to={`/reviewer/assignment/${detail.review_id}/review`}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800"
                                >
                                    {detail.state === 'submitted' ? 'View submitted review' : 'Continue Review'}
                                </Link>
                            </div>
                            {detail.files.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-3">
                                    No files attached to this manuscript yet.
                                </p>
                            ) : (
                                <ul className="mt-4 divide-y divide-gray-100">
                                    {detail.files.map((f) => (
                                        <li key={f.id} className="flex items-center justify-between py-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-gray-900 truncate">
                                                    📄 {f.filename}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {humanBytes(f.size_bytes)}{f.kind ? ` · ${f.kind}` : ''}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Review Guidelines</h2>
                        <p className="text-sm text-gray-600 mb-3">Before submitting your review:</p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-800">
                            {GUIDELINES.map((g) => (
                                <li key={g} className="flex items-start gap-2">
                                    <span aria-hidden className="text-emerald-600">✓</span>
                                    <span>{g}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4">
                            <Link
                                to="/reviewer/guidelines"
                                className="text-sm text-blue-700 hover:underline"
                            >
                                View complete reviewer guidelines →
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </ReviewerPortalLayout>
    );
}
