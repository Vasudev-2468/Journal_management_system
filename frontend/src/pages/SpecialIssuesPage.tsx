import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import { SpecialIssue, fetchSpecialIssues } from '../api/platform';

const STATUS_COLOR: Record<SpecialIssue['status'], string> = {
    open: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-gray-100 text-gray-700',
    published: 'bg-blue-100 text-blue-700',
};

const SpecialIssuesPage: React.FC = () => {
    const [issues, setIssues] = useState<SpecialIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchSpecialIssues()
            .then((data) => {
                if (!cancelled) setIssues(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || 'Failed to load special issues.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            <section className="relative py-20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-brand-900 to-indigo-950" />
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-violet-500 blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
                </div>
                <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-brand-200 text-sm font-bold backdrop-blur-sm">
                        ✨ Themed collections
                    </span>
                    <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                        Special Issues
                    </h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto">
                        Guest-edited collections that gather focused research on active themes in AI and computing.
                    </p>
                </div>
            </section>

            <main className="flex-1 py-16">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white border border-red-200 rounded-2xl p-8 text-center text-red-600">
                            {error}
                        </div>
                    ) : issues.length === 0 ? (
                        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
                            <span className="text-5xl block mb-3">✨</span>
                            <h3 className="text-xl font-bold text-gray-900">No open special issues yet</h3>
                            <p className="mt-2 text-gray-500 max-w-lg mx-auto">
                                Guest-edited collections gather focused, thematic research. If you'd like to propose one,
                                contact the editorial office.
                            </p>
                            <Link
                                to="/contact"
                                className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition no-underline"
                            >
                                Propose a Special Issue →
                            </Link>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {issues.map((si) => (
                                <Link
                                    key={si.id}
                                    to={`/special-issues/${si.slug}`}
                                    className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 no-underline flex flex-col"
                                >
                                    <div className="h-36 bg-gradient-to-br from-violet-500 via-brand-600 to-indigo-700 relative overflow-hidden">
                                        <div className="absolute inset-0 opacity-30">
                                            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white blur-2xl" />
                                        </div>
                                        <div className="relative h-full flex items-center justify-center p-4">
                                            <span className="text-white text-lg font-black tracking-tight text-center line-clamp-3">
                                                {si.title}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-5 flex flex-col flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[si.status]}`}>
                                                {si.status.toUpperCase()}
                                            </span>
                                            {si.submission_deadline && (
                                                <span className="text-xs text-gray-500">
                                                    Deadline {new Date(si.submission_deadline).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 line-clamp-4 flex-1">
                                            {si.description}
                                        </p>
                                        {si.guest_editors && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                                    Guest Editors
                                                </p>
                                                <p className="text-xs text-gray-700 line-clamp-1 mt-0.5">
                                                    {si.guest_editors.split('\n')[0]}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default SpecialIssuesPage;
