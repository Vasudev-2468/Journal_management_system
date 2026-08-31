import React, { useEffect, useState } from 'react';
import client from '../../api/client';
// @ts-ignore — authorAuth.js is a plain-JS module in a mixed TS/JS repo.
import { getAuthorToken } from '../../api/authorAuth';

interface Props {
    submissionId: string;
    /** The submission's current status. The card only renders when a
     *  decision has landed (accepted / rejected / revision_requested /
     *  returned_to_author). */
    status?: string | null;
}

interface ReviewerEntry {
    reviewer_alias: string;
    overall_recommendation: string | null;
    comments_to_authors: string | null;
    completed_at: string | null;
}

const DECISION_STATUSES = new Set([
    'accepted',
    'rejected',
    'revision_requested',
    'returned_to_author',
]);

const storageKey = (id: string) => `reviewer-comments-read:${id}`;

/** Pill styling per reviewer recommendation. Keep the palette narrow so the
 *  reviewer packet reads visually consistent with the decision letter card. */
const RECOMMENDATION_PILL: Record<string, { label: string; cls: string }> = {
    accept: {
        label: 'Accept',
        cls: 'bg-green-50 text-green-700 border-green-200',
    },
    minor_revision: {
        label: 'Minor revision',
        cls: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    },
    major_revision: {
        label: 'Major revision',
        cls: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    reject: {
        label: 'Reject',
        cls: 'bg-red-50 text-red-700 border-red-200',
    },
};

function RecommendationPill({ value }: { value: string | null }): JSX.Element | null {
    if (!value) return null;
    const meta = RECOMMENDATION_PILL[value] ?? {
        label: value.replace(/_/g, ' '),
        cls: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return (
        <span
            className={`inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-0.5 ${meta.cls}`}
        >
            {meta.label}
        </span>
    );
}

/**
 * ReviewerCommentsCard — anonymised reviewer packet for the author.
 *
 * Fetches from the author-scoped `/reviews-public/for-my-submission/:id`
 * endpoint. The response is strictly redacted server-side (no reviewer
 * name/email, no comments_to_editor), and only released once the editor
 * has landed a decision. Until then — or when no reviewer has yet
 * completed — we keep the friendly holding message.
 *
 * Preserves the "read on this device" localStorage toggle used by the
 * previous placeholder implementation.
 */
export default function ReviewerCommentsCard({ submissionId, status }: Props): JSX.Element | null {
    const [readOnDevice, setReadOnDevice] = useState<boolean>(false);
    const [entries, setEntries] = useState<ReviewerEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [openIdx, setOpenIdx] = useState<number | null>(0);

    useEffect(() => {
        try {
            const v = localStorage.getItem(storageKey(submissionId));
            setReadOnDevice(v === '1');
        } catch {
            /* private mode / storage blocked — treat as unread */
        }
    }, [submissionId]);

    useEffect(() => {
        if (!submissionId || !status || !DECISION_STATUSES.has(status)) {
            return;
        }
        let cancelled = false;
        async function load(): Promise<void> {
            setLoading(true);
            setLoadError(null);
            try {
                const token = getAuthorToken();
                const res = await client.get(
                    `/reviews-public/for-my-submission/${submissionId}`,
                    token
                        ? { headers: { Authorization: `Bearer ${token}` } }
                        : undefined,
                );
                if (cancelled) return;
                setEntries(Array.isArray(res.data) ? res.data : []);
            } catch {
                if (cancelled) return;
                // Fall back to the friendly holding state — do not surface
                // a scary error; the packet may simply not be released yet.
                setEntries([]);
                setLoadError('Reviewer comments could not be loaded right now.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [submissionId, status]);

    if (!status || !DECISION_STATUSES.has(status)) {
        return null;
    }

    const toggle = (): void => {
        const next = !readOnDevice;
        setReadOnDevice(next);
        try {
            localStorage.setItem(storageKey(submissionId), next ? '1' : '0');
        } catch {
            /* ignore — the toggle still updates in-memory state */
        }
    };

    const hasComments = entries.length > 0;

    return (
        <section
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            aria-label="Reviewer comments"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h2 className="text-sm font-bold text-gray-900">
                        Reviewer Comments (Anonymised)
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Peer-review packet for this submission
                    </p>
                </div>
                <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">
                    Blind review
                </span>
            </div>

            {loading ? (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-500 leading-relaxed">
                    Loading reviewer comments…
                </div>
            ) : hasComments ? (
                <div className="space-y-3">
                    {entries.map((entry, idx) => {
                        const open = openIdx === idx;
                        return (
                            <div
                                key={`${entry.reviewer_alias}-${idx}`}
                                className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenIdx(open ? null : idx)}
                                    aria-expanded={open}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-bold text-gray-900">
                                            {entry.reviewer_alias}
                                        </span>
                                        <RecommendationPill
                                            value={entry.overall_recommendation}
                                        />
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 9l-7 7-7-7"
                                        />
                                    </svg>
                                </button>
                                {open && (
                                    <div className="px-4 pb-4 pt-1 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                        {entry.comments_to_authors && entry.comments_to_authors.trim().length > 0
                                            ? entry.comments_to_authors
                                            : 'No written comments were shared with authors for this review.'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
                    Reviewer comments will appear once released by the editorial office.
                    They are shared anonymously, alongside the decision letter.
                </div>
            )}

            {loadError && !hasComments && (
                <p className="mt-2 text-xs text-gray-400">{loadError}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={readOnDevice}
                        onChange={toggle}
                        className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-500"
                        aria-label="Mark reviewer comments as read on this device"
                    />
                    Read on this device
                </label>
                <span className="text-xs text-gray-400">
                    Preference saved locally
                </span>
            </div>
        </section>
    );
}
