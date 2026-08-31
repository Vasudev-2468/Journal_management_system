import { useEffect } from 'react';

/**
 * Lightweight external-analytics loader.
 *
 * Injects Plausible's `<script>` tag once, on mount, but only when the
 * viewer has granted cookie consent. Configuration comes from a build-time
 * env var so the site can ship without a domain configured (e.g. staging).
 *
 * The component also installs a global `window.grantAnalyticsConsent()` so
 * a cookie-banner UI (see `CookieBanner.tsx`) can flip consent + inject the
 * tag in a single call without importing this file.
 *
 * Renders nothing.
 */

const CONSENT_KEY = 'cookie_consent';
const CONSENT_GRANTED = '1';
const SCRIPT_ATTR = 'data-jgair-analytics';

declare global {
    interface Window {
        grantAnalyticsConsent?: () => void;
    }
}

/** Actually append the script tag — idempotent. */
const injectPlausibleScript = (domain: string) => {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`script[${SCRIPT_ATTR}="1"]`)) return;
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', domain);
    script.setAttribute(SCRIPT_ATTR, '1');
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
};

const AnalyticsLoader: React.FC = () => {
    useEffect(() => {
        const domain = process.env.REACT_APP_ANALYTICS_DOMAIN;
        if (!domain) return;

        // Expose the consent-granter globally so the banner (and any future
        // consent UI) can call it without importing the loader.
        window.grantAnalyticsConsent = () => {
            try {
                localStorage.setItem(CONSENT_KEY, CONSENT_GRANTED);
            } catch {
                /* private mode / storage disabled — still allow this session */
            }
            injectPlausibleScript(domain);
        };

        // If the viewer has previously consented, inject immediately.
        let stored: string | null = null;
        try {
            stored = localStorage.getItem(CONSENT_KEY);
        } catch {
            stored = null;
        }
        if (stored === CONSENT_GRANTED) {
            injectPlausibleScript(domain);
        }
    }, []);

    return null;
};

export default AnalyticsLoader;
