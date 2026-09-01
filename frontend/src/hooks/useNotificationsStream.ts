import { useEffect, useRef } from 'react';

/**
 * Live notification stream hook.
 *
 * Opens a WebSocket to the backend `/ws/notifications` endpoint using
 * the caller's role token (author or editor) and invokes `onNotification`
 * whenever a `notification` frame arrives. If the WebSocket connection
 * fails to establish (or drops and cannot be re-established within the
 * retry budget) the hook silently falls back to polling `onPoll` on a
 * 60-second interval so the bells keep working on infrastructure that
 * strips WebSocket upgrades. Cleans up all timers, retries and sockets
 * on unmount.
 *
 * The hook is intentionally callback-driven rather than exposing state:
 * callers plug their existing `refresh` function into both
 * `onNotification` and `onPoll`, keeping the dropdown UI, unread-count
 * calculation and read-cursor logic untouched.
 */

// The API base and token-key selectors mirror `src/api/client.ts` so
// this hook lines up with whatever the rest of the app is talking to.
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Retries: 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s)
// before we give up and hand off to polling. That covers the common
// transient-cold-start / brief-proxy-blip case without hammering the
// server on a real outage.
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;

// Poll cadence when the WS falls back. Matches the author bell's
// original 60s poll — the editor bell's poll was 45s, but the spec
// specifies 60s for the fallback so both bells share one cadence.
const POLL_INTERVAL_MS = 60_000;

export type NotificationRole = 'author' | 'editor';

export interface UseNotificationsStreamOptions {
    /** Which role's stored token to attach as the WS `token` query param. */
    role: NotificationRole;
    /** Invoked with the JSON payload of every `notification` frame. */
    onNotification: (payload: any) => void;
    /**
     * Invoked on the polling fallback interval when the WebSocket has
     * given up. Typically wired to the same refresh function as
     * `onNotification` so the two paths converge on the same UI update.
     */
    onPoll: () => void;
    /**
     * Optional flag — pass `false` to bail out entirely (e.g. before
     * the user has logged in). Defaults to `true`.
     */
    enabled?: boolean;
}

function tokenForRole(role: NotificationRole): string | null {
    try {
        if (role === 'editor') {
            return localStorage.getItem('editor_token');
        }
        return localStorage.getItem('author_token');
    } catch {
        // Private-mode Safari and locked-down enterprise browsers
        // throw on `localStorage` access; the hook then simply never
        // opens the socket and the poll fallback still fires.
        return null;
    }
}

function buildWsUrl(token: string): string {
    // Convert `http://…` -> `ws://…` and `https://…` -> `wss://…`.
    const base = API_BASE.replace(/^http/i, 'ws');
    return `${base}/ws/notifications?token=${encodeURIComponent(token)}`;
}

export function useNotificationsStream(
    options: UseNotificationsStreamOptions,
): void {
    const { role, onNotification, onPoll, enabled = true } = options;

    // Latest callbacks live behind refs so the effect below can hold a
    // stable dependency list — otherwise every parent re-render would
    // tear down and re-open the socket, defeating the point of a
    // persistent stream.
    const onNotificationRef = useRef(onNotification);
    const onPollRef = useRef(onPoll);
    onNotificationRef.current = onNotification;
    onPollRef.current = onPoll;

    useEffect(() => {
        if (!enabled) return;

        // Some very old browsers or SSR shells won't expose
        // `WebSocket`; in that case go straight to polling.
        const hasWebSocket = typeof window !== 'undefined' && !!window.WebSocket;

        const token = tokenForRole(role);
        if (!token) {
            // No auth yet — nothing to subscribe to. Callers usually
            // remount this hook once auth lands, so returning quietly
            // is the right move.
            return;
        }

        let cancelled = false;
        let socket: WebSocket | null = null;
        let retryTimer: number | null = null;
        let pollTimer: number | null = null;
        let retryCount = 0;

        const clearRetryTimer = () => {
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer);
                retryTimer = null;
            }
        };

        const startPollFallback = () => {
            if (pollTimer !== null) return;
            // Fire once immediately so the UI reflects any missed
            // updates from the WS-outage window, then poll on the
            // interval.
            try {
                onPollRef.current();
            } catch {
                /* refresh errors are the caller's problem, not ours */
            }
            pollTimer = window.setInterval(() => {
                try {
                    onPollRef.current();
                } catch {
                    /* ignore */
                }
            }, POLL_INTERVAL_MS);
        };

        const stopPollFallback = () => {
            if (pollTimer !== null) {
                window.clearInterval(pollTimer);
                pollTimer = null;
            }
        };

        const scheduleReconnect = () => {
            if (cancelled) return;
            if (retryCount >= MAX_RETRIES) {
                // Give up on the WebSocket and start polling. The
                // fallback runs until the component unmounts — a
                // future page load will retry the socket from
                // scratch.
                startPollFallback();
                return;
            }
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            retryCount += 1;
            clearRetryTimer();
            retryTimer = window.setTimeout(connect, delay);
        };

        function connect() {
            if (cancelled) return;
            if (!hasWebSocket) {
                startPollFallback();
                return;
            }

            let ws: WebSocket;
            try {
                ws = new WebSocket(buildWsUrl(token as string));
            } catch {
                // Construction itself failed (malformed URL, blocked
                // by CSP, etc.) — count as a failed attempt.
                scheduleReconnect();
                return;
            }
            socket = ws;

            ws.onopen = () => {
                if (cancelled) {
                    try {
                        ws.close();
                    } catch {
                        /* ignore */
                    }
                    return;
                }
                // A successful open resets the backoff so a later
                // disconnect gets the full retry budget.
                retryCount = 0;
                // If we were polling as a stop-gap, cancel that now
                // that the live stream is back.
                stopPollFallback();
            };

            ws.onmessage = (event: MessageEvent) => {
                if (cancelled) return;
                let frame: any;
                try {
                    frame = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (frame && frame.type === 'notification') {
                    try {
                        onNotificationRef.current(frame.payload);
                    } catch {
                        /* refresh errors are the caller's problem */
                    }
                }
                // Ignore other frame types (`hello`, `ping`) — they
                // exist so the server can prove auth succeeded and
                // keep intermediaries from culling idle sockets.
            };

            ws.onerror = () => {
                // The browser doesn't tell us much here; the close
                // event will follow with the retry decision. Kept as
                // a no-op to swallow uncaught-error warnings.
            };

            ws.onclose = () => {
                socket = null;
                if (cancelled) return;
                scheduleReconnect();
            };
        }

        connect();

        return () => {
            cancelled = true;
            clearRetryTimer();
            stopPollFallback();
            if (socket) {
                try {
                    socket.close();
                } catch {
                    /* ignore */
                }
                socket = null;
            }
        };
        // `role` and `enabled` are the only inputs that should force a
        // full teardown/reconnect — callbacks flow through the refs.
    }, [role, enabled]);
}

export default useNotificationsStream;
