import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';
import {
    volumes,
    categoryColor,
    statusBadge,
    getCurrentIssue,
    getForthcomingIssue,
    pageRangeFor,
} from '../data/issues';

/* ── Images & Video ──────────────────────────────────── */
const IMG = {
    hero: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=1920&h=600&fit=crop&q=80',
    archive: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&h=500&fit=crop&q=80',
    preservation: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop&q=80',
    reading: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&h=400&fit=crop&q=80',
};
const HERO_VIDEO = 'https://videos.pexels.com/video-files/7710243/7710243-hd_1920_1080_30fps.mp4';

/* ── Archiving Partners ──────────────────────────────── */
const archivePartners = [
    { name: 'CLOCKSS', purpose: 'Dark archive for disaster recovery', icon: '🔒' },
    { name: 'Portico', purpose: 'Digital preservation', icon: '🏛️' },
    { name: 'Internet Archive', purpose: 'Public backup & long-term access', icon: '🌐' },
    { name: 'Crossref DOI', purpose: 'Persistent article identification', icon: '🔗' },
];

/* ── Indexing / Abstracting ──────────────────────────── */
const indexingServices = [
    { name: 'Scopus', label: 'Indexing (applied)', tint: 'bg-orange-50 text-orange-800 border-orange-200' },
    { name: 'DOAJ', label: 'Open access directory', tint: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { name: 'Crossref', label: 'DOI registration', tint: 'bg-sky-50 text-sky-800 border-sky-200' },
    { name: 'Google Scholar', label: 'Full-text indexed', tint: 'bg-blue-50 text-blue-800 border-blue-200' },
    { name: 'DBLP', label: 'CS bibliography', tint: 'bg-violet-50 text-violet-800 border-violet-200' },
    { name: 'OpenAIRE', label: 'Open science network', tint: 'bg-teal-50 text-teal-800 border-teal-200' },
];

/* ── Reader Features ─────────────────────────────────── */
const readerFeatures = [
    { feature: 'Free PDF downloads', available: true },
    { feature: 'No registration required', available: true },
    { feature: 'Mobile-friendly reading', available: true },
    { feature: 'Citation export (RIS, BibTeX, EndNote)', available: true },
    { feature: 'Share article links', available: true },
    { feature: 'Print whole issue', available: true },
];

/* ── Publication Timeline ────────────────────────────── */
const timelineItems = [
    { year: '2026', quarter: 'March', label: 'Volume 1, Issue 1', sub: 'Inaugural Issue', status: 'published' as const },
    { year: '2026', quarter: 'June', label: 'Volume 1, Issue 2', sub: 'Accepting submissions', status: 'accepting' as const },
    { year: '2026', quarter: 'September', label: 'Volume 1, Issue 3', sub: 'Trustworthy AI', status: 'accepting' as const },
    { year: '2026', quarter: 'December', label: 'Volume 1, Issue 4', sub: 'Planned', status: 'not-open' as const },
    { year: '2027', quarter: 'March', label: 'Volume 2, Issue 1', sub: 'Coming soon', status: 'not-open' as const },
    { year: '2027', quarter: 'June', label: 'Volume 2, Issue 2', sub: 'Coming soon', status: 'not-open' as const },
];

/* ══════════════════════════════════════════════════════ */

const IssuesArchivesPage: React.FC = () => {
    const [selectedVolume, setSelectedVolume] = useState<number>(1);
    const [expandedIssue, setExpandedIssue] = useState<string | null>('1-1');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFilter, setSearchFilter] = useState<'title' | 'author' | 'keyword' | 'doi'>('title');
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.src = HERO_VIDEO;
        v.load();
    }, []);

    const activeVolume = volumes.find((v) => v.volume === selectedVolume)!;
    const current = getCurrentIssue();
    const forthcoming = getForthcomingIssue();
    const currentPageRange = current ? pageRangeFor(current.issue) : null;

    const toggleIssue = (key: string) => {
        setExpandedIssue(expandedIssue === key ? null : key);
    };

    /* ── Search handler ─────────────────────────────── */
    const filteredArticles = searchQuery.trim()
        ? volumes.flatMap(v =>
              v.issues.flatMap(issue =>
                  issue.articles.filter(a => {
                      const q = searchQuery.toLowerCase();
                      if (searchFilter === 'title') return a.title.toLowerCase().includes(q);
                      if (searchFilter === 'author') return a.authors.toLowerCase().includes(q);
                      if (searchFilter === 'doi') return a.doi.toLowerCase().includes(q);
                      return a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q);
                  }).map(a => ({ ...a, volumeNum: v.volume, issueNum: issue.number, year: v.year, month: issue.month }))
              )
          )
        : [];

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            {/* ── Hero ──────────────────────────────────── */}
            <section className="relative h-[380px] lg:h-[420px] flex items-center overflow-hidden">
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay loop muted playsInline
                    onCanPlayThrough={() => setVideoReady(true)}
                    style={{ opacity: videoReady ? 1 : 0, transition: 'opacity 1.2s ease-in' }}
                />
                <img src={IMG.hero} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: videoReady ? 0 : 1, transition: 'opacity 1.2s' }} />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-950/75 to-brand-900/60" />
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-block mb-5"><JournalLogo variant="compact" dark /></div>
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">Issues &amp; Archives</h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto leading-relaxed font-light">
                        Browse published volumes, forthcoming issues, and the complete archive of IJACR — free and open access for all.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> ISSN: XXXX-XXXX
                        </span>
                        <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-semibold">
                            📚 {volumes.reduce((s, v) => s + v.issues.filter(i => i.status === 'published').length, 0)} Published Issues
                        </span>
                        <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-semibold">
                            📄 {volumes.reduce((s, v) => s + v.issues.reduce((a, i) => a + i.articleCount, 0), 0)} Articles
                        </span>
                    </div>
                </div>
            </section>

            <main className="flex-1">

                {/* ── 1. Current Issue (featured) ─────────── */}
                {current && (
                    <section className="py-12 bg-white border-b border-gray-100">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="text-center mb-8">
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Current Issue</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">
                                    Latest from IJACR
                                </h2>
                            </div>
                            <div className="bg-gradient-to-br from-brand-50 via-white to-brand-50/50 rounded-3xl border border-brand-100 shadow-xl overflow-hidden">
                                <div className="grid lg:grid-cols-5 gap-0">
                                    {/* Cover */}
                                    <div className="lg:col-span-2 bg-gradient-to-br from-brand-600 to-brand-900 p-10 flex items-center justify-center">
                                        <div className="aspect-[3/4] w-full max-w-[220px] rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 border-4 border-white/15 shadow-2xl flex flex-col items-center justify-center p-6">
                                            <span className="text-brand-100 text-[10px] font-bold uppercase tracking-widest">IJACR</span>
                                            <p className="mt-3 text-brand-100 text-xs font-semibold">Volume {current.volume.volume}</p>
                                            <p className="text-white text-5xl font-extrabold my-2">{current.issue.number}</p>
                                            <p className="text-brand-100 text-xs font-semibold">{current.issue.month} {current.volume.year}</p>
                                            {current.issue.theme && (
                                                <div className="mt-5 pt-4 border-t border-white/20 w-full">
                                                    <p className="text-[10px] text-brand-100 text-center italic">{current.issue.theme}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Meta */}
                                    <div className="lg:col-span-3 p-8 lg:p-10 flex flex-col justify-center">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Just Published
                                            </span>
                                            <span className="text-xs text-gray-500 font-semibold">
                                                {current.issue.month} {current.volume.year}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                                            Volume {current.volume.volume}, Issue {current.issue.number}
                                        </h3>
                                        {current.issue.theme && (
                                            <p className="mt-1 text-sm font-semibold text-brand-700">{current.issue.theme}</p>
                                        )}
                                        {current.issue.editorialNote && (
                                            <p className="mt-4 text-sm text-gray-600 leading-relaxed">
                                                {current.issue.editorialNote}
                                            </p>
                                        )}

                                        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                                            <div className="bg-white rounded-xl border border-gray-100 py-3 px-2">
                                                <p className="text-2xl font-extrabold text-brand-700">{current.issue.articleCount}</p>
                                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Articles</p>
                                            </div>
                                            <div className="bg-white rounded-xl border border-gray-100 py-3 px-2">
                                                <p className="text-sm font-extrabold text-brand-700 mt-1.5">{currentPageRange ?? '—'}</p>
                                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-0.5">Pages</p>
                                            </div>
                                            <div className="bg-white rounded-xl border border-gray-100 py-3 px-2">
                                                <p className="text-sm font-extrabold text-brand-700 mt-1.5 font-mono">10.xxxxx</p>
                                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-0.5">DOI Prefix</p>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex flex-wrap gap-3">
                                            <Link
                                                to={`/issues/${current.volume.volume}/${current.issue.number}`}
                                                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition shadow-lg no-underline"
                                            >
                                                Browse Issue →
                                            </Link>
                                            <button className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 text-sm font-bold rounded-xl hover:bg-gray-50 transition">
                                                📥 Download PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── 2. Forthcoming / Articles in Press ──── */}
                {forthcoming && (
                    <section className="py-12 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
                        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="text-center mb-8">
                                <span className="text-amber-700 text-sm font-bold uppercase tracking-wider">Forthcoming</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">
                                    Articles in Press
                                </h2>
                                <p className="text-sm text-gray-500 mt-2 max-w-xl mx-auto">
                                    Accepted, citable articles will appear here before the issue is formally compiled.
                                </p>
                            </div>

                            <div className="grid lg:grid-cols-3 gap-6">
                                {/* CFP card */}
                                <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 shadow-sm">
                                    <span className="inline-block px-2.5 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full mb-3">
                                        📢 Call for Papers
                                    </span>
                                    <h3 className="text-lg font-extrabold text-gray-900">
                                        Volume {forthcoming.volume.volume}, Issue {forthcoming.issue.number}
                                    </h3>
                                    <p className="text-sm font-semibold text-amber-700 mt-0.5">
                                        {forthcoming.issue.month} {forthcoming.volume.year}
                                    </p>
                                    {forthcoming.issue.theme && (
                                        <p className="mt-3 text-xs text-gray-600 italic">
                                            Theme: {forthcoming.issue.theme}
                                        </p>
                                    )}
                                    <div className="mt-4 space-y-2 text-xs">
                                        <p className="text-gray-500">
                                            <span className="font-semibold text-gray-700">Submission deadline:</span> {forthcoming.issue.deadline || 'TBA'}
                                        </p>
                                        <p className="text-gray-500">
                                            <span className="font-semibold text-gray-700">Expected publication:</span> {forthcoming.issue.month} {forthcoming.volume.year}
                                        </p>
                                        <p className="text-gray-500">
                                            <span className="font-semibold text-gray-700">Scope:</span> All topics within journal scope
                                        </p>
                                    </div>
                                    <Link
                                        to="/author-login"
                                        className="mt-5 inline-flex items-center gap-2 w-full justify-center px-4 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition no-underline"
                                    >
                                        Submit Manuscript →
                                    </Link>
                                </div>

                                {/* Accepted-articles placeholder */}
                                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-8 flex flex-col justify-center items-center text-center">
                                    <span className="text-4xl mb-3 block">📝</span>
                                    <h3 className="text-lg font-bold text-gray-900">
                                        No accepted articles yet
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-2 max-w-md">
                                        Once the editorial team accepts a manuscript for Issue {forthcoming.issue.number}, it will be listed here with full DOI and PDF — citable before the issue is compiled.
                                    </p>
                                    <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-gray-400">
                                        <span className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-full">Online-first workflow</span>
                                        <span className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-full">Individual DOI on acceptance</span>
                                        <span className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-full">Rolling publication</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── 3. Archive Search ───────────────────── */}
                <section className="py-8 bg-white border-b border-gray-100">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex flex-col sm:flex-row items-stretch gap-3">
                            <div className="flex-1 relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search articles by title, author, keyword, or DOI…"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                />
                            </div>
                            <select
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value as any)}
                                title="Search filter"
                                className="px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                                <option value="title">Title</option>
                                <option value="author">Author</option>
                                <option value="keyword">Keyword</option>
                                <option value="doi">DOI</option>
                            </select>
                        </div>

                        {searchQuery.trim() && (
                            <div className="mt-4">
                                <p className="text-xs text-gray-500 mb-3">{filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''} found</p>
                                {filteredArticles.length > 0 ? (
                                    <div className="space-y-3">
                                        {filteredArticles.map(a => (
                                            <div key={a.id} className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${categoryColor[a.category] || 'bg-gray-100 text-gray-600'}`}>{a.category}</span>
                                                        <Link
                                                            to={`/issues/${a.volumeNum}/${a.issueNum}`}
                                                            className="text-[11px] text-gray-400 hover:text-brand-700 no-underline"
                                                        >
                                                            Vol. {a.volumeNum}, Issue {a.issueNum} ({a.month} {a.year})
                                                        </Link>
                                                    </div>
                                                    <h4 className="text-sm font-bold text-gray-900 leading-snug">{a.title}</h4>
                                                    <p className="text-xs text-gray-500 mt-1">{a.authors}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{a.doi}</p>
                                                </div>
                                                <span className="text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg font-semibold cursor-pointer hover:bg-brand-100 transition flex-shrink-0">PDF</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 text-center py-4">No articles match your search.</p>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 4. Archive Browser (Volume / Issue) ── */}
                <section className="py-12 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Archive Browser</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Browse by Volume &amp; Issue</h2>
                        </div>

                        <div className="grid lg:grid-cols-4 gap-8">
                            {/* Left sidebar — Volume selector */}
                            <aside className="lg:col-span-1">
                                <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-24">
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Volumes</h3>
                                    <div className="space-y-1.5">
                                        {volumes.map((v) => {
                                            const pubCount = v.issues.filter(i => i.status === 'published').length;
                                            const totalArticles = v.issues.reduce((s, i) => s + i.articleCount, 0);
                                            return (
                                                <button
                                                    key={v.volume}
                                                    onClick={() => { setSelectedVolume(v.volume); setExpandedIssue(null); }}
                                                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition ${
                                                        selectedVolume === v.volume
                                                            ? 'bg-brand-600 text-white shadow-md'
                                                            : 'text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <span className="font-bold">Vol. {v.volume}</span>
                                                    <span className={`ml-2 ${selectedVolume === v.volume ? 'text-brand-200' : 'text-gray-400'}`}>
                                                        ({v.year})
                                                    </span>
                                                    <span className={`block text-xs mt-0.5 ${selectedVolume === v.volume ? 'text-brand-200' : 'text-gray-400'}`}>
                                                        {v.issues.length} issues · {totalArticles > 0 ? `${totalArticles} articles` : 'Planned'}
                                                    </span>
                                                    {pubCount > 0 && (
                                                        <span className={`block text-[10px] mt-1 ${selectedVolume === v.volume ? 'text-brand-200' : 'text-emerald-500'}`}>
                                                            ● {pubCount} published
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-6 pt-5 border-t border-gray-100">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Links</h4>
                                        <div className="space-y-2 text-xs">
                                            {current && (
                                                <Link
                                                    to={`/issues/${current.volume.volume}/${current.issue.number}`}
                                                    className="flex items-center gap-2 text-brand-600 hover:text-brand-800 font-semibold transition no-underline"
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Current Issue
                                                </Link>
                                            )}
                                            <a href="#publication-timeline" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition no-underline">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Publication Timeline
                                            </a>
                                            <a href="#indexing" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition no-underline">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Indexing &amp; Abstracting
                                            </a>
                                            <a href="#archiving" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition no-underline">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Archiving &amp; Preservation
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </aside>

                            {/* Right — Issues list */}
                            <div className="lg:col-span-3">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-gray-900">
                                        Volume {activeVolume.volume} <span className="text-gray-400 font-normal">({activeVolume.year})</span>
                                    </h2>
                                    <span className="text-sm text-gray-500">
                                        {activeVolume.issues.length} Issues · {activeVolume.issues.reduce((s, i) => s + i.articleCount, 0)} Articles
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {activeVolume.issues.map((issue) => {
                                        const key = `${activeVolume.volume}-${issue.number}`;
                                        const isOpen = expandedIssue === key;
                                        const badge = statusBadge[issue.status];
                                        return (
                                            <div key={key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition">
                                                {/* Issue header */}
                                                <button
                                                    onClick={() => toggleIssue(key)}
                                                    className="w-full flex items-center justify-between px-6 py-5 text-left"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-14 rounded-lg flex flex-col items-center justify-center px-2 py-3 flex-shrink-0 shadow-sm ${
                                                            issue.status === 'published'
                                                                ? 'bg-gradient-to-br from-brand-500 to-brand-700'
                                                                : issue.status === 'accepting'
                                                                ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                                                                : 'bg-gradient-to-br from-gray-300 to-gray-400'
                                                        }`}>
                                                            <span className="text-white text-[10px] font-bold">VOL {activeVolume.volume}</span>
                                                            <span className="text-white text-lg font-extrabold leading-none mt-0.5">{issue.number}</span>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-base font-bold text-gray-900">
                                                                    Issue {issue.number} — {issue.month} {activeVolume.year}
                                                                </h3>
                                                                {issue.theme && (
                                                                    <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-[11px] font-semibold rounded-full border border-violet-100">
                                                                        {issue.theme}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-gray-500 mt-0.5">
                                                                {issue.status === 'published'
                                                                    ? `${issue.articleCount} articles published`
                                                                    : issue.deadline
                                                                    ? `Submission deadline: ${issue.deadline}`
                                                                    : 'Details coming soon'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${badge.color}`}>
                                                            {badge.text}
                                                        </span>
                                                        <svg
                                                            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                        </svg>
                                                    </div>
                                                </button>

                                                {/* Expanded content */}
                                                {isOpen && (
                                                    <div className="border-t border-gray-100 px-6 py-4">
                                                        {issue.status === 'published' && issue.articles.length > 0 ? (
                                                            <>
                                                                <div className="space-y-4">
                                                                    {issue.articles.slice(0, 4).map((article) => (
                                                                        <div key={article.id} className="flex items-start gap-4 py-3 border-b border-gray-50 last:border-0 group">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${categoryColor[article.category] || 'bg-gray-100 text-gray-600'}`}>
                                                                                        {article.category}
                                                                                    </span>
                                                                                    <span className="text-xs text-gray-400">pp. {article.pages}</span>
                                                                                </div>
                                                                                <h4 className="text-sm font-bold text-gray-900 group-hover:text-brand-700 transition leading-snug">
                                                                                    <Link to={`/articles/${article.id}`} className="no-underline text-inherit hover:text-brand-700">
                                                                                        {article.title}
                                                                                    </Link>
                                                                                </h4>
                                                                                <p className="text-xs text-gray-500 mt-1">{article.authors}</p>
                                                                                <p className="text-xs text-gray-400 mt-0.5 font-mono">{article.doi}</p>
                                                                            </div>
                                                                            <div className="flex-shrink-0 flex items-center gap-2 pt-1">
                                                                                <span className="text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg font-semibold cursor-pointer hover:bg-brand-100 transition">
                                                                                    PDF
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
                                                                    <Link
                                                                        to={`/issues/${activeVolume.volume}/${issue.number}`}
                                                                        className="text-xs text-white bg-brand-600 px-3 py-1.5 rounded-lg font-bold hover:bg-brand-700 transition no-underline flex items-center gap-1.5"
                                                                    >
                                                                        View full issue →
                                                                    </Link>
                                                                    <button className="text-xs text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-100 transition flex items-center gap-1.5">
                                                                        📥 Download Full Issue (PDF)
                                                                    </button>
                                                                    <button className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-100 transition">
                                                                        Export Citations (RIS)
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : issue.status === 'accepting' ? (
                                                            <div className="text-center py-8">
                                                                <span className="text-4xl mb-3 block">📝</span>
                                                                <p className="text-sm font-bold text-gray-900 mb-1">Now Accepting Submissions</p>
                                                                <p className="text-xs text-gray-500 mb-1">
                                                                    {issue.deadline ? `Submission deadline: ${issue.deadline}` : 'Deadline to be announced'}
                                                                </p>
                                                                {issue.theme && <p className="text-xs text-violet-600 mb-3">Theme: {issue.theme}</p>}
                                                                <p className="text-xs text-gray-400 mb-4">Table of contents will be announced upon publication.</p>
                                                                <div className="flex flex-wrap justify-center gap-2">
                                                                    <Link to="/author-login" className="inline-flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline">
                                                                        Submit to This Issue →
                                                                    </Link>
                                                                    <Link
                                                                        to={`/issues/${activeVolume.volume}/${issue.number}`}
                                                                        className="inline-flex items-center gap-2 px-5 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 transition no-underline"
                                                                    >
                                                                        View issue page →
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center py-8">
                                                                <span className="text-4xl mb-3 block">🗓️</span>
                                                                <p className="text-sm font-bold text-gray-900 mb-1">Not Yet Open for Submissions</p>
                                                                <p className="text-xs text-gray-500 mb-4">
                                                                    {issue.deadline ? `Expected submission deadline: ${issue.deadline}` : 'Submission timeline to be announced'}
                                                                </p>
                                                                <Link
                                                                    to={`/issues/${activeVolume.volume}/${issue.number}`}
                                                                    className="inline-flex items-center gap-2 px-5 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 transition no-underline"
                                                                >
                                                                    View issue page →
                                                                </Link>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 5. Special Issues ───────────────────── */}
                <section className="py-14 bg-white">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-8">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Special Issues</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Thematic Collections</h2>
                        </div>
                        <div className="bg-gradient-to-br from-violet-50 via-white to-violet-50/50 rounded-2xl border-2 border-dashed border-violet-200 p-10 text-center">
                            <span className="text-4xl mb-3 block">✨</span>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">No special issues yet</h3>
                            <p className="text-sm text-gray-500 max-w-lg mx-auto mb-6">
                                Special issues gather focused, thematic research from an active area of AI and computing. Guest-edited collections start here.
                            </p>
                            <Link
                                to="/for-authors"
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-700 transition no-underline"
                            >
                                Propose a Special Issue →
                            </Link>
                            <div className="mt-6 flex flex-wrap justify-center gap-2 text-[11px] text-gray-400">
                                <span className="px-2.5 py-1 bg-white border border-gray-100 rounded-full">Guest-edited</span>
                                <span className="px-2.5 py-1 bg-white border border-gray-100 rounded-full">Thematic focus</span>
                                <span className="px-2.5 py-1 bg-white border border-gray-100 rounded-full">Peer-reviewed</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 6. Publication Timeline ─────────────── */}
                <section id="publication-timeline" className="py-16 bg-gray-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div>
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Quarterly Publication</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Publication Timeline</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <p className="text-sm text-gray-600 leading-relaxed mb-6">
                                    IJACR publishes four issues per year (March, June, September, December). Our archive is organized by volume and issue for easy navigation.
                                </p>

                                <div className="relative pl-8">
                                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
                                    {timelineItems.map((t, idx) => (
                                        <div key={idx} className="relative mb-5 last:mb-0">
                                            <div className={`absolute -left-5 w-3 h-3 rounded-full border-2 border-white shadow ${
                                                t.status === 'published' ? 'bg-emerald-500' : t.status === 'accepting' ? 'bg-blue-500' : 'bg-gray-300'
                                            }`} />
                                            <div className="flex items-baseline gap-3">
                                                <span className="text-xs font-bold text-gray-400 w-16 flex-shrink-0">{t.year} {t.quarter.slice(0, 3)}</span>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{t.label}</p>
                                                    <p className="text-xs text-gray-500">{t.sub}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-2xl overflow-hidden shadow-xl">
                                <img src={IMG.archive} alt="Library and archives" className="w-full h-80 object-cover" loading="lazy" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 7. Indexing & Abstracting strip ─────── */}
                <section id="indexing" className="py-14 bg-white border-t border-gray-100">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-8">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Indexing &amp; Abstracting</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Where IJACR is Indexed</h2>
                            <p className="text-sm text-gray-500 mt-3 max-w-xl mx-auto">
                                Every article is registered with a Crossref DOI and discoverable through major academic databases.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {indexingServices.map((svc) => (
                                <div
                                    key={svc.name}
                                    className={`rounded-xl border p-4 text-center ${svc.tint}`}
                                >
                                    <p className="text-sm font-extrabold">{svc.name}</p>
                                    <p className="text-[10px] mt-1 opacity-80 font-medium uppercase tracking-wider">
                                        {svc.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 8. Archiving & Preservation ─────────── */}
                <section id="archiving" className="relative py-20 overflow-hidden">
                    <div className="absolute inset-0">
                        <img src={IMG.preservation} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/85 to-brand-800/80" />
                    </div>
                    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-extrabold text-white tracking-tight">Archiving &amp; Preservation</h2>
                            <p className="text-brand-200 mt-3 max-w-2xl mx-auto">
                                To ensure long-term access, IJACR participates in leading digital preservation programs. All articles are assigned a Crossref DOI and indexed in major databases.
                            </p>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {archivePartners.map(a => (
                                <div key={a.name} className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-5 text-center">
                                    <span className="text-3xl block mb-3">{a.icon}</span>
                                    <h3 className="text-sm font-bold text-white">{a.name}</h3>
                                    <p className="text-xs text-brand-200 mt-1.5">{a.purpose}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 9. Archive Policy ───────────────────── */}
                <section className="py-14 bg-gray-50 border-t border-gray-100">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xl">📜</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-extrabold text-gray-900">Archive Policy</h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Our commitments to open access, licensing, and long-term preservation.
                                    </p>
                                </div>
                            </div>
                            <div className="grid sm:grid-cols-3 gap-4">
                                <div className="p-5 rounded-xl border border-gray-100 bg-emerald-50/50">
                                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Open Access</p>
                                    <p className="text-sm font-bold text-gray-900 mt-1.5">Free to read, share, and reuse</p>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                        Every article is freely available without subscription or paywall from the moment of publication.
                                    </p>
                                </div>
                                <div className="p-5 rounded-xl border border-gray-100 bg-sky-50/50">
                                    <p className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">License</p>
                                    <p className="text-sm font-bold text-gray-900 mt-1.5">CC BY 4.0</p>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                        Articles are published under Creative Commons Attribution 4.0 — reuse permitted with credit to the authors.
                                    </p>
                                </div>
                                <div className="p-5 rounded-xl border border-gray-100 bg-violet-50/50">
                                    <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Preservation</p>
                                    <p className="text-sm font-bold text-gray-900 mt-1.5">CLOCKSS &amp; Portico</p>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                        Content is deposited into LOCKSS-based dark archives and Portico for guaranteed long-term preservation.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 10. For Readers & Librarians ────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid sm:grid-cols-2 gap-8">
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                        </svg>
                                    </div>
                                    <h2 className="text-lg font-extrabold text-gray-900">For Readers</h2>
                                </div>
                                <div className="space-y-2">
                                    {readerFeatures.map(f => (
                                        <div key={f.feature} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-2.5">
                                            <span className="text-sm text-gray-700">{f.feature}</span>
                                            <span className="text-emerald-500 text-xs font-bold">✅ Yes</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-brand-50 rounded-2xl border border-brand-100 p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-lg bg-brand-200 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                                        </svg>
                                    </div>
                                    <h2 className="text-lg font-extrabold text-brand-900">For Librarians</h2>
                                </div>
                                <ul className="space-y-3 text-sm text-brand-800">
                                    {[
                                        'COUNTER-compliant usage statistics (coming soon)',
                                        'KBART and MARC21 records available on request',
                                        'Third-party discovery services (EBSCO, ProQuest — under negotiation)',
                                        'Open Access — no subscription required',
                                    ].map(item => (
                                        <li key={item} className="flex items-start gap-2">
                                            <svg className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-5 p-4 bg-white/60 rounded-xl border border-brand-100">
                                    <p className="text-xs text-brand-700">
                                        <strong>Contact:</strong> For KBART records, usage reports, or institutional inquiries, email{' '}
                                        <a href="mailto:librarian@ijacr-journal.org" className="text-brand-600 underline font-semibold">librarian@ijacr-journal.org</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 11. RSS / Alerts ────────────────────── */}
                <section className="py-12 bg-gray-50 border-t border-gray-100">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
                            <div className="rounded-2xl overflow-hidden flex-shrink-0 w-full sm:w-48 h-32">
                                <img src={IMG.reading} alt="Stay updated" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h2 className="text-xl font-extrabold text-gray-900">Stay Updated</h2>
                                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                                    Subscribe to get notified when new issues are published. Never miss a breakthrough paper.
                                </p>
                                <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-3">
                                    <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 transition">
                                        📡 RSS Feed
                                    </button>
                                    <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition">
                                        📧 Email Alerts
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── 12. CTA Banner ──────────────────────── */}
                <section className="py-16 bg-brand-600">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Contribute to IJACR</h2>
                        <p className="text-brand-200 text-lg mt-3 max-w-2xl mx-auto">
                            Publish your AI &amp; computing research in a peer-reviewed, open-access journal with global reach.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <Link to="/author-login" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                                Submit a Manuscript
                            </Link>
                            <Link to="/for-reviewers" className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]">
                                Become a Reviewer
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default IssuesArchivesPage;
