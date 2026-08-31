import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { login as reviewerLogin } from '../api/reviewerAuth';

/**
 * Reviewer sign-in landing.
 *
 * Persistent reviewer accounts (email + password) are the primary path;
 * the legacy paste-a-link flow is kept as a fallback for reviewers who
 * haven't yet redeemed their invitation to set a password.
 */
const ReviewerLoginPage: React.FC = () => {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [showLinkFallback, setShowLinkFallback] = useState(false);
    const [link, setLink] = useState('');
    const [linkError, setLinkError] = useState<string | null>(null);

    const errorFrom = (err: any, fallback: string): string => {
        const detail = err?.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        return fallback;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!email || !password) {
            setError('Please enter your email and password.');
            return;
        }
        setLoading(true);
        try {
            await reviewerLogin(email.trim(), password);
            navigate('/reviewer-dashboard');
        } catch (err) {
            setError(errorFrom(err, 'Login failed. Please check your credentials.'));
        } finally {
            setLoading(false);
        }
    };

    const openLink = (e: React.FormEvent) => {
        e.preventDefault();
        setLinkError(null);
        const trimmed = link.trim();
        if (!trimmed) {
            setLinkError('Paste the review link that was sent to your inbox.');
            return;
        }
        try {
            const url = new URL(trimmed, window.location.origin);
            const match = url.pathname.match(/\/review\/([^/?#]+)/);
            if (!match) {
                setLinkError('That link does not look like a review link. It should contain "/review/…".');
                return;
            }
            navigate(`/review/${match[1]}`);
        } catch {
            setLinkError('That does not look like a valid URL.');
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 flex items-center justify-center py-16">
                <div className="w-full max-w-lg px-4">
                    <div className="text-center mb-8">
                        <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 items-center justify-center shadow-lg mb-4">
                            <span className="text-3xl" aria-hidden="true">🧑‍⚖️</span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900">Reviewer Sign In</h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Sign in with your reviewer email and password to see every
                            assignment on your desk.
                        </p>
                    </div>

                    <form
                        onSubmit={handleLogin}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
                        aria-labelledby="reviewer-login-heading"
                        noValidate
                    >
                        <h2 id="reviewer-login-heading" className="sr-only">
                            Reviewer credentials
                        </h2>
                        {error && (
                            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                                {error}
                            </div>
                        )}
                        <label className="block text-sm" htmlFor="reviewer-email">
                            <span className="text-gray-700 font-semibold">Email</span>
                            <input
                                id="reviewer-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@university.edu"
                                className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                        </label>
                        <label className="block text-sm" htmlFor="reviewer-password">
                            <span className="text-gray-700 font-semibold">Password</span>
                            <input
                                id="reviewer-password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg"
                        >
                            {loading ? 'Signing in…' : 'Sign in →'}
                        </button>
                        <p className="text-xs text-gray-500 text-center">
                            First time here?{' '}
                            <Link to="/contact" className="text-brand-600 hover:underline font-semibold">
                                Contact the editorial office
                            </Link>{' '}
                            for an invitation link.
                        </p>
                    </form>

                    <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <button
                            type="button"
                            onClick={() => setShowLinkFallback((v) => !v)}
                            aria-expanded={showLinkFallback}
                            aria-controls="reviewer-link-fallback"
                            className="w-full text-left text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
                        >
                            {showLinkFallback ? '▾' : '▸'} Have an invitation link instead? Paste it here
                        </button>
                        {showLinkFallback && (
                            <form
                                id="reviewer-link-fallback"
                                onSubmit={openLink}
                                className="mt-4 space-y-3"
                                aria-label="Open review by invitation link"
                            >
                                {linkError && (
                                    <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                                        {linkError}
                                    </div>
                                )}
                                <label className="block text-sm" htmlFor="reviewer-link">
                                    <span className="text-gray-700 font-semibold">Review invitation link</span>
                                    <input
                                        id="reviewer-link"
                                        type="url"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        placeholder="https://journal.example.org/review/…"
                                        className="mt-2 block w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                    />
                                </label>
                                <button
                                    type="submit"
                                    className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-2.5 rounded-xl transition"
                                >
                                    Open Review →
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="mt-8 grid grid-cols-1 gap-3 text-center">
                        <Link
                            to="/for-reviewers"
                            className="text-sm text-gray-600 hover:text-brand-700 no-underline"
                        >
                            → Reviewer guidelines
                        </Link>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ReviewerLoginPage;
