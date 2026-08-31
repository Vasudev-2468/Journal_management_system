import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The editor API layer stays untyped (editor.js); we import the two helpers we
// need and type our own local shape for the notification-log entry.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — editor.js has no .d.ts by design (matches the rest of the editor bundle).
import { fetchNotificationLog } from '../../api/editor';

// ── Types ────────────────────────────────────────────────
//
// Mirrors backend `NotificationLogEntry`. Kept local to this component so we
// don't sprawl types across the app for a floating dropdown; if reused
// elsewhere later, promote into `src/types/`.

type NotificationChannel = 'email' | 'whatsapp';
type NotificationStatus = 'pending' | 'sent' | 'failed';

interface NotificationEntry {
    id: string;
    channel: NotificationChannel;
    trigger_event: string;
    recipient?: string | null;
    status: NotificationStatus;
    sent_at?: string | null;
    error_message?: string | null;
    preview?: string | null;
}

const POLL_INTERVAL_MS = 45_000;
const LIMIT = 10;
const READ_STORAGE_KEY = 'editor_notification_bell_last_read_at';

// A notification is "unread" when it was sent (or failed) after the viewer
// last opened the bell. `pending` rows don't count as unread — they haven't
// actually reached anyone yet, so treating them as new noise would train
// editors to ignore the badge.
function computeUnreadIds(entries: NotificationEntry[], lastReadAt: number): string[] {
    return entries
        .filter((e) => {
            if (!e.sent_at) return false;
            const t = new Date(e.sent_at).getTime();
            return Number.isFinite(t) && t > lastReadAt;
        })
        .map((e) => e.id);
}

// ── Icons (inline SVG so no new deps) ────────────────────

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
);

const ChannelIcon: React.FC<{ channel: NotificationChannel }> = ({ channel }) => {
    if (channel === 'whatsapp') {
        return (
            <span
                aria-label="WhatsApp"
                title="WhatsApp"
                className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold"
            >
                W
            </span>
        );
    }
    return (
        <span
            aria-label="Email"
            title="Email"
            className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold"
        >
            E
        </span>
    );
};

// ── Main component ───────────────────────────────────────

const NotificationBell: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<NotificationEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastReadAt, setLastReadAt] = useState<number>(() => {
        try {
            const raw = localStorage.getItem(READ_STORAGE_KEY);
            const parsed = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(parsed) ? parsed : 0;
        } catch {
            return 0;
        }
    });

    const containerRef = useRef<HTMLDivElement | null>(null);
    const mountedRef = useRef(true);

    const loadNotifications = useCallback(async () => {
        try {
            const data = await fetchNotificationLog({ limit: LIMIT });
            if (!mountedRef.current) return;
            setEntries((data && Array.isArray(data.entries) ? data.entries : []) as NotificationEntry[]);
            setError(null);
        } catch (e: any) {
            if (!mountedRef.current) return;
            setError(e?.response?.data?.detail || e?.message || 'Failed to load notifications.');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // Poll on mount, then every POLL_INTERVAL_MS. Reset on unmount so the
    // interval doesn't leak across page navigations.
    useEffect(() => {
        mountedRef.current = true;
        loadNotifications();
        const id = window.setInterval(loadNotifications, POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(id);
        };
    }, [loadNotifications]);

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onDown = (evt: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(evt.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Close on ESC.
    useEffect(() => {
        if (!open) return;
        const onKey = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const unreadIds = useMemo(
        () => computeUnreadIds(entries, lastReadAt),
        [entries, lastReadAt],
    );
    const unreadCount = unreadIds.length;

    const handleToggle = () => {
        setOpen((prev) => {
            const next = !prev;
            // Mark all currently visible entries as read the moment the tray
            // opens — matches the "envelope has been peeked at" mental model.
            if (next) {
                const now = Date.now();
                setLastReadAt(now);
                try {
                    localStorage.setItem(READ_STORAGE_KEY, String(now));
                } catch {
                    /* localStorage may be blocked; unread state falls back to session-only */
                }
            }
            return next;
        });
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={handleToggle}
                aria-label={
                    unreadCount > 0
                        ? `Notifications — ${unreadCount} unread`
                        : 'Notifications'
                }
                aria-haspopup="menu"
                aria-expanded={open}
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-full text-gray-500 hover:text-brand-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Recent notifications"
                    // z-index above sidebar/backdrop/drawer combos so the panel
                    // is never occluded when opened over the submissions view.
                    className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-[70] overflow-hidden"
                >
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">Notifications</p>
                        <span className="text-xs text-gray-400">
                            {loading ? 'Loading…' : `${entries.length} recent`}
                        </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {error ? (
                            <div className="px-4 py-6 text-sm text-red-600">{error}</div>
                        ) : loading ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">
                                Loading notifications…
                            </div>
                        ) : entries.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">
                                No notifications yet.
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {entries.map((entry) => {
                                    const isSent = entry.status === 'sent';
                                    const isFailed = entry.status === 'failed';
                                    const isUnread = unreadIds.includes(entry.id);
                                    return (
                                        <li
                                            key={entry.id}
                                            className={`px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 ${
                                                isUnread ? 'bg-amber-50/40' : ''
                                            }`}
                                            onClick={() => setOpen(false)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <ChannelIcon channel={entry.channel} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p
                                                            className={`font-medium truncate ${
                                                                isFailed
                                                                    ? 'text-red-600'
                                                                    : isSent
                                                                    ? 'text-gray-500 line-through'
                                                                    : 'text-gray-800'
                                                            }`}
                                                            title={entry.trigger_event}
                                                        >
                                                            {entry.trigger_event}
                                                        </p>
                                                        {isUnread && (
                                                            <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {entry.recipient || 'unknown recipient'}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        {entry.sent_at
                                                            ? new Date(entry.sent_at).toLocaleString()
                                                            : 'not yet sent'}
                                                    </p>
                                                    {isFailed && entry.error_message && (
                                                        <p className="text-[11px] text-red-500 mt-1 truncate">
                                                            {entry.error_message}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
