import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchArticles } from '../../api/articles';
import { fetchVolumes } from '../../api/publication';

interface StatData {
    totalArticles: number;
    totalVolumes: number;
    publishedIssues: number;
    articlesByYear: { year: number; count: number }[];
    activeYears: number;
}

const useAnimatedCounter = (target: number, durationMs = 1400): number => {
    const [value, setValue] = useState(0);
    const startedRef = useRef(false);
    useEffect(() => {
        if (target <= 0) {
            setValue(0);
            return;
        }
        if (startedRef.current) {
            setValue(target);
            return;
        }
        startedRef.current = true;
        const start = performance.now();
        let raf = 0;
        const tick = (t: number) => {
            const elapsed = t - start;
            const p = Math.min(1, elapsed / durationMs);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(target * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, durationMs]);
    return value;
};

interface StatTileProps {
    value: number;
    label: string;
    caption: string;
    gradient: string;
    icon: React.ReactNode;
    suffix?: string;
}

const StatTile: React.FC<StatTileProps> = ({ value, label, caption, gradient, icon, suffix }) => {
    const display = useAnimatedCounter(value);
    return (
        <div className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
            <div className="p-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${gradient} text-white shadow-lg`}>
                    {icon}
                </div>
                <p className="text-4xl font-black text-gray-900 tracking-tight tabular-nums">
                    {display.toLocaleString()}
                    {suffix && <span className="text-2xl text-gray-400 ml-0.5">{suffix}</span>}
                </p>
                <p className="text-sm font-bold text-gray-800 mt-2">{label}</p>
                <p className="text-xs text-gray-500 mt-1">{caption}</p>
            </div>
        </div>
    );
};

const PublicationStatistics: React.FC = () => {
    const [data, setData] = useState<StatData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchArticles(), fetchVolumes()])
            .then(([articles, volumes]) => {
                if (cancelled) return;
                const yearMap: Record<number, number> = {};
                let publishedIssues = 0;
                for (const v of volumes) {
                    for (const i of v.issues) {
                        if (i.status === 'published') {
                            publishedIssues++;
                            const key = v.year;
                            yearMap[key] = (yearMap[key] || 0) + i.article_count;
                        }
                    }
                }
                if (Object.keys(yearMap).length === 0 && articles.length > 0) {
                    const nowYear = new Date().getFullYear();
                    yearMap[nowYear] = articles.length;
                }
                const articlesByYear = Object.entries(yearMap)
                    .map(([y, c]) => ({ year: Number(y), count: c as number }))
                    .sort((a, b) => a.year - b.year);
                setData({
                    totalArticles: articles.length,
                    totalVolumes: volumes.length,
                    publishedIssues,
                    articlesByYear,
                    activeYears: articlesByYear.length || 1,
                });
            })
            .catch(() => {
                if (!cancelled) setData({
                    totalArticles: 0,
                    totalVolumes: 0,
                    publishedIssues: 0,
                    articlesByYear: [],
                    activeYears: 1,
                });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const maxBar = useMemo(() => {
        if (!data || data.articlesByYear.length === 0) return 0;
        return Math.max(...data.articlesByYear.map((y) => y.count));
    }, [data]);

    return (
        <section className="py-20 bg-gradient-to-b from-white via-gray-50 to-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">
                        By the Numbers
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">
                        Publication Statistics
                    </h2>
                    <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
                        A transparent view of what the journal publishes each year.
                    </p>
                </div>

                {loading || !data ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-100 h-40" />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            <StatTile
                                value={data.totalArticles}
                                label="Articles Published"
                                caption="Across all volumes"
                                gradient="from-blue-500 to-indigo-600"
                                icon={
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                    </svg>
                                }
                            />
                            <StatTile
                                value={data.publishedIssues}
                                label="Published Issues"
                                caption="Peer-reviewed & open access"
                                gradient="from-emerald-500 to-teal-600"
                                icon={
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                }
                            />
                            <StatTile
                                value={data.totalVolumes}
                                label="Volumes"
                                caption={`Since publication launch`}
                                gradient="from-purple-500 to-pink-600"
                                icon={
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                }
                            />
                            <StatTile
                                value={100}
                                suffix="%"
                                label="Open Access"
                                caption="Every article, free forever"
                                gradient="from-amber-500 to-orange-600"
                                icon={
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    </svg>
                                }
                            />
                        </div>

                        {/* Papers per year chart */}
                        <div className="mt-10 bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Articles per year</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Growth of the published record
                                    </p>
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                    Live
                                </span>
                            </div>

                            {data.articlesByYear.length === 0 || maxBar === 0 ? (
                                <p className="text-center text-gray-500 py-10 text-sm">
                                    Publications begin from the inaugural issue — the chart populates as issues go live.
                                </p>
                            ) : (
                                <div className="flex items-end gap-4 h-52">
                                    {data.articlesByYear.map((y) => {
                                        const heightPct = (y.count / maxBar) * 100;
                                        return (
                                            <div
                                                key={y.year}
                                                className="flex-1 flex flex-col items-center gap-2 min-w-0"
                                            >
                                                <div className="flex-1 w-full flex items-end">
                                                    <div
                                                        className="w-full rounded-t-xl bg-gradient-to-t from-brand-600 via-brand-500 to-brand-400 relative group transition-all duration-500"
                                                        style={{ height: `${heightPct}%` }}
                                                    >
                                                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold text-brand-700 tabular-nums">
                                                            {y.count}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-semibold text-gray-500">
                                                    {y.year}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Extra badges */}
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
                                <span className="text-3xl">⚡</span>
                                <div>
                                    <p className="text-2xl font-extrabold text-emerald-700">10 days</p>
                                    <p className="text-xs text-emerald-600 font-medium">Average to first decision</p>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 flex items-center gap-4">
                                <span className="text-3xl">🌍</span>
                                <div>
                                    <p className="text-2xl font-extrabold text-blue-700">Global</p>
                                    <p className="text-xs text-blue-600 font-medium">Authors from 30+ countries</p>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 flex items-center gap-4">
                                <span className="text-3xl">🎓</span>
                                <div>
                                    <p className="text-2xl font-extrabold text-purple-700">Peer-reviewed</p>
                                    <p className="text-xs text-purple-600 font-medium">Double-blind, min. 3 reviewers</p>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

export default PublicationStatistics;
