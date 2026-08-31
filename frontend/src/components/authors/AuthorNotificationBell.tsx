import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    fetchMine,
    markAllRead,
    AuthorNotificationItem,
} from '../../api/authorNotifications';

// ── Config ────────────────────────────────────────────────
//
// Polls every 60s per the spec. Decisions have no server-side read
// column, so we suppress dismissed ones in `localStorage` — the same
// pattern the editor bell uses for its "last read at" cursor. Message
// notifications get marked read server-side via `POST /mark-all-read`,
// so they naturally disappear from the feed once acknowledged.

const POLL_INTERVAL_MS = 60_000;
const DISMISSED_DECISIONS_KEY = 'author_notification_dismissed_decisions';

// ── Dismissed-decision persistence ──────────────────────────────

function readDismissedDecisions(): Set<string> {
    try {
        const raw = localStorage.getItem(DISMISSED_DECISIONS_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.filter((v) => typeof v === 'string'));
        return new Set();
    } catch {
        return new Set();
    }
}

function writeDismissedDecisions(ids: Set<string>) {
    try {
        localStorage.setItem(DISMISSED_DECISIONS_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        /* localStorage may be blocked; dismissal falls back to session-only */
    }
}

// ── Icons (inline SVG — no new deps) ────────────────────

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

const KindIcon: React.FC<{ kind: AuthorNotificationItem['kind'] }> = ({ kind }) => {
    // Decisions get the indigo hue, messages the emerald. Same
    // component shape as the editor bell's ChannelIcon so the two
    // read as siblings — different colour spectrum only.
    if (kind === 'decision') {
        return (
            <span
                aria-label="Decision"
                title="Editorial decision"
                className="inline-flex items-center justify-center h-5 w-5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold"
            >
                D
            </span>
        );
    }
    return (
        <span
            aria-label="Message"
            title="Message from editor"
            className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold"
        >
            M
        </span>
    );
};

// ── Main component ──────────────────────────────────────

const AuthorNotificationBell: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<AuthorNotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissedDecisions());

    const containerRef = useRef<HTMLDivElement | null>(null);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        try {
            const feed = await fetchMine();
            if (!mountedRef.current) return;
            setItems(feed.items);
            setError(null);
        } catch (e: any) {
            if (!mountedRef.current) return;
            // Silence common auth transients — a page mounted before the
            // author token arrived should not flash a red panel.
            const status = e?.response?.status;
            if (status === 401 || status === 403) {
                setItems([]);
                setError(null);
            } else {
                setError(
                    e?.response?.data?.detail || e?.message || 'Failed to load notifications.',
                );
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // Poll on mount, then every POLL_INTERVAL_MS.
    useEffect(() => {
        mountedRef.current = true;
        load();
        const id = window.setInterval(load, POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(id);
        };
    }, [load]);

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

    // Close on Esc.
    useEffect(() => {
        if (!open) return;
        const onKey = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    // A decision is "gone" once the reader dismissed it locally. A
    // message stays until the server clears it (via mark-all-read or
    // via the thread's own read-stamp on open), so it does not need
    // the local set.
    const visibleItems = useMemo(
        () =>
            items.filter((item) =>
                item.kind === 'decision' ? !dismissed.has(item.id) : true,
            ),
        [items, dismissed],
    );

    const unreadCount = visibleItems.length;

    const handleMarkAllRead = useCallback(async () => {
        // Dismiss every visible decision locally so the count drops
        // immediately, then ask the server to clear messages.
        const nextDismissed = new Set(dismissed);
        for (const item of items) {
            if (item.kind === 'decision') nextDismissed.add(item.id);
        }
        setDismissed(nextDismissed);
        writeDismissedDecisions(nextDismissed);
        try {
            await markAllRead();
        } catch {
            /* leave the local dismissal in place; next poll will reconcile */
        }
        load();
    }, [dismissed, items, load]);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-label={
                    unreadCount > 0
                        ? `Notifications — ${unreadCount} unread`
                        : 'Notifications'
                }
                aria-haspopup="menu"
                aria-expanded={open}
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-full text-gray-500 hover:text-indigo-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-[70] overflow-hidden"
                >
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">Notifications</p>
                        {unreadCount > 0 ? (
                            <button
                                type="button"
                                onClick={handleMarkAllRead}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                            >
                                Mark all read
                            </button>
                        ) : (
                            <span className="text-xs text-gray-400">
                                {loading ? 'Loading…' : 'All caught up'}
                            </span>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {error ? (
                            <div className="px-4 py-6 text-sm text-red-600">{error}</div>
                        ) : loading ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">
                                Loading notifications…
                            </div>
                        ) : visibleItems.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">
                                No new notifications.
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {visibleItems.map((item) => {
                                    const to = `/author-dashboard/${item.submission_id}`;
                                    const accent =
                                        item.kind === 'decision'
                                            ? 'bg-indigo-50/40'
                                            : 'bg-emerald-50/40';
                                    return (
                                        <li key={item.id}>
                                            <Link
                                                to={to}
                                                onClick={() => setOpen(false)}
                                                className={`block px-4 py-3 text-sm no-underline text-gray-800 hover:bg-gray-50 ${accent}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <KindIcon kind={item.kind} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900 leading-snug break-words">
                                                            {item.title}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                                            {item.created_at
                                                                ? new Date(item.created_at).toLocaleString()
                                                                : ''}
                                                        </p>
                                                    </div>
                                                    <span
                                                        aria-hidden="true"
                                                        className={`shrink-0 h-2 w-2 rounded-full mt-1.5 ${
                                                            item.kind === 'decision'
                                                                ? 'bg-indigo-500'
                                                                : 'bg-emerald-500'
                                                        }`}
                                                    />
                                                </div>
                                            </Link>
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

export default AuthorNotificationBell;
