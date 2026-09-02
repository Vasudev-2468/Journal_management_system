import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { requestReset } from '../api/passwordReset';

/**
 * Forgot-password entry page.
 *
 * A single email input POSTs to /password-reset/request. The response is
 * intentionally the same shape whether or not the address matches a real
 * account, so this page ALWAYS shows the identical success banner —
 * never a "we don't know that email" error. Otherwise this page turns
 * into an account-enumeration oracle.
 */
const GENERIC_SUCCESS =
    "If an account exists for that email, we've sent a reset link.";

const ForgotPasswordPage: React.FC = () => {
    // Prefill from ?email=… so a user who clicked "Forgot password?"
    // on the Author login screen (which passes the address in the
    // querystring) doesn't have to retype it. Falls back to empty
    // when the URL didn't carry one.
    const location = useLocation();
    const initialEmail = useMemo(() => {
        try {
            return new URLSearchParams(location.search).get('email') || '';
        } catch {
            return '';
        }
    }, [location.search]);
    const [email, setEmail] = useState(initialEmail);
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const errorFrom = (err: any, fallback: string): string => {
        const detail = err?.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        return fallback;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!email) {
            setError('Please enter your email address.');
            return;
        }
        setSubmitting(true);
        try {
            await requestReset(email);
            // Same success regardless of backend outcome — do not branch
            // on the response body.
            setSent(true);
        } catch (err) {
            // Only surface real transport errors; a 2xx never reaches
            // this branch, so we're safe from accidental enumeration.
            setError(
                errorFrom(
                    err,
                    'Something went wrong reaching the server. Please try again in a moment.',
                ),
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 flex items-center justify-center py-16">
                <div className="w-full max-w-lg px-4">
                    <div className="text-center mb-8">
                        <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 items-center justify-center shadow-lg mb-4">
                            <span className="text-3xl" aria-hidden="true">📬</span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900">
                            Forgot your password?
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Enter the email address you registered with. If we
                            find a matching account we'll send a one-time link
                            you can use to choose a new password.
                        </p>
                    </div>

                    {sent ? (
                        <div
                            role="status"
                            className="bg-white rounded-2xl border border-brand-100 shadow-sm p-6 space-y-3"
                        >
                            <p className="text-brand-700 font-bold">
                                Check your inbox
                            </p>
                            <p className="text-sm text-gray-600">
                                {GENERIC_SUCCESS} The link is valid for 30
                                minutes and can only be used once.
                            </p>
                            <p className="text-sm text-gray-500">
                                Nothing in your inbox after a few minutes?
                                Check the spam folder, then try again with the
                                exact address on file.
                            </p>
                            <div className="pt-2 flex flex-col gap-2 text-sm">
                                <Link
                                    to="/author-login"
                                    className="text-brand-600 hover:underline font-semibold"
                                >
                                    Back to author sign-in →
                                </Link>
                                <Link
                                    to="/editor-login"
                                    className="text-brand-600 hover:underline font-semibold"
                                >
                                    Back to editor sign-in →
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSubmit}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
                            noValidate
                        >
                            {error && (
                                <div
                                    role="alert"
                                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                                >
                                    {error}
                                </div>
                            )}
                            <label className="block text-sm" htmlFor="reset-email">
                                <span className="text-gray-700 font-semibold">
                                    Email address
                                </span>
                                <input
                                    id="reset-email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                    placeholder="jane@university.edu"
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submitting || !email}
                                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg"
                            >
                                {submitting ? 'Sending link…' : 'Send reset link →'}
                            </button>
                            <p className="text-xs text-gray-500 text-center">
                                Remembered it after all?{' '}
                                <Link
                                    to="/author-login"
                                    className="text-brand-600 hover:underline font-semibold"
                                >
                                    Sign in
                                </Link>
                                .
                            </p>
                        </form>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ForgotPasswordPage;
