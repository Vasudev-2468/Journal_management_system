import React, { useEffect, useState } from 'react';

/**
 * Bottom-right cookie consent banner.
 *
 * Appears only when `cookie_consent` is null in localStorage. On Accept it
 * calls `window.grantAnalyticsConsent()` (installed by `AnalyticsLoader`)
 * which flips consent to "1" and injects the analytics script. Decline
 * writes "0" so the banner never comes back on this browser.
 *
 * Static markup, Tailwind styling, no external deps.
 */

const CONSENT_KEY = 'cookie_consent';

const readConsent = (): string | null => {
    try {
        return localStorage.getItem(CONSENT_KEY);
    } catch {
        return null;
    }
};

const CookieBanner: React.FC = () => {
    const [visible, setVisible] = useState<boolean>(false);

    useEffect(() => {
        setVisible(readConsent() === null);
    }, []);

    if (!visible) return null;

    const handleAccept = () => {
        try {
            if (typeof window !== 'undefined' && typeof window.grantAnalyticsConsent === 'function') {
                window.grantAnalyticsConsent();
            } else {
                localStorage.setItem(CONSENT_KEY, '1');
            }
        } catch {
            /* ignore storage errors */
        }
        setVisible(false);
    };

    const handleDecline = () => {
        try {
            localStorage.setItem(CONSENT_KEY, '0');
        } catch {
            /* ignore storage errors */
        }
        setVisible(false);
    };

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Cookie consent"
            className="fixed bottom-4 right-4 z-[60] max-w-sm w-[calc(100%-2rem)] sm:w-96 bg-white rounded-2xl border border-gray-200 shadow-2xl p-5"
        >
            <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-1">
                Your privacy
            </p>
            <h4 className="text-base font-extrabold text-gray-900">Cookies &amp; analytics</h4>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                We use anonymous analytics to understand how JGAIR is read, and only if
                you agree. You can change your mind any time from the cookie policy page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
                <button
                    type="button"
                    onClick={handleDecline}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition"
                >
                    Decline
                </button>
                <button
                    type="button"
                    onClick={handleAccept}
                    className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition"
                >
                    Accept
                </button>
            </div>
        </div>
    );
};

export default CookieBanner;
