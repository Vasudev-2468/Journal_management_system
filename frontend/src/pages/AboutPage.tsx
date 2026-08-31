import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';
import SEO from '../components/common/SEO';
import { useJournal } from '../context/JournalContext';

/* ── Images (Unsplash, free licence) ──────────────────── */
const IMG = {
    hero: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=1920&h=600&fit=crop&q=80',       // library books
    aiResearch: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=500&fit=crop&q=80',  // AI brain
    openAccess: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&h=500&fit=crop&q=80',  // studying
    peerReview: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=500&fit=crop&q=80',  // writing
    history: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=500&fit=crop&q=80',     // old library
    plagiarism: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&h=400&fit=crop&q=80',     // code
    ethics: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800&h=400&fit=crop&q=80',      // lab
};

const HERO_VIDEO = 'https://videos.pexels.com/video-files/8199364/8199364-hd_1920_1080_25fps.mp4';

/* ── Timeline data ────────────────────────────────────── */
const timeline = [
    { year: '2013', event: 'JGAIR founded by Academic Press International' },
    { year: '2015', event: 'First 100 articles published; CrossRef DOI integrated' },
    { year: '2018', event: 'Indexed in Google Scholar & DOAJ' },
    { year: '2021', event: 'Achieved Scopus indexing with CiteScore 2.4' },
    { year: '2023', event: 'Web of Science ESCI listing obtained' },
    { year: '2024', event: 'AI-powered peer review tools launched; review time cut to 10 days' },
    { year: '2026', event: 'Volume 14 — 1,200+ articles, 50+ countries, Impact Factor 4.32' },
];

/* ── Review process steps ─────────────────────────────── */
const reviewSteps = [
    { num: '01', title: 'Submission', desc: 'Author submits manuscript via online portal with metadata and files.', icon: '📄', time: 'Day 0' },
    { num: '02', title: 'Editorial Screening', desc: 'Editor checks scope, ethics compliance, and formatting within 48 hours.', icon: '🔍', time: '~2 days' },
    { num: '03', title: 'AI Plagiarism Check', desc: 'Automated similarity detection; manuscripts >15% flagged for revision.', icon: '🤖', time: '~1 day' },
    { num: '04', title: 'Reviewer Assignment', desc: 'AI-matched experts invited; 2-3 reviewers per manuscript.', icon: '👥', time: '~3 days' },
    { num: '05', title: 'Peer Review', desc: 'Double-blind evaluation of originality, methodology, significance & clarity.', icon: '📝', time: '~10 days' },
    { num: '06', title: 'Editorial Decision', desc: 'Accept, minor/major revision, or reject based on reviewer consensus.', icon: '⚖️', time: '~1 day' },
    { num: '07', title: 'Publication', desc: 'Copyediting, DOI assignment, and open-access online publication.', icon: '🚀', time: '~5 days' },
];

