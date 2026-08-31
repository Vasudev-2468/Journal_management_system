import React, { useEffect, useState } from 'react';

interface Props {
    submissionId: string;
    /** The submission's current status. The card only renders when a
     *  decision has landed (accepted / rejected / revision_requested /
     *  returned_to_author). */
    status?: string | null;
}

const DECISION_STATUSES = new Set([
    'accepted',
    'rejected',
    'revision_requested',
    'returned_to_author',
]);

const storageKey = (id: string) => `reviewer-comments-read:${id}`;

/**
 * ReviewerCommentsCard — anonymised reviewer packet placeholder.
 *
 * The full reviewer detail endpoint (/reviews/{submission_id}) is editor-gated,
 * so authors cannot fetch reviewer comments directly. Until the editorial
 * office releases them, we surface a friendly holding message and let the
 * author toggle a "read on this device" flag that persists in localStorage.
 */
export default function ReviewerCommentsCard({ submissionId, status }: Props): JSX.Element | null {
    const [readOnDevice, setReadOnDevice] = useState<boolean>(false);

    useEffect(() => {
        try {
            const v = localStorage.getItem(storageKey(submissionId));
            setReadOnDevice(v === '1');
        } catch {
            /* private mode / storage blocked — treat as unread */
        }
    }, [submissionId]);

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

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
                Reviewer comments will appear here once released by the editorial office.
                They are shared anonymously, alongside the decision letter.
            </div>

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
