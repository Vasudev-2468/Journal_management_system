import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Announcement, fetchAnnouncements } from '../../api/announcements';

const TOPICS = [
    'Artificial Intelligence',
    'Machine Learning',
    'Natural Language Processing',
    'Computer Vision',
    'Deep Learning',
    'Generative AI & LLMs',
    'Reinforcement Learning',
    'Federated Learning',
    'AI for Healthcare',
    'AI Ethics & Fairness',
    'Quantum Computing & AI',
    'Edge AI & IoT',
];

const CallForPapersSection: React.FC = () => {
    const [cfps, setCfps] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchAnnouncements({ kind: 'cfp', limit: 4 })
            .then((data) => {
                if (!cancelled) setCfps(data);
            })
            .catch(() => {
                if (!cancelled) setCfps([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section className="relative py-20 overflow-hidden">
            {/* Ambient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950" />
            <div className="absolute inset-0 opacity-40">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-500 blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-cyan-500 blur-3xl opacity-30" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-sm font-bold backdrop-blur-sm">
                        <span className="text-lg">📣</span>
                        Now Open
                    </span>
                    <h2 className="text-3xl sm:text-5xl font-extrabold text-white mt-4 tracking-tight drop-shadow-lg">
                        Call for Papers
                    </h2>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto font-light">
                        Submit your original research and join a global community advancing
                        AI and computing. Free open-access publication, rigorous peer review,
                        first decision in 10 days.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6 mb-10">
                    {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="animate-pulse rounded-2xl bg-white/5 border border-white/10 h-56"
                            />
                        ))
                    ) : cfps.length === 0 ? (
                        <div className="lg:col-span-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-10 text-center">
                            <span className="text-4xl block mb-3">✍️</span>
                            <h3 className="text-xl font-bold text-white">
                                General submissions welcome
                            </h3>
                            <p className="mt-2 text-brand-200 max-w-lg mx-auto">
                                No themed calls are open right now — the journal accepts high-quality
                                original research across every topic in scope, all year round.
                            </p>
                        </div>
                    ) : (
                        cfps.map((cfp) => (
                            <div
                                key={cfp.id}
                                className="group relative bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-6 hover:bg-white/15 hover:border-white/30 transition-all duration-300 flex flex-col"
                            >
                                <div className="absolute top-4 right-4">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider">
                                        CFP
                                    </span>
                                </div>
                                <h3 className="text-lg font-extrabold text-white pr-14 leading-snug">
                                    {cfp.title}
                                </h3>
                                <p className="mt-3 text-sm text-brand-200 line-clamp-4 flex-1 whitespace-pre-line">
                                    {cfp.body}
                                </p>
                                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                                    <span className="text-brand-300">
                                        {cfp.expires_at
                                            ? `Deadline: ${new Date(cfp.expires_at).toLocaleDateString()}`
                                            : 'Open submission'}
                                    </span>
                                    {cfp.link_url ? (
                                        <a
                                            href={cfp.link_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-amber-300 font-bold hover:text-amber-200 no-underline inline-flex items-center gap-1"
                                        >
                                            Details →
                                        </a>
                                    ) : (
                                        <Link
                                            to="/author-login"
                                            className="text-amber-300 font-bold hover:text-amber-200 no-underline inline-flex items-center gap-1"
                                        >
                                            Submit →
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Topics */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 mb-10">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-4">
                        Topics of Interest
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {TOPICS.map((topic) => (
                            <span
                                key={topic}
                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-brand-100 text-xs font-medium hover:bg-white/10 transition"
                            >
                                {topic}
                            </span>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <div className="text-center">
                    <div className="inline-flex flex-wrap justify-center gap-4">
                        <Link
                            to="/author-login"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-900 font-bold rounded-2xl hover:bg-gray-100 transition shadow-2xl shadow-black/40 no-underline text-[15px]"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Submit Manuscript
                        </Link>
                        <Link
                            to="/for-authors"
                            className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-bold rounded-2xl hover:bg-white/10 transition no-underline text-[15px] backdrop-blur-sm"
                        >
                            Author Guidelines
                        </Link>
                    </div>
                    <p className="mt-5 text-xs text-brand-300">
                        ✓ No article processing charges &nbsp;·&nbsp; ✓ Double-blind peer review &nbsp;·&nbsp; ✓ CC BY 4.0 open access
                    </p>
                </div>
            </div>
        </section>
    );
};

export default CallForPapersSection;
