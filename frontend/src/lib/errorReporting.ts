/*
 * errorReporting.ts — Sentry-style error tracking stub.
 *
 * Ships with the app but only activates when the `REACT_APP_SENTRY_DSN`
 * environment variable is set at build time. When unset (development,
 * self-hosted deployments, air-gapped installs) both `captureException`
 * and `captureMessage` are no-ops and no external network request is
 * ever made.
 *
 * When a DSN *is* set, the module injects the official Sentry browser
 * CDN bundle at runtime and forwards captures through the loaded SDK.
 * We intentionally do NOT depend on `@sentry/react` — the runtime CDN
 * injection keeps the bundle small and lets ops toggle tracking without
 * a rebuild. If the CDN is blocked by CSP the script simply never
 * finishes loading and the no-op stubs stay in effect.
 */

type CaptureContext = Record<string, unknown> | undefined;

interface SentryGlobal {
    init: (opts: { dsn: string; tracesSampleRate: number }) => void;
    captureException: (err: unknown, ctx?: CaptureContext) => void;
    captureMessage: (msg: string, ctx?: CaptureContext) => void;
}

declare global {
    interface Window {
        Sentry?: SentryGlobal;
    }
}

// Read DSN from build-time env. Falls back to an empty string when
// `process.env` is unavailable so this module is safe to import in
// non-webpack environments (tests, storybook, etc.).
const DSN: string =
    (typeof process !== 'undefined' &&
        process.env &&
        process.env.REACT_APP_SENTRY_DSN) ||
    '';

const CDN_URL = 'https://browser.sentry-cdn.com/8.35.0/bundle.min.js';

let ready = false;

function bootSentry(): void {
    if (typeof window === 'undefined' || !DSN) return;
    if (window.Sentry) {
        // Some other loader beat us to it — respect existing init.
        ready = true;
        return;
    }
    try {
        const script = document.createElement('script');
        script.src = CDN_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
            try {
                if (window.Sentry && typeof window.Sentry.init === 'function') {
                    window.Sentry.init({ dsn: DSN, tracesSampleRate: 0 });
                    ready = true;
                }
            } catch {
                // Swallow — Sentry init must never break the host app.
            }
        };
        script.onerror = () => {
            // CDN blocked (CSP, offline, allowlist). Stubs stay no-op.
        };
        (document.head || document.documentElement).appendChild(script);
    } catch {
        // DOM missing / restricted — leave the stubs in place.
    }
}

/** Report an error. No-op unless the Sentry CDN loaded successfully. */
export function captureException(err: unknown, ctx?: CaptureContext): void {
    if (!ready || typeof window === 'undefined' || !window.Sentry) return;
    try {
        window.Sentry.captureException(err, ctx);
    } catch {
        // Never let the reporter itself throw.
    }
}

/** Report an informational message. Same no-op semantics. */
export function captureMessage(msg: string, ctx?: CaptureContext): void {
    if (!ready || typeof window === 'undefined' || !window.Sentry) return;
    try {
        window.Sentry.captureMessage(msg, ctx);
    } catch {
        // ignore
    }
}

// Wire the unhandled-rejection listener even when the CDN isn't loaded
// — `captureException` is a safe no-op in that case, and installing the
// listener eagerly means we can't miss the first rejection after the
// SDK finishes loading.
if (typeof window !== 'undefined') {
    try {
        window.addEventListener('unhandledrejection', (event) => {
            const reason =
                (event as PromiseRejectionEvent).reason ??
                new Error('Unhandled promise rejection');
            captureException(reason, { source: 'unhandledrejection' });
        });
    } catch {
        // Non-browser environment — nothing to do.
    }
}

// Kick off the CDN injection at import time. Safe to call repeatedly;
// the guard inside bootSentry avoids duplicate scripts.
bootSentry();

const errorReporting = { captureException, captureMessage };
export default errorReporting;
