import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

import Loading from '../components/common/Loading';
import {
    InviteInfo,
    acceptInvite,
    declineInvite,
    fetchInvite,
} from '../api/reviewerInvite';

// Explicit accept/decline landing card for a reviewer invitation.
//
// The invitation URL email now carries ``/reviewer-invite/:token`` so
// the reviewer sees the paper title + abstract excerpt + deadline
// BEFORE anything is recorded on their behalf. Clicking Accept POSTs
// /reviewer-invite/:token/accept then navigates into the existing
// review portal at /review/:token. Clicking Decline opens a small
// dialog for an optional reason and POSTs /reviewer-invite/:token/decline.
//
// When the invitation has already been accepted (or otherwise moved
// past ``pending``) the buttons collapse to a single "continue to your
// review" link, so a reviewer who clicks the email a second time isn't
// re-prompted to accept something they've already accepted.

type Status =
    | 'loading'
    | 'ready'
    | 'expired'
    | 'not_found'
    | 'error'
    | 'declined';

const formatDeadline = (iso: string | null): string | null => {
    if (!iso) return null;
    // The backend hands us an ISO string that came from
    // ``datetime.isoformat()`` — plain Date parsing works for that
    // shape and falls through to the raw string if the browser
    // rejects it.
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

const ReviewerInvitePage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [status, setStatus] = useState<Status>('loading');
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [info, setInfo] = useState<InviteInfo | null>(null);

    // Accept-button state.
    const [accepting, setAccepting] = useState(false);

    // Decline-dialog state.
    const [declineOpen, setDeclineOpen] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [declining, setDeclining] = useState(false);
    const [declineError, setDeclineError] = useState<string | null>(null);
    const [declineMessage, setDeclineMessage] = useState<string>('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMsg('No invitation token was supplied.');
            return;
        }
        let cancelled = false;
        fetchInvite(token)
            .then((data) => {
                if (cancelled) return;
                setInfo(data);
                setStatus('ready');
            })
            .catch((err) => {
                if (cancelled) return;
                const code = err?.response?.status;
                const detail = err?.response?.data?.detail || '';
                if (code === 404) {
                    setStatus('not_found');
                } else if (code === 410) {
                    setStatus('expired');
                } else {
                    setStatus('error');
                    setErrorMsg(
                        typeof detail === 'string' && detail
                            ? detail
                            : 'We were unable to load this invitation. Please try again shortly.',
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleAccept = useCallback(async () => {
        if (!token) return;
        setAccepting(true);
        try {
            const res = await acceptInvite(token);
            // Backend returns the reviewer-portal path. Navigate rather
            // than hard-refresh so the SPA transition preserves in-app
            // state, but fall back to the token-based path if for any
            // reason the response is malformed.
            const target = res.review_url || `/review/${token}`;
            navigate(target);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setErrorMsg(
                typeof detail === 'string' && detail
                    ? detail
                    : 'We could not record your acceptance. Please try again.',
            );
            setStatus('error');
        } finally {
            setAccepting(false);
        }
    }, [navigate, token]);

    const handleDeclineConfirm = useCallback(async () => {
        if (!token) return;
        setDeclining(true);
        setDeclineError(null);
        try {
            const res = await declineInvite(token, declineReason);
            setDeclineMessage(
                res.message ||
                    "Thank you — we've noted your decline.",
            );
            setStatus('declined');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setDeclineError(
                typeof detail === 'string' && detail
                    ? detail
                    : 'We could not record your decline. Please try again.',
            );
        } finally {
            setDeclining(false);
        }
    }, [declineReason, token]);

    // ── Render: loading ────────────────────────────────
    if (status === 'loading') {
        return <Loading fullScreen label="Loading your invitation" />;
    }

    // ── Render: token no longer valid ──────────────────
    if (status === 'not_found' || status === 'expired' || status === 'error') {
        const heading =
            status === 'not_found'
                ? 'Invitation not found'
                : status === 'expired'
                  ? 'Invitation expired'
                  : 'Something went wrong';
        const message =
            status === 'not_found'
                ? 'We could not find an invitation matching this link. Please check that the URL is correct or contact the editorial office.'
                : status === 'expired'
                  ? 'This invitation has passed its deadline. If you still wish to review, please contact the editorial office.'
                  : errorMsg;

        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">
                        {heading}
                    </h1>
                    <p className="text-sm text-gray-500">{message}</p>
                </div>
            </div>
        );
    }

    // ── Render: decline confirmation ───────────────────
    if (status === 'declined') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">
                        Decline recorded
                    </h1>
                    <p className="text-sm text-gray-500">{declineMessage}</p>
                </div>
            </div>
        );
    }

    // ── Render: invitation card (status === 'ready') ───
    const deadline = formatDeadline(info?.expected_deadline ?? null);
    const alreadyAccepted = info?.already_accepted === true;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                    Peer review invitation
                </p>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                    {info?.paper_title}
                </h1>

                {info?.paper_abstract_excerpt ? (
                    <div className="mb-6">
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                            Abstract excerpt
                        </h2>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                            {info.paper_abstract_excerpt}
                        </p>
                    </div>
                ) : null}

                {deadline ? (
                    <div className="mb-6 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Expected by
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                            {deadline}
                        </span>
                    </div>
                ) : null}

                {alreadyAccepted ? (
                    <div className="mt-4 border-t border-gray-100 pt-6">
                        <p className="text-sm text-gray-600 mb-3">
                            You have already accepted this invitation.
                        </p>
                        <Link
                            to={`/review/${token}`}
                            className="inline-block px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
                        >
                            Continue to your review →
                        </Link>
                    </div>
                ) : (
                    <div className="mt-4 border-t border-gray-100 pt-6 flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={handleAccept}
                            disabled={accepting}
                            className="flex-1 px-5 py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                            {accepting
                                ? 'Recording your acceptance…'
                                : 'Accept & Open Review'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setDeclineError(null);
                                setDeclineOpen(true);
                            }}
                            className="flex-1 px-5 py-3 bg-white text-amber-700 border border-amber-300 text-sm font-semibold rounded-lg hover:bg-amber-50 transition"
                        >
                            Decline invitation
                        </button>
                    </div>
                )}

                <p className="mt-6 text-xs text-gray-400">
                    Your decision is recorded in our audit log. If you have
                    questions, please contact the editorial office before
                    accepting.
                </p>
            </div>

            {/* Decline dialog */}
            {declineOpen ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="decline-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                >
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6">
                        <h2
                            id="decline-title"
                            className="text-lg font-bold text-gray-900 mb-2"
                        >
                            Decline this invitation?
                        </h2>
                        <p className="text-sm text-gray-500 mb-4">
                            You can share an optional reason with the
                            editorial team — a conflict of interest, lack of
                            availability, or a topic mismatch.
                        </p>
                        <label
                            htmlFor="decline-reason"
                            className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"
                        >
                            Reason (optional)
                        </label>
                        <textarea
                            id="decline-reason"
                            rows={4}
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="e.g. I have a co-authorship conflict with the corresponding author."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            maxLength={2000}
                        />
                        {declineError ? (
                            <p className="mt-2 text-sm text-red-600">
                                {declineError}
                            </p>
                        ) : null}
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeclineOpen(false)}
                                disabled={declining}
                                className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeclineConfirm}
                                disabled={declining}
                                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                            >
                                {declining
                                    ? 'Recording your decline…'
                                    : 'Confirm decline'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ReviewerInvitePage;
