import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../hooks/useAuth';

const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const auth = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await auth.login(email, password);
            navigate('/'); // Redirect to dashboard after successful login
        } catch (err) {
            setError('Invalid email or password');
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
            <div className="absolute inset-0">
                <img
                    src="https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1400&q=80"
                    alt="Journal research workspace"
                    className="h-full w-full object-cover opacity-20"
                />
                <div className="absolute inset-0 bg-slate-950/85" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
                <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                    <section className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-300">
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            International Journal Portal
                        </div>
                        <div className="space-y-4">
                            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                                Author access for manuscript submission, review, and tracking.
                            </h1>
                            <p className="max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
                                Join our academic publishing platform to submit your latest research, manage author details, and monitor editorial progress in a streamlined, secure portal.
                            </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
                                <h2 className="text-sm font-semibold text-slate-200">Submit with confidence</h2>
                                <p className="mt-3 text-sm text-slate-400">Register once, then sign in to upload manuscripts, metadata, and author declarations.</p>
                            </div>
                            <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20">
                                <h2 className="text-sm font-semibold text-slate-200">Trusted peer review</h2>
                                <p className="mt-3 text-sm text-slate-400">Your submission is routed through editorial review and reviewer assignment automatically.</p>
                            </div>
                        </div>
                    </section>

                    <main className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-10">
                        <div className="mb-8 text-center">
                            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-400">Author Login</p>
                            <h2 className="mt-4 text-3xl font-semibold text-white">Access your author dashboard</h2>
                            <p className="mt-3 text-sm leading-6 text-slate-400">
                                If you are a new author, register first and then return here to sign in.
                            </p>
                        </div>

                        {error && (
                            <div className="mb-5 rounded-3xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Email address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-2 w-full rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                    placeholder="jane@university.edu"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-2 w-full rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="inline-flex w-full items-center justify-center rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                            >
                                Login
                            </button>
                        </form>

                        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
                            <p className="font-medium text-slate-200">New author?</p>
                            <p className="mt-3">
                                Please{' '}
                                <a href="/author-register" className="font-semibold text-cyan-300 hover:text-cyan-200">
                                    register first
                                </a>{' '}
                                to add your profile to the journal database before signing in.
                            </p>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;