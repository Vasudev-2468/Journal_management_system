/*
 * errorReporting.ts — thin wrapper around `@sentry/react`.
 *
 * Runtime behaviour is a strict no-op when `REACT_APP_SENTRY_DSN` is
 * unset at build time. That's the case for local development,
 * self-hosted deployments, and air-gapped installs: no network request
 * of any kind is made and both `captureException` and `captureMessage`
 * return without touching the SDK.
 *
 * When a DSN *is* set we initialise `@sentry/react` at module load. We
 * intentionally keep the config minimal — tracing and replay are off
 * — so the bundle stays small and no unexpected background traffic
 * happens on production pages.
 *
 * If the npm package fails to load for any reason (bundler error,
 * offline dev install), the try/catch below falls back to the no-op
 * path so the host app is never broken by the reporter.
 */

type CaptureContext = Record<string, unknown> | undefined;

// Read DSN from build-time env. Falls back to an empty string when
// `process.env` is unavailable so this module is safe to import in
// non-webpack environments (tests, storybook, etc.).
const DSN: string =
    (typeof process !== 'undefined' &&
        process.env &&
        process.env.REACT_APP_SENTRY_DSN) ||
    '';

// Lazy, guarded require. `require` is available under Create React
// App's webpack build; wrapping it in a try/catch means a missing or
// broken `@sentry/react` install can never crash the app — we simply
// fall through to the no-op stubs.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
let ready = false;

if (DSN) {
    try {
        // Hide the require call from webpack's static analyzer so a build
        // still succeeds when `@sentry/react` isn't installed. The Function
        // constructor bypasses the compile-time dependency detector; the
        // runtime still resolves it exactly like a normal require.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const dynamicRequire = new Function(
            'name',
            'return typeof require === "function" ? require(name) : null;',
        );
        Sentry = dynamicRequire(['@sentry', 'react'].join('/'));
        if (Sentry && typeof Sentry.init === 'function') {
            Sentry.init({
                dsn: DSN,
                tracesSampleRate: 0.0,
                replaysSessionSampleRate: 0,
                replaysOnErrorSampleRate: 0,
                integrations: [],
            });
            ready = true;
        }
    } catch {
        // Package failed to load or init threw — stay in no-op mode.
        Sentry = null;
        ready = false;
    }
}

/** Report an error. No-op unless Sentry initialised successfully. */
export function captureException(err: unknown, ctx?: CaptureContext): void {
    if (!ready || !Sentry) return;
    try {
        Sentry.captureException(err, ctx);
    } catch {
        // Never let the reporter itself throw.
    }
}

/** Report an informational message. Same no-op semantics. */
export function captureMessage(msg: string, ctx?: CaptureContext): void {
    if (!ready || !Sentry) return;
    try {
        Sentry.captureMessage(msg, ctx);
    } catch {
        // ignore
    }
}

// Wire the unhandled-rejection listener eagerly. Even without a DSN
// this is a safe no-op — `captureException` short-circuits — and
// installing it at import time means we can't miss the first
// rejection after the SDK finishes initialising.
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

// Naming the object before default-exporting silences the
// `import/no-anonymous-default-export` lint warning.
const errorReporting = { captureException, captureMessage };
export default errorReporting;
