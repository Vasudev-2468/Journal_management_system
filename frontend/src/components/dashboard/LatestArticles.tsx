import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchArticles } from '../../api/articles';
import { Article } from '../../types';

const CATEGORY_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-red-600',
    'from-cyan-500 to-blue-600',
];

const initials = (title: string): string => {
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '§';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
};

const excerpt = (text: string | null | undefined, length = 160): string => {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length <= length ? clean : `${clean.slice(0, length).trimEnd()}…`;
};

const LatestArticles: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchArticles()
            .then((data) => {
                if (!cancelled) {
                    setArticles(data.slice(0, 6));
                }
            })
            .catch(() => {
                if (!cancelled) setArticles([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section className="py-16 bg-gradient-to-b from-gray-50 via-white to-gray-50 border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
                    <div>
                        <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">
                            Latest Research
                        </span>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">
                            Recently Published Articles
                        </h2>
                        <p className="mt-2 text-gray-500 max-w-xl">
                            Freshly peer-reviewed, open-access research — free to read, download, and cite.
                        </p>
                    </div>
                    <Link
                        to="/articles"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition no-underline shadow-sm"
                    >
                        View all articles
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                    </Link>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="animate-pulse rounded-2xl bg-white border border-gray-100 h-64"
                            />
                        ))}
                    </div>
                ) : articles.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                        <span className="text-4xl block mb-3">📚</span>
                        <h3 className="text-lg font-bold text-gray-900">
                            First issue on the way
                        </h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                            Once the editorial team publishes the inaugural articles, they'll appear
                            here with abstract, keywords, PDF, and DOI.
                        </p>
                        <Link
                            to="/author-login"
                            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition no-underline"
                        >
                            Submit Your Manuscript →
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {articles.map((article, idx) => {
                            const grad = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                            const author = article.author_display || article.author || 'Unknown author';
                            return (
                                <Link
                                    key={article.id}
                                    to={`/articles/${article.id}`}
                                    className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 no-underline flex flex-col"
                                >
                                    <div className={`h-32 bg-gradient-to-br ${grad} relative overflow-hidden`}>
                                        <div className="absolute inset-0 opacity-25">
                                            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white blur-2xl" />
                                        </div>
                                        <div className="relative h-full flex items-center justify-center">
                                            <span className="text-5xl font-black text-white/90 drop-shadow-lg tracking-tighter">
                                                {initials(article.title)}
                                            </span>
                                        </div>
                                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold rounded-full border border-white/30">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            OPEN ACCESS
                                        </span>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col">
                                        <h3 className="text-base font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-brand-700 transition">
                                            {article.title}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-2 line-clamp-1">
                                            {author}
                                        </p>
                                        {article.abstract && (
                                            <p className="text-sm text-gray-600 mt-3 line-clamp-3 flex-1">
                                                {excerpt(article.abstract)}
                                            </p>
                                        )}
                                        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                                            <span className="text-xs text-gray-400 font-mono">
                                                Article #{article.id}
                                            </span>
                                            <span className="text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                                Read more
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                                </svg>
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};

export default LatestArticles;
