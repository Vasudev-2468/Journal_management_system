import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import { SpecialIssue, fetchSpecialIssue } from '../api/platform';

const parseLines = (raw: string | null): string[] =>
    (raw || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const SpecialIssueDetailPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [issue, setIssue] = useState<SpecialIssue | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        fetchSpecialIssue(slug)
            .then((data) => {
                if (!cancelled) setIssue(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.response?.data?.detail || err?.message || 'Not found.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 py-24">
                    <Loading />
                </main>
                <Footer />
            </div>
        );
    }

    if (error || !issue) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 flex items-center justify-center py-24">
                    <div className="text-center px-4">
                        <span className="text-5xl block mb-4">🔍</span>
                        <h1 className="text-2xl font-bold text-gray-900">Special issue not found</h1>
                        <p className="mt-2 text-gray-500">{error}</p>
                        <Link
                            to="/special-issues"
                            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            ← All Special Issues
                        </Link>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    const editors = parseLines(issue.guest_editors);
    const topics = parseLines(issue.topics);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={`${issue.title} — JGAIR Special Issue`}
                description={(issue.description || '').replace(/\s+/g, ' ').trim().slice(0, 240) || undefined}
                canonical={
                    typeof window !== 'undefined'
                        ? `${window.location.origin}/special-issues/${issue.slug}`
                        : undefined
                }
                image={issue.cover_image_url ?? undefined}
                type="website"
            />
            <Header />

            <section className="relative py-24 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-brand-900 to-indigo-950" />
                {issue.cover_image_url && (
                    <img
                        src={issue.cover_image_url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 to-transparent" />
                <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <Link
                        to="/special-issues"
                        className="inline-flex items-center gap-2 text-brand-200 hover:text-white transition no-underline text-sm mb-6"
                    >
                        ← All Special Issues
                    </Link>
                    <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                            issue.status === 'open'
                                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                : issue.status === 'published'
                                ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                                : 'bg-white/10 text-brand-200 border border-white/20'
                        }`}
                    >
                        {issue.status.toUpperCase()}
                    </span>
                    <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">
                        {issue.title}
                    </h1>
                    {issue.submission_deadline && (
                        <p className="mt-4 text-brand-200 text-sm">
                            🗓️ Submission deadline:{' '}
                            <strong className="text-white">
                                {new Date(issue.submission_deadline).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </strong>
                        </p>
                    )}
                </div>
            </section>

            <main className="flex-1 py-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">About this collection</h2>
                        <div className="prose prose-gray max-w-none">
                            <p className="whitespace-pre-line leading-relaxed">{issue.description}</p>
                        </div>

                        {topics.length > 0 && (
                            <div className="mt-10">
                                <h3 className="text-lg font-bold text-gray-900 mb-3">Topics of interest</h3>
                                <div className="flex flex-wrap gap-2">
                                    {topics.map((t, i) => (
                                        <span
                                            key={i}
                                            className="px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold border border-brand-100"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {issue.status === 'open' && (
                            <div className="mt-10 p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
                                <h3 className="text-lg font-extrabold text-amber-900">Submit to this special issue</h3>
                                <p className="mt-2 text-sm text-amber-800">
                                    Include "Special Issue: {issue.title}" in your cover letter so the editorial office
                                    routes the submission to the right guest editor.
                                </p>
                                <Link
                                    to="/author-login"
                                    className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition shadow-lg no-underline"
                                >
                                    Submit Manuscript →
                                </Link>
                            </div>
                        )}
                    </div>

                    <aside className="space-y-6">
                        {editors.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                                    Guest Editors
                                </h3>
                                <ul className="space-y-2 text-sm text-gray-700">
                                    {editors.map((e, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="text-brand-600 mt-1">▸</span>
                                            {e}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {(issue.submission_deadline || issue.publication_date) && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3 text-sm">
                                {issue.submission_deadline && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Submission deadline</p>
                                        <p className="font-semibold text-gray-900 mt-1">
                                            {new Date(issue.submission_deadline).toLocaleDateString()}
                                        </p>
                                    </div>
                                )}
                                {issue.publication_date && (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Expected publication</p>
                                        <p className="font-semibold text-gray-900 mt-1">
                                            {new Date(issue.publication_date).toLocaleDateString()}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </aside>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default SpecialIssueDetailPage;
