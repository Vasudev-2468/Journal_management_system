import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueSummary, VolumeSummary, fetchVolumes } from '../../api/publication';

interface Enriched extends IssueSummary {
    volume_number: number;
    volume_year: number;
}

const monthNumber = (m: string | null | undefined): number => {
    if (!m) return 0;
    const map: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    return map[m.trim().toLowerCase()] ?? 0;
};

const pickCurrent = (volumes: VolumeSummary[]): Enriched | null => {
    const flat: Enriched[] = [];
    for (const v of volumes) {
        for (const i of v.issues) {
            flat.push({ ...i, volume_number: v.number, volume_year: v.year });
        }
    }
    const published = flat.filter((i) => i.status === 'published');
    if (published.length === 0) return null;
    published.sort((a, b) => {
        if (a.volume_year !== b.volume_year) return b.volume_year - a.volume_year;
        if (a.volume_number !== b.volume_number) return b.volume_number - a.volume_number;
        const mDiff = monthNumber(b.month) - monthNumber(a.month);
        if (mDiff !== 0) return mDiff;
        return b.number - a.number;
    });
    return published[0];
};

const CurrentIssue: React.FC = () => {
    const [issue, setIssue] = useState<Enriched | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchVolumes()
            .then((volumes) => {
                if (!cancelled) setIssue(pickCurrent(volumes));
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.response?.data?.detail || err?.message || 'Failed to load current issue.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <section className="py-16 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="animate-pulse bg-gray-100 rounded-3xl h-72" />
                </div>
            </section>
        );
    }

    if (error) {
        return null;
    }

    if (!issue) {
        return (
            <section className="py-16 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">
                        Current Issue
                    </span>
                    <h2 className="text-3xl font-extrabold text-gray-900 mt-2">
                        Inaugural issue in preparation
                    </h2>
                    <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                        The first published issue will appear here soon. Meanwhile, the archive
                        page lists forthcoming volumes and issues.
                    </p>
                    <Link
                        to="/issues"
                        className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition shadow-lg no-underline"
                    >
                        Browse Archive →
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <section className="py-16 bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-10">
                    <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">
                        Current Issue
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">
                        Latest from the Journal
                    </h2>
                </div>

                <div className="bg-gradient-to-br from-brand-50 via-white to-brand-50/40 rounded-3xl border border-brand-100 shadow-xl overflow-hidden">
                    <div className="grid lg:grid-cols-5 gap-0">
                        {/* Cover */}
                        <div className="lg:col-span-2 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-10 flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-20">
                                <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white blur-3xl" />
                                <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-cyan-400 blur-3xl" />
                            </div>
                            <div className="relative aspect-[3/4] w-full max-w-[240px] rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 border-4 border-white/15 shadow-2xl flex flex-col items-center justify-center p-6">
                                <span className="text-brand-100 text-[10px] font-bold uppercase tracking-widest">
                                    Volume {issue.volume_number}
                                </span>
                                <p className="text-white text-6xl font-extrabold my-2 leading-none drop-shadow-lg">
                                    {issue.number}
                                </p>
                                <p className="text-brand-100 text-xs font-semibold">
                                    {issue.month || ''} {issue.volume_year}
                                </p>
                                {issue.theme && (
                                    <div className="mt-5 pt-4 border-t border-white/20 w-full">
                                        <p className="text-[10px] text-brand-100 text-center italic px-2">
                                            {issue.theme}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Meta */}
                        <div className="lg:col-span-3 p-8 lg:p-12 flex flex-col justify-center">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Just Published
                                </span>
                                <span className="text-xs text-gray-500 font-semibold">
                                    {issue.month} {issue.volume_year}
                                </span>
                            </div>
                            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                                Volume {issue.volume_number}, Issue {issue.number}
                            </h3>
                            {issue.theme && (
                                <p className="mt-2 text-lg font-semibold text-brand-700">
                                    {issue.theme}
                                </p>
                            )}
                            {issue.editorial_note && (
                                <p className="mt-4 text-sm text-gray-600 leading-relaxed">
                                    {issue.editorial_note}
                                </p>
                            )}

                            <div className="mt-6 grid grid-cols-3 gap-3">
                                <div className="bg-white rounded-xl border border-gray-100 py-4 px-2 text-center shadow-sm">
                                    <p className="text-3xl font-extrabold text-brand-700">
                                        {issue.article_count}
                                    </p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">
                                        Articles
                                    </p>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 py-4 px-2 text-center shadow-sm">
                                    <p className="text-lg font-extrabold text-brand-700 mt-1.5">
                                        Open
                                    </p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-0.5">
                                        Access
                                    </p>
                                </div>
                                <div className="bg-white rounded-xl border border-gray-100 py-4 px-2 text-center shadow-sm">
                                    <p className="text-lg font-extrabold text-brand-700 mt-1.5">
                                        CC BY
                                    </p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-0.5">
                                        Licence
                                    </p>
                                </div>
                            </div>

                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link
                                    to={`/issues/${issue.volume_number}/${issue.number}`}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition shadow-lg no-underline"
                                >
                                    Browse Issue
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                    </svg>
                                </Link>
                                <Link
                                    to="/issues"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 text-sm font-bold rounded-xl hover:bg-gray-50 transition no-underline"
                                >
                                    View All Issues
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CurrentIssue;