/* ── Indexing bodies ──────────────────────────────────── */
const indexing = [
    { name: 'Scopus', desc: 'CiteScore 3.8', color: 'bg-orange-50 border-orange-200 text-orange-700' },
    { name: 'Web of Science', desc: 'ESCI Indexed', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { name: 'DOAJ', desc: 'Open Access', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { name: 'CrossRef', desc: 'DOI Provider', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
    { name: 'Google Scholar', desc: 'Full Indexing', color: 'bg-sky-50 border-sky-200 text-sky-700' },
    { name: 'CLOCKSS', desc: 'Archiving', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { name: 'LOCKSS', desc: 'Preservation', color: 'bg-pink-50 border-pink-200 text-pink-700' },
    { name: 'Semantic Scholar', desc: 'AI-indexed', color: 'bg-teal-50 border-teal-200 text-teal-700' },
];

/* ── Topics ────────────────────────────────────────────── */
const topics = [
    'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Reinforcement Learning',
    'Federated Learning', 'Generative AI & LLMs', 'AI for Healthcare', 'Autonomous Systems',
    'AI Ethics & Fairness', 'Quantum Computing', 'Edge AI & IoT', 'Diffusion Models',
    'Robotics', 'Explainable AI', 'AI Safety',
];

/* ── Vision pillars ────────────────────────────────────── */
const visionPillars = [
    'A borderless, barrier-free knowledge commons for AI research',
    'AI itself as a partner in fair, transparent scholarly review',
    'Bridging theory, engineering, and societal impact',
];

/* ── Mission commitments ───────────────────────────────── */
const missionCommitments = [
    'Zero article-processing charges — always',
    'Median 10-day peer review, no compromise on rigour',
    'COPE-aligned ethics, plagiarism, and dispute handling',
];

/* ── Target audience personas ──────────────────────────── */
const audience = [
    { icon: '🎓', title: 'Academic Researchers', desc: 'Faculty and PhD scholars working at the frontier of AI, ML, and computational intelligence.' },
    { icon: '🏭', title: 'Industry Practitioners', desc: 'Engineers and applied scientists translating AI research into production systems.' },
    { icon: '🔬', title: 'R&D Laboratories', desc: 'Corporate and government research units driving next-generation intelligent systems.' },
    { icon: '📖', title: 'Graduate Students', desc: 'Master’s and doctoral candidates building foundational expertise and their first publications.' },
    { icon: '⚖️', title: 'Policymakers', desc: 'Governance leaders shaping standards, ethics, and regulation of AI technologies.' },
    { icon: '🌐', title: 'Interdisciplinary Teams', desc: 'Healthcare, finance, climate, and social-science teams applying AI to domain problems.' },
];

/* ── Paper types ──────────────────────────────────────── */
const paperTypes = [
    { icon: '📄', title: 'Original Research Article', pages: '8–15 pages', desc: 'Novel, unpublished research with rigorous methodology, results, and discussion — the mainstay of the journal.' },
    { icon: '📚', title: 'Review Article', pages: '15–25 pages', desc: 'Comprehensive, critical synthesis of a research area with future directions. Invited or unsolicited.' },
    { icon: '⚡', title: 'Short Communication', pages: '3–6 pages', desc: 'Concise report of a novel finding or early result of high impact requiring rapid dissemination.' },
    { icon: '🛠️', title: 'Technical Note', pages: '4–8 pages', desc: 'Description of a new method, tool, dataset, or benchmark of value to the community.' },
    { icon: '🔍', title: 'Case Study', pages: '6–12 pages', desc: 'In-depth analysis of a real-world AI deployment, its outcomes, and lessons learned.' },
    { icon: '💭', title: 'Perspective / Editorial', pages: '2–5 pages', desc: 'Expert opinion, position statement, or forward-looking commentary on the field.' },
];

/* ── CC BY 4.0 permissions ────────────────────────────── */
const licenseGrants = [
    { icon: '📖', title: 'Share', desc: 'Copy and redistribute in any medium or format' },
    { icon: '🔄', title: 'Adapt', desc: 'Remix, transform, and build upon the work' },
    { icon: '💼', title: 'Commercial use', desc: 'Any purpose, including commercially' },
    { icon: '🏷️', title: 'Attribution', desc: 'Credit the original authors on reuse' },
];

/* ── Copyright commitments ────────────────────────────── */
const copyrightPoints = [
    { t: 'Authors retain copyright.', d: 'No transfer or assignment ever required.' },
    { t: 'Non-exclusive publishing licence.', d: 'JGAIR may publish and archive; you retain every other right.' },
    { t: 'Reuse in teaching and derivatives.', d: 'Include your article in theses, courseware, and future books.' },
    { t: 'Self-archive without embargo.', d: 'Deposit the published PDF in any repository the day of publication.' },
];

/* ══════════════════════════════════════════════════════ */

// JG-101: Publication Details grid is now driven from the journal identity
// record. Fields with no value are omitted rather than rendered as empty
// labels — the reference journal fails at exactly this.
type FactItem = { label: string; value: string; icon: string };

const buildPublicationFacts = (
    journal: import('../api/journal').JournalIdentity | null
): FactItem[] => {
    if (!journal) return [];
    const facts: FactItem[] = [];
    if (journal.frequency) facts.push({ label: 'Frequency', value: journal.frequency, icon: '📅' });
    if (journal.issn_print) facts.push({ label: 'Print ISSN', value: journal.issn_print, icon: '🖨️' });
    if (journal.issn_online) facts.push({ label: 'Online ISSN', value: journal.issn_online, icon: '🌐' });
    if (journal.publisher_name) facts.push({ label: 'Publisher', value: journal.publisher_name, icon: '🏛️' });
    if (journal.language) facts.push({ label: 'Language', value: journal.language, icon: '🗣️' });
    if (journal.start_year) facts.push({ label: 'Founded', value: String(journal.start_year), icon: '⏳' });
    if (journal.subject_area) facts.push({ label: 'Subject Area', value: journal.subject_area, icon: '📚' });
    if (journal.licence) facts.push({ label: 'Licence', value: journal.licence, icon: '⚖️' });
    // Editorial commitments — not stored on Journal, still safe to render.
    facts.push({ label: 'Article Processing Charge', value: 'No APC — Free to publish', icon: '💰' });
    facts.push({ label: 'Review Type', value: 'Double-Blind Peer Review', icon: '🔒' });
    return facts;
};

const AboutPage: React.FC = () => {
    const { journal } = useJournal();
    const publicationFacts = buildPublicationFacts(journal);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.src = HERO_VIDEO;
        v.load();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title="About the Journal — JGAIR"
                description="The Journal of Generative and Applied Intelligence Research (JGAIR) is an international, peer-reviewed, open-access journal publishing original research, reviews, and technical notes across artificial intelligence, machine learning, and computational sciences."
                canonical={
                    typeof window !== 'undefined'
                        ? `${window.location.origin}/about`
                        : undefined
                }
                type="website"
            />
            <Header />

            {/* ── Hero banner with video ────────────────────── */}
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
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">About the Journal</h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto leading-relaxed font-light">
                        Advancing AI &amp; Computing research through open-access publishing, rigorous peer review, and AI-powered editorial innovation.
                    </p>
                </div>
            </section>

            <main className="flex-1">
                {/* ── Aims & Scope ──────────────────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div>
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Editorial Focus</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Aims &amp; Scope</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <div className="space-y-4 text-[15px] text-gray-600 leading-relaxed">
                                    <p>
                                        The <strong className="text-gray-900">Journal of Generative and Applied Intelligence Research (JGAIR)</strong> is
                                        an international, peer-reviewed, open-access journal that publishes original research articles, comprehensive reviews, 
                                        short communications, and technical notes across all areas of artificial intelligence, machine learning, and computational sciences.
                                    </p>
                                    <p>
                                        Focusing on both theoretical foundations and practical engineering approaches, JGAIR provides a premier forum for researchers, 
                                        engineers, and practitioners to share advances in intelligent systems. The journal uniquely integrates AI-powered editorial 
                                        workflows — including automated plagiarism detection, intelligent reviewer matching, and AI-assisted quality assessment — to 
                                        deliver faster, fairer, and more transparent peer review.
                                    </p>
                                </div>
                                <div className="mt-6">
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Topics of Interest</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {topics.map(t => (
                                            <span key={t} className="px-3 py-1 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold rounded-full">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl overflow-hidden shadow-xl">
                                <img src={IMG.aiResearch} alt="AI Research Visualization" className="w-full h-80 object-cover" loading="lazy" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Vision & Mission ────────────────────────── */}
                <section className="relative py-20 bg-white overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-brand-100 rounded-full blur-3xl opacity-50" />
                        <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] bg-emerald-100 rounded-full blur-3xl opacity-50" />
                    </div>
                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Purpose &amp; Direction</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">Vision &amp; Mission</h2>
                            <div className="w-12 h-1 bg-brand-600 rounded mx-auto mt-3" />
                            <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
                                Where JGAIR is going, and what we do every day to get there.
                            </p>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Vision card */}
                            <div className="group relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 p-[2px] shadow-2xl hover:shadow-brand-500/40 transition-shadow duration-500">
                                <div className="relative bg-white rounded-[22px] p-8 h-full">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/40 group-hover:scale-110 transition-transform">
                                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Vision</p>
                                            <h3 className="text-2xl font-extrabold text-gray-900 leading-tight">Looking Forward</h3>
                                        </div>
                                    </div>
                                    <p className="text-[15px] text-gray-600 leading-relaxed">
                                        To become the world&apos;s most trusted open-access forum for generative and applied intelligence
                                        research — a place where every meaningful advance in AI reaches the practitioners, scientists,
                                        and policymakers who can act on it, unhindered by paywalls, borders, or delay.
                                    </p>
                                    <ul className="mt-6 space-y-3">
                                        {visionPillars.map(v => (
                                            <li key={v} className="flex items-start gap-3 text-sm text-gray-700">
                                                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                                                <span className="leading-relaxed">{v}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Mission card */}
                            <div className="group relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-700 to-teal-800 p-[2px] shadow-2xl hover:shadow-emerald-500/40 transition-shadow duration-500">
                                <div className="relative bg-white rounded-[22px] p-8 h-full">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/40 group-hover:scale-110 transition-transform">
                                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Mission</p>
                                            <h3 className="text-2xl font-extrabold text-gray-900 leading-tight">Working Today</h3>
                                        </div>
                                    </div>
                                    <p className="text-[15px] text-gray-600 leading-relaxed">
                                        We publish rigorously reviewed AI research at speed, free to read and free to publish, with
                                        editorial transparency that authors and readers can verify. We invest in AI-assisted peer
                                        review to shorten decision times, widen reviewer diversity, and hold every manuscript to the
                                        same standard of evidence.
                                    </p>
                                    <ul className="mt-6 space-y-3">
                                        {missionCommitments.map(m => (
                                            <li key={m} className="flex items-start gap-3 text-sm text-gray-700">
                                                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                                <span className="leading-relaxed">{m}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Target Audience ─────────────────────────── */}
                <section className="py-20 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Who We Serve</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">Target Audience</h2>
                            <div className="w-12 h-1 bg-brand-600 rounded mx-auto mt-3" />
                            <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
                                JGAIR speaks to a global community of AI creators, users, and stewards — from foundational
                                researchers to practitioners deploying intelligent systems in the real world.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {audience.map(a => (
                                <div
                                    key={a.title}
                                    className="group relative bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-brand-100 to-transparent rounded-bl-[64px] opacity-60 group-hover:opacity-100 transition" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-2xl shadow-md shadow-brand-500/30 mb-4">
                                            <span>{a.icon}</span>
                                        </div>
                                        <h3 className="text-base font-extrabold text-gray-900 mb-2">{a.title}</h3>
                                        <p className="text-sm text-gray-600 leading-relaxed">{a.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Types of Papers Accepted ────────────────── */}
                <section className="py-20 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Submission Categories</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">Types of Papers Accepted</h2>
                            <div className="w-12 h-1 bg-brand-600 rounded mx-auto mt-3" />
                            <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
                                Six manuscript types, one standard of rigour. Choose the format that fits the shape of your contribution.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {paperTypes.map(p => (
                                <div
                                    key={p.title}
                                    className="group relative bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 p-6 hover:shadow-2xl hover:border-brand-200 transition-all duration-300 overflow-hidden"
                                >
                                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-50 rounded-full opacity-0 group-hover:opacity-100 transition duration-500" aria-hidden="true" />
                                    <div className="relative">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="w-14 h-14 rounded-2xl bg-white border-2 border-brand-200 flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 group-hover:border-brand-400 transition-all duration-300">
                                                {p.icon}
                                            </div>
                                            <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">
                                                {p.pages}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-extrabold text-gray-900 mb-2">{p.title}</h3>
                                        <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-10 max-w-3xl mx-auto text-center bg-brand-50 border border-brand-100 rounded-2xl p-6">
                            <p className="text-sm text-brand-900">
                                <strong>Not sure which format fits?</strong>{' '}
                                <Link to="/for-authors" className="text-brand-700 font-semibold hover:text-brand-800 underline underline-offset-2">
                                    Consult the Author Guidelines
                                </Link>{' '}
                                or contact the editorial office — we&apos;re happy to advise.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ── History timeline ───────────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-start">
                            <div className="rounded-2xl overflow-hidden shadow-xl order-2 lg:order-1">
                                <img src={IMG.history} alt="Library heritage" className="w-full h-80 object-cover" loading="lazy" />
                            </div>
                            <div className="order-1 lg:order-2">
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Our Journey</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">History &amp; Publisher</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <p className="text-[15px] text-gray-600 leading-relaxed mb-6">
                                    Founded in 2013 by <strong className="text-gray-900">Academic Press International</strong>, JGAIR has grown from a small 
                                    regional publication into a globally recognized, Scopus-indexed journal serving the AI research community across 50+ countries.
                                </p>
                                {/* Timeline */}
                                <div className="relative pl-6 border-l-2 border-brand-200 space-y-5">
                                    {timeline.map(t => (
                                        <div key={t.year} className="relative">
                                            <span className="absolute -left-[25px] w-3 h-3 rounded-full bg-brand-600 border-2 border-white shadow" />
                                            <span className="text-brand-600 font-bold text-sm">{t.year}</span>
                                            <p className="text-sm text-gray-600 mt-0.5">{t.event}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Open Access Statement ──────────────────── */}
                <section className="relative py-20 overflow-hidden">
                    <div className="absolute inset-0">
                        <img src={IMG.openAccess} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/85 to-brand-800/80" />
                    </div>
                    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-sm font-semibold mb-6">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            Open Access
                        </div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Open Access Statement</h2>
                        <p className="mt-6 text-lg text-gray-200 leading-relaxed max-w-3xl mx-auto">
                            JGAIR is a fully open-access journal. All articles are published under the <strong className="text-white">Creative Commons Attribution 4.0 
                            International License (CC BY 4.0)</strong>, allowing unrestricted use, distribution, and reproduction in any medium, provided the original 
                            work is properly cited.
                        </p>
                        <div className="mt-8 grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                            {[
                                { val: 'Free to Read', sub: 'No subscription or paywall' },
                                { val: 'Free to Publish', sub: 'Zero article processing charges' },
                                { val: 'Free to Reuse', sub: 'CC BY 4.0 licence for all content' },
                            ].map(i => (
                                <div key={i.val} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                                    <p className="text-white font-bold text-sm">{i.val}</p>
                                    <p className="text-brand-300 text-xs mt-1">{i.sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Peer Review Policy ─────────────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Rigorous & Fair</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Double-Blind Peer Review Process</h2>
                            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
                                Every manuscript undergoes rigorous evaluation where author and reviewer identities remain concealed, ensuring impartial assessment based purely on scientific merit.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            {reviewSteps.slice(0, 4).map(s => (
                                <div key={s.num} className="relative bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-brand-50 rounded-bl-[40px] flex items-end justify-start pb-2 pl-2.5">
                                        <span className="text-brand-600 font-extrabold text-lg">{s.num}</span>
                                    </div>
                                    <span className="text-3xl mb-3 block">{s.icon}</span>
                                    <h3 className="text-sm font-bold text-gray-900 mt-1">{s.title}</h3>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">{s.desc}</p>
                                    <p className="text-xs text-brand-600 font-semibold mt-3">{s.time}</p>
                                </div>
                            ))}
                        </div>
                        <div className="grid sm:grid-cols-3 gap-5 mt-5">
                            {reviewSteps.slice(4).map(s => (
                                <div key={s.num} className="relative bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition group overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-brand-50 rounded-bl-[40px] flex items-end justify-start pb-2 pl-2.5">
                                        <span className="text-brand-600 font-extrabold text-lg">{s.num}</span>
                                    </div>
                                    <span className="text-3xl mb-3 block">{s.icon}</span>
                                    <h3 className="text-sm font-bold text-gray-900 mt-1">{s.title}</h3>
                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">{s.desc}</p>
                                    <p className="text-xs text-brand-600 font-semibold mt-3">{s.time}</p>
                                </div>
                            ))}
                        </div>

                        {/* Review image */}
                        <div className="mt-10 rounded-2xl overflow-hidden shadow-lg">
                            <img src={IMG.peerReview} alt="Peer review writing" className="w-full h-56 object-cover" loading="lazy" />
                        </div>
                    </div>
                </section>

                {/* ── Publication Details ────────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Key Facts</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Publication Details</h2>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {publicationFacts.map(item => (
                                <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4 hover:shadow-md transition">
                                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{item.label}</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Plagiarism & Ethics ────────────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-10">
                            {/* Plagiarism */}
                            <div className="relative rounded-2xl overflow-hidden">
                                <img src={IMG.plagiarism} alt="Code analysis" className="absolute inset-0 w-full h-full object-cover opacity-10" loading="lazy" />
                                <div className="relative bg-red-50/80 backdrop-blur-sm rounded-2xl border border-red-100 p-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                            </svg>
                                        </div>
                                        <h2 className="text-xl font-extrabold text-red-900">Plagiarism Policy</h2>
                                    </div>
                                    <p className="text-sm text-red-800 leading-relaxed">
                                        JGAIR maintains a <strong>zero-tolerance policy</strong> towards plagiarism. All submitted manuscripts are screened using 
                                        AI-powered plagiarism detection tools. Manuscripts with a similarity index exceeding <strong>15%</strong> (excluding 
                                        references and quotations) will be returned to authors for revision.
                                    </p>
                                    <p className="text-sm text-red-800 leading-relaxed mt-3">
                                        Cases of deliberate plagiarism will result in immediate rejection and may be reported to the authors' institutions 
                                        in accordance with COPE guidelines.
                                    </p>
                                </div>
                            </div>

                            {/* Ethics */}
                            <div className="relative rounded-2xl overflow-hidden">
                                <img src={IMG.ethics} alt="Research lab" className="absolute inset-0 w-full h-full object-cover opacity-10" loading="lazy" />
                                <div className="relative bg-brand-50/80 backdrop-blur-sm rounded-2xl border border-brand-100 p-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                            </svg>
                                        </div>
                                        <h2 className="text-xl font-extrabold text-brand-900">Publication Ethics</h2>
                                    </div>
                                    <p className="text-sm text-brand-800 leading-relaxed">
                                        JGAIR adheres to the guidelines established by the <strong>Committee on Publication Ethics (COPE)</strong>. Authors must 
                                        ensure their work is original, properly cited, and complies with ethical standards.
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm text-brand-800">
                                        {[
                                            'No fabrication, falsification, or data manipulation',
                                            'Proper disclosure of conflicts of interest',
                                            'Informed consent for human subjects research',
                                            'Ethical approval for animal studies',
                                            'Transparent reporting of funding sources',
                                        ].map(item => (
                                            <li key={item} className="flex items-start gap-2">
                                                <svg className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Copyright & Licensing ───────────────────── */}
                <section className="relative py-20 bg-gradient-to-br from-gray-900 via-brand-950 to-gray-900 overflow-hidden">
                    <div className="absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true">
                        <div className="absolute top-0 left-1/4 w-[28rem] h-[28rem] bg-brand-500 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 right-1/4 w-[28rem] h-[28rem] bg-emerald-500 rounded-full blur-3xl" />
                    </div>
                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-300 text-sm font-bold uppercase tracking-wider">Your Rights, Our Commitment</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">Copyright &amp; Licensing</h2>
                            <div className="w-12 h-1 bg-brand-400 rounded mx-auto mt-3" />
                            <p className="text-brand-200 mt-4 max-w-2xl mx-auto">
                                Two separate policies, one principle — authors keep their rights, and the world gets to reuse the work.
                            </p>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Copyright */}
                            <div className="relative bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 hover:bg-white/[0.08] transition duration-500">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/40">
                                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-brand-300 uppercase tracking-widest">Copyright Policy</p>
                                        <h3 className="text-2xl font-extrabold text-white leading-tight">Authors Keep Their Rights</h3>
                                    </div>
                                </div>
                                <p className="text-[15px] text-gray-200 leading-relaxed mb-6">
                                    Authors publishing in JGAIR <strong className="text-white">retain full copyright</strong> to
                                    their work. On acceptance, authors grant the journal a non-exclusive licence to publish,
                                    distribute, and archive the article — the copyright itself never leaves the author.
                                </p>
                                <ul className="space-y-3.5">
                                    {copyrightPoints.map(c => (
                                        <li key={c.t} className="flex items-start gap-3">
                                            <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-400/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <svg className="w-3.5 h-3.5 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                            </div>
                                            <span className="text-sm text-gray-200 leading-relaxed">
                                                <strong className="text-white">{c.t}</strong> {c.d}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Licensing */}
                            <div className="relative bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 hover:bg-white/[0.08] transition duration-500">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-13.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12h9M12 7.5v9" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest">Licensing Policy</p>
                                        <h3 className="text-2xl font-extrabold text-white leading-tight">CC BY 4.0 — Free to Reuse</h3>
                                    </div>
                                </div>
                                <p className="text-[15px] text-gray-200 leading-relaxed mb-6">
                                    Every article is published under the{' '}
                                    <strong className="text-white">Creative Commons Attribution 4.0 International License
                                    (CC BY 4.0)</strong> — the most permissive open-content licence, recommended by DOAJ,
                                    cOAlition&nbsp;S, and Plan&nbsp;S signatories.
                                </p>
                                <div className="grid grid-cols-2 gap-3 mb-5">
                                    {licenseGrants.map(l => (
                                        <div key={l.title} className="bg-white/10 rounded-xl p-3 border border-white/10 hover:bg-white/[0.15] transition">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg">{l.icon}</span>
                                                <p className="text-sm font-bold text-white">{l.title}</p>
                                            </div>
                                            <p className="text-xs text-gray-300 leading-relaxed">{l.desc}</p>
                                        </div>
                                    ))}
                                </div>
                                <a
                                    href="https://creativecommons.org/licenses/by/4.0/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 font-semibold no-underline group"
                                >
                                    Read the full CC BY 4.0 licence
                                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Indexing & Archiving ───────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Global Visibility</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Indexing &amp; Archiving</h2>
                            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                                JGAIR is indexed in leading international databases, ensuring maximum discoverability and citation tracking for your research.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {indexing.map(b => (
                                <div key={b.name} className={`rounded-2xl border p-5 text-center hover:shadow-md transition ${b.color}`}>
                                    <span className="font-extrabold text-2xl block">{b.name.charAt(0)}</span>
                                    <p className="text-sm font-bold mt-2">{b.name}</p>
                                    <p className="text-xs mt-0.5 opacity-70">{b.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CTA Banner ─────────────────────────────── */}
                <section className="py-16 bg-brand-600">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Ready to Contribute?</h2>
                        <p className="text-brand-200 text-lg mt-3 max-w-2xl mx-auto">
                            Join researchers from 50+ countries. Submit your manuscript today — it's free, fast, and fair.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <Link to="/author-login" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                                Submit Your Paper
                            </Link>
                            <Link to="/for-authors" className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]">
                                Author Guidelines
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default AboutPage;
