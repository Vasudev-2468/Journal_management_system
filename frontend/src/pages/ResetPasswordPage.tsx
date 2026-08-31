import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { verifyReset } from '../api/passwordReset';

/**
 * Reset-password landing.
 *
 * Reached from the emailed link — /reset-password?token=<jwt>. Two
 * password fields (new + confirm), POST to /password-reset/verify, then
 * redirect to /author-login with a success flash the login page can pick
 * up from location.state.
 */
const MIN_LEN = 8;

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = useMemo(() => params.get('token') || '', [params]);

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const errorFrom = (err: any, fallback: string): string => {
        const detail = err?.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        return fallback;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!token) {
            setError('The reset link is missing the required token.');
            return;
        }
        if (password.length < MIN_LEN) {
            setError(`Choose a password of at least ${MIN_LEN} characters.`);
            return;
        }
        if (password !== confirm) {
            setError('The two passwords do not match.');
            return;
        }
        setSubmitting(true);
        try {
            await verifyReset(token, password);
            setDone(true);
            window.setTimeout(
                () =>
                    navigate('/author-login', {
                        replace: true,
                        state: {
                            passwordReset: true,
                            flash: 'Password updated. Sign in with your new password.',
                        },
                    }),
                1200,
            );
        } catch (err) {
            setError(
                errorFrom(
                    err,
                    'This reset link is invalid or has expired. Request a new one from the forgot-password page.',
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
                            <span className="text-3xl" aria-hidden="true">🔐</span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900">
                            Choose a new password
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Pick something you haven't used before. After this
                            step you'll sign in with your new password on the
                            usual login page.
                        </p>
                    </div>

                    {done ? (
                        <div
                            role="status"
                            className="bg-white rounded-2xl border border-green-200 shadow-sm p-6 text-center space-y-3"
                        >
                            <p className="text-green-700 font-bold">
                                Password updated. Redirecting you to sign in…
                            </p>
                            <Link
                                to="/author-login"
                                className="text-sm text-brand-600 hover:underline"
                            >
                                Sign in now →
                            </Link>
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSubmit}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
                            noValidate
                        >
                            {!token && (
                                <div
                                    role="alert"
                                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                                >
                                    The URL is missing a token. Open the reset
                                    link from your email exactly as it was
                                    sent — do not shorten or paste only part of
                                    it.
                                </div>
                            )}
                            {error && (
                                <div
                                    role="alert"
                                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                                >
                                    {error}
                                </div>
                            )}
                            <label className="block text-sm" htmlFor="new-password">
                                <span className="text-gray-700 font-semibold">
                                    New password
                                </span>
                                <input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={MIN_LEN}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                />
                                <span className="mt-1 block text-[11px] text-gray-500">
                                    At least {MIN_LEN} characters.
                                </span>
                            </label>
                            <label
                                className="block text-sm"
                                htmlFor="confirm-password"
                            >
                                <span className="text-gray-700 font-semibold">
                                    Confirm new password
                                </span>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={MIN_LEN}
                                    required
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submitting || !token}
                                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg"
                            >
                                {submitting ? 'Saving…' : 'Save new password →'}
                            </button>
                            <p className="text-xs text-gray-500 text-center">
                                Link expired?{' '}
                                <Link
                                    to="/forgot-password"
                                    className="text-brand-600 hover:underline font-semibold"
                                >
                                    Request a fresh one
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

export default ResetPasswordPage;
