import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import { Announcement, AnnouncementKind, fetchAnnouncements } from '../api/announcements';

const KIND_META: Record<AnnouncementKind, { label: string; badge: string; accent: string; icon: string }> = {
    news: {
        label: 'News',
        badge: 'bg-blue-100 text-blue-800',
        accent: 'from-blue-500 via-indigo-500 to-purple-500',
        icon: '📰',
    },
    cfp: {
        label: 'Call for Papers',
        badge: 'bg-amber-100 text-amber-800',
        accent: 'from-amber-500 via-orange-500 to-rose-500',
        icon: '📣',
    },
    update: {
        label: 'Update',
        badge: 'bg-purple-100 text-purple-800',
        accent: 'from-purple-500 via-fuchsia-500 to-pink-500',
        icon: '✨',
    },
};

const AnnouncementsPage: React.FC = () => {
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<AnnouncementKind | 'all'>('all');

    useEffect(() => {
        let cancelled = false;
        fetchAnnouncements({ limit: 100 })
            .then((data) => {
                if (!cancelled) setItems(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || 'Failed to load announcements.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = filter === 'all' ? items : items.filter((a) => a.kind === filter);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            {/* Hero */}
            <section className="relative py-20 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                    <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-purple-500 blur-3xl" />
                </div>
                <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                        Announcements
                    </h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto">
                        News, calls for papers, and updates from the journal.
                    </p>
                </div>
            </section>

            <main className="flex-1 py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-wrap gap-2 mb-8">
                        {(['all', 'news', 'cfp', 'update'] as const).map((k) => (
                            <button
                                key={k}
                                onClick={() => setFilter(k)}
                                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                                    filter === k
                                        ? 'bg-brand-600 text-white shadow-lg'
                                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {k === 'all' ? 'All' : KIND_META[k].label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white border border-red-200 rounded-2xl p-8 text-center text-red-600">
                            {error}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-4xl block mb-3">🔔</span>
                            <h3 className="text-lg font-bold text-gray-900">Nothing to announce</h3>
                            <p className="mt-2 text-gray-500">Check back soon.</p>
                        </div>
                    ) : (
                        <ul className="space-y-5">
                            {filtered.map((a) => {
                                const meta = KIND_META[a.kind];
                                return (
                                    <li
                                        key={a.id}
                                        className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                                    >
                                        <div className={`h-1.5 bg-gradient-to-r ${meta.accent}`} />
                                        <div className="p-6">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${meta.badge}`}>
                                                    <span>{meta.icon}</span>
                                                    {meta.label}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {new Date(a.published_at).toLocaleDateString(undefined, {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                    })}
                                                </span>
                                                {a.expires_at && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                        Deadline {new Date(a.expires_at).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                            <h2 className="text-xl font-extrabold text-gray-900 group-hover:text-brand-700 transition">
                                                {a.title}
                                            </h2>
                                            <p className="mt-3 text-gray-700 whitespace-pre-line leading-relaxed">
                                                {a.body}
                                            </p>
                                            {a.link_url && (
                                                <a
                                                    href={a.link_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-800 no-underline"
                                                >
                                                    Learn more →
                                                </a>
                                            )}
                                            {a.kind === 'cfp' && (
                                                <div className="mt-5 pt-4 border-t border-gray-100">
                                                    <Link
                                                        to="/author-login"
                                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                                                    >
                                                        Submit to this call →
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default AnnouncementsPage;
