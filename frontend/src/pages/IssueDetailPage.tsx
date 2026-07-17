import React from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import {
    ArticleEntry,
    findIssue,
    pageRangeFor,
    sectionForCategory,
    SECTION_ORDER,
    categoryColor,
    statusBadge,
    ArticleSection,
} from '../data/issues';

const ArticleRow: React.FC<{ article: ArticleEntry }> = ({ article }) => (
    <div className="flex items-start gap-4 py-4 border-b border-gray-100 last:border-0 group">
        <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        categoryColor[article.category] || 'bg-gray-100 text-gray-600'
                    }`}
                >
                    {article.category}
                </span>
                <span className="text-xs text-gray-400">pp. {article.pages}</span>
                {article.openAccess && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        🔓 Open Access
                    </span>
                )}
            </div>
            <h4 className="text-base font-bold text-gray-900 group-hover:text-brand-700 transition leading-snug">
                <Link
                    to={`/articles/${article.id}`}
                    className="no-underline text-inherit hover:text-brand-700"
                >
                    {article.title}
                </Link>
            </h4>
            <p className="text-sm text-gray-500 mt-1">{article.authors}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
                <p className="text-xs text-gray-400 font-mono">{article.doi}</p>
                <span className="text-[11px] text-gray-300">|</span>
                <button className="text-xs text-gray-500 hover:text-brand-700 transition">
                    Abstract
                </button>
                <span className="text-[11px] text-gray-300">|</span>
                <button className="text-xs text-gray-500 hover:text-brand-700 transition">
                    Cite
                </button>
            </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2 pt-1">
            <button className="text-xs text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg font-semibold cursor-pointer hover:bg-brand-100 transition">
                PDF
            </button>
        </div>
    </div>
);

const IssueDetailPage: React.FC = () => {
    const { volume: volParam, issue: issueParam } = useParams<{ volume: string; issue: string }>();
    const volumeNum = Number(volParam);
    const issueNum = Number(issueParam);
    const found = Number.isFinite(volumeNum) && Number.isFinite(issueNum) ? findIssue(volumeNum, issueNum) : null;

    if (!found) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 flex items-center justify-center py-24">
                    <div className="text-center max-w-md px-4">
                        <span className="text-5xl block mb-4">📄</span>
                        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Issue not found</h1>
                        <p className="text-sm text-gray-500 mb-6">
                            We couldn't find Volume {volParam}, Issue {issueParam}. It may not exist yet.
                        </p>
                        <Link
                            to="/issues"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            ← Back to Issues & Archives
                        </Link>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    const { volume, issue } = found;
    const badge = statusBadge[issue.status];
    const pageRange = pageRangeFor(issue);

    /* Group articles by their section bucket */
    const grouped: Record<ArticleSection, ArticleEntry[]> = {
        Editorial: [],
        'Research Articles': [],
        'Review Articles': [],
        'Short Communications': [],
        Other: [],
    };
    for (const a of issue.articles) {
        grouped[sectionForCategory(a.category)].push(a);
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            {/* ── Breadcrumb ────────────────────────────── */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-xs text-gray-500">
                    <Link to="/" className="hover:text-brand-700 no-underline text-gray-500">
                        Home
                    </Link>
                    <span className="mx-2">›</span>
                    <Link to="/issues" className="hover:text-brand-700 no-underline text-gray-500">
                        Issues & Archives
                    </Link>
                    <span className="mx-2">›</span>
                    <span className="text-gray-700 font-semibold">
                        Volume {volume.volume}, Issue {issue.number}
                    </span>
                </div>
            </div>

            <main className="flex-1">
                {/* ── Issue header ─────────────────────── */}
                <section className="relative overflow-hidden bg-gradient-to-r from-brand-700 via-brand-800 to-brand-900 text-white">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 grid lg:grid-cols-3 gap-10 items-center">
                        {/* Cover */}
                        <div className="lg:col-span-1">
                            <div className="aspect-[3/4] max-w-xs mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-brand-500 to-brand-800 border-4 border-white/10 flex flex-col items-center justify-center p-6">
                                <span className="text-brand-100 text-xs font-bold uppercase tracking-widest">
                                    JGAIR
                                </span>
                                <div className="mt-3 text-center">
                                    <p className="text-brand-100 text-sm font-semibold">Volume {volume.volume}</p>
                                    <p className="text-white text-5xl font-extrabold my-2">
                                        {issue.number}
                                    </p>
                                    <p className="text-brand-100 text-sm font-semibold">
                                        {issue.month} {volume.year}
                                    </p>
                                </div>
                                {issue.theme && (
                                    <div className="mt-5 pt-4 border-t border-white/20 w-full">
                                        <p className="text-xs text-brand-100 text-center italic">
                                            {issue.theme}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Meta */}
                        <div className="lg:col-span-2">
                            <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${badge.color}`}
                            >
                                {badge.text}
                            </span>
                            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
                                Volume {volume.volume}, Issue {issue.number}
                            </h1>
                            <p className="mt-2 text-lg text-brand-100">
                                {issue.month} {volume.year}
                                {pageRange ? ` · pp. ${pageRange}` : ''}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    📄 {issue.articleCount} article{issue.articleCount === 1 ? '' : 's'}
                                </span>
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    🔗 DOI 10.xxxxx/jgair.{volume.year}.{String(issue.number).padStart(2, '0')}
                                </span>
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg font-semibold">
                                    🔓 Open Access · CC BY 4.0
                                </span>
                            </div>

                            {issue.editorialNote && (
                                <div className="mt-6 p-4 bg-white/10 rounded-xl border border-white/15">
                                    <p className="text-xs font-bold text-brand-100 uppercase tracking-wider mb-2">
                                        Editor's note
                                    </p>
                                    <p className="text-sm text-white/90 leading-relaxed">
                                        {issue.editorialNote}
                                    </p>
                                </div>
                            )}

                            {issue.status === 'published' && (
                                <div className="mt-6 flex flex-wrap gap-3">
                                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white text-brand-800 text-sm font-bold rounded-lg hover:bg-gray-100 transition">
                                        📥 Download full issue (PDF)
                                    </button>
                                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/25 text-white text-sm font-bold rounded-lg hover:bg-white/20 transition">
                                        📋 Export citations
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Articles by section ──────────────── */}
                <section className="py-12">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        {issue.status !== 'published' ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                                <span className="text-4xl mb-3 block">
                                    {issue.status === 'accepting' ? '📝' : '🗓️'}
                                </span>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">
                                    {issue.status === 'accepting'
                                        ? 'Now Accepting Submissions'
                                        : 'Not Yet Open for Submissions'}
                                </h2>
                                <p className="text-sm text-gray-500 mb-4">
                                    {issue.deadline
                                        ? `Submission deadline: ${issue.deadline}`
                                        : 'Timeline to be announced'}
                                </p>
                                {issue.theme && (
                                    <p className="text-xs text-violet-600 mb-4">Theme: {issue.theme}</p>
                                )}
                                {issue.status === 'accepting' && (
                                    <Link
                                        to="/author-login"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                                    >
                                        Submit to This Issue →
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="text-lg font-extrabold text-gray-900">
                                        Table of contents
                                    </h2>
                                    <span className="text-xs text-gray-400">
                                        {issue.articleCount} article
                                        {issue.articleCount === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="px-6 py-2">
                                    {SECTION_ORDER.filter((s) => grouped[s].length > 0).map(
                                        (section) => (
                                            <div key={section} className="py-4">
                                                <p className="text-[11px] font-extrabold text-brand-600 uppercase tracking-widest mb-1">
                                                    {section}
                                                </p>
                                                <div className="w-8 h-0.5 bg-brand-600 rounded mb-2" />
                                                {grouped[section].map((a) => (
                                                    <ArticleRow key={a.id} article={a} />
                                                ))}
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Back to archive */}
                        <div className="mt-8 text-center">
                            <Link
                                to="/issues"
                                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-700 no-underline"
                            >
                                ← Back to Issues & Archives
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default IssueDetailPage;
