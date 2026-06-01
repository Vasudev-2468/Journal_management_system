import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';

/* ── Images (Unsplash — free licence) ───────────────────── */
const IMG = {
    hero: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1920&h=600&fit=crop&q=80',
    writing: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=500&fit=crop&q=80',
    research: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800&h=500&fit=crop&q=80',
    ethics: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=400&fit=crop&q=80',
    template: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800&h=500&fit=crop&q=80',
    review: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop&q=80',
    openAccess: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&h=400&fit=crop&q=80',
};

const HERO_VIDEO = 'https://videos.pexels.com/video-files/6774217/6774217-hd_1920_1080_30fps.mp4';

/* ── Manuscript structure sections ──────────────────────── */
const manuscriptSections = [
    { title: 'Title & Authors', desc: 'Concise title (max 12 words), author names with affiliations, ORCID iDs, and corresponding author email.', icon: '📝' },
    { title: 'Abstract & Keywords', desc: '100–250 words, self-explanatory. Provide 5–7 keywords for indexing. Avoid references and abbreviations.', icon: '📋' },
    { title: 'Introduction', desc: 'Background, problem statement, relevant literature, proposed approach, and research innovation (3–6 paragraphs).', icon: '🔬' },
    { title: 'Method', desc: 'Research design, procedures, algorithms, pseudocode, data acquisition. Chronological order with references.', icon: '⚙️' },
    { title: 'Results & Discussion', desc: 'Present findings with figures, graphs, and tables. Comprehensive analysis with sub-sections as needed.', icon: '📊' },
    { title: 'Conclusion', desc: 'Summarize key findings, compatibility with introduction goals, and future research prospects.', icon: '✅' },
];

/* ── Formatting requirements ────────────────────────────── */
const formatRules = [
    { label: 'Paper Size', value: 'A4 (quarto)' },
    { label: 'Font', value: 'Times New Roman, 10pt' },
    { label: 'Spacing', value: 'Single space' },
    { label: 'Margins', value: 'Left/Top: 2.5cm — Right/Bottom: 2cm' },
    { label: 'Max Pages', value: '12 pages (research) / 16 pages (review)' },
    { label: 'Citation Style', value: 'IEEE numbered format' },
    { label: 'Figures & Tables', value: 'Centered, with numbered captions' },
    { label: 'Equations', value: 'Centered, numbered in parentheses (right-aligned)' },
    { label: 'References Font', value: '8pt for each reference item' },
    { label: 'Language', value: 'English — foreign terms in italics' },
];

/* ── Submission checklist items ─────────────────────────── */
const checklist = [
    'Manuscript is original and not published or submitted elsewhere',
    'All authors have agreed to submission with correct affiliations',
    'Abstract is 100–250 words with 5–7 keywords',
    'Manuscript follows IEEE-style formatting (Times New Roman, 10pt, single space)',
    'All figures and tables are centered with numbered captions',
    'References are complete in IEEE numbered format',
    'Author identities removed from manuscript (double-blind review)',
    'Cover letter addressing the editor is prepared',
    'Ethical approval obtained (if applicable)',
    'Data availability statement included',
    'Author Contributions Statement (CRediT taxonomy) included',
    'Funding Information section included',
];

/* ── Workflow steps ─────────────────────────────────────── */
const workflow = [
    { step: '01', title: 'Submit Online', desc: 'Upload your manuscript through our submission portal with metadata and supplementary files.', time: 'Day 0', color: 'bg-brand-600' },
    { step: '02', title: 'Editorial Screening', desc: 'Editor checks scope, ethics, and formatting compliance within 48 hours.', time: '~2 days', color: 'bg-blue-600' },
    { step: '03', title: 'AI Plagiarism Check', desc: 'Automated similarity detection. Manuscripts >15% similarity index flagged.', time: '~1 day', color: 'bg-purple-600' },
    { step: '04', title: 'Peer Review', desc: 'Double-blind evaluation by 2–3 AI-matched expert reviewers.', time: '~10 days', color: 'bg-amber-600' },
    { step: '05', title: 'Decision', desc: 'Accept, minor/major revision, or reject based on reviewer consensus.', time: '~1 day', color: 'bg-emerald-600' },
    { step: '06', title: 'Publication', desc: 'Copyediting, DOI assignment, and open-access online publication.', time: '~5 days', color: 'bg-red-500' },
];

/* ── FAQs ───────────────────────────────────────────────── */
const faqs = [
    { q: 'Is there an article processing charge (APC)?', a: 'No. IJACR is completely free to publish. There are no submission fees, review fees, or publication charges.' },
    { q: 'How long does the review process take?', a: 'Average time to first decision is ~10 days. From submission to publication, the typical timeline is 20–30 days.' },
    { q: 'Can I submit a preprint?', a: 'Yes. We accept manuscripts previously posted on recognized preprint servers (arXiv, SSRN). Please disclose this during submission.' },
    { q: 'What file formats are accepted?', a: 'Submit as PDF initially. Upon acceptance, we request source files (.docx or .tex). Download our official Word template from this page.' },
    { q: 'What citation style should I use?', a: 'IEEE numbered citation style. Use reference numbers in square brackets [1], [2] throughout the text.' },
    { q: 'How many authors can be listed?', a: 'At least two authors recommended. One must be the corresponding author responsible for all communication.' },
    { q: 'What is the similarity threshold for plagiarism?', a: 'Manuscripts with >15% similarity (excluding references and quotations) will be returned for revision.' },
    { q: 'Do you support supplementary materials?', a: 'Yes. Datasets, code repositories, and supplementary figures can be submitted alongside the manuscript.' },
];

/* ══════════════════════════════════════════════════════════ */

const ForAuthorsPage: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.src = HERO_VIDEO;
        v.load();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            {/* ── Hero with video background ────────────── */}
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
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">For Authors</h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto leading-relaxed font-light">
                        Everything you need to prepare, format, submit, and track your manuscript — from template to publication.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <a
                            href="/IJACR_Manuscript_Template.docx"
                            download="IJACR_Manuscript_Template.docx"
                            className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download Word Template
                        </a>
                        <Link to="/author-login" className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]">
                            Submit Your Paper
                        </Link>
                    </div>
                </div>
            </section>

            <main className="flex-1">

                {/* ── Quick Stats Bar ─────────────────────── */}
                <section className="bg-white border-b border-gray-100">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                            {[
                                { val: '~10 Days', label: 'First Decision' },
                                { val: 'Free', label: 'No APC Charges' },
                                { val: 'CC BY 4.0', label: 'Open Access' },
                                { val: 'IEEE Style', label: 'Citation Format' },
                            ].map(s => (
                                <div key={s.label}>
                                    <p className="text-2xl font-extrabold text-brand-600">{s.val}</p>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Manuscript Structure (IMRaD) ────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-start">
                            <div>
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">IMRaD Format</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Manuscript Structure</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <p className="text-[15px] text-gray-600 leading-relaxed mb-6">
                                    Follow the standard IMRaD structure. Each section should be clearly headed and numbered consecutively.
                                    The title should be concise (max 12 words) and avoid acronyms or waste words like "A study of..." or "Analysis of...".
                                </p>
                                <div className="space-y-3">
                                    {manuscriptSections.map(s => (
                                        <div key={s.title} className="flex items-start gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-md transition">
                                            <span className="text-2xl flex-shrink-0 mt-0.5">{s.icon}</span>
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">{s.title}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="rounded-2xl overflow-hidden shadow-xl">
                                    <img src={IMG.writing} alt="Academic writing" className="w-full h-64 object-cover" loading="lazy" />
                                </div>
                                {/* Additional required sections */}
                                <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
                                    <h3 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                                        </svg>
                                        Mandatory Sections (after Conclusion)
                                    </h3>
                                    <ul className="space-y-2 text-xs text-amber-800">
                                        {[
                                            'Acknowledgments — individuals who assisted but are not co-authors (consent required)',
                                            'Funding Information — grant numbers or "Authors state no funding involved"',
                                            'Author Contributions — CRediT taxonomy roles for each author',
                                        ].map(item => (
                                            <li key={item} className="flex items-start gap-2">
                                                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

                {/* ── Formatting Requirements ─────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div className="order-2 lg:order-1">
                                <div className="rounded-2xl overflow-hidden shadow-xl">
                                    <img src={IMG.template} alt="Document template" className="w-full h-72 object-cover" loading="lazy" />
                                </div>
                            </div>
                            <div className="order-1 lg:order-2">
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Formatting</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Formatting Requirements</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <div className="grid grid-cols-1 gap-2">
                                    {formatRules.map(r => (
                                        <div key={r.label} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3 hover:shadow-sm transition">
                                            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{r.label}</span>
                                            <span className="text-sm font-bold text-gray-900">{r.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Template Download Banner ────────────── */}
                <section className="relative py-20 overflow-hidden">
                    <div className="absolute inset-0">
                        <img src={IMG.research} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/85 to-brand-800/80" />
                    </div>
                    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/90 text-sm font-semibold mb-6">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            Official Template
                        </div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Download the Manuscript Template</h2>
                        <p className="mt-4 text-lg text-gray-200 leading-relaxed max-w-2xl mx-auto">
                            Use our pre-formatted Word template with all required styles, margins, fonts, and section headings already configured.
                            Submit with confidence — your paper will be perfectly formatted from the start.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <a
                                href="/IJACR_Manuscript_Template.docx"
                                download="IJACR_Manuscript_Template.docx"
                                className="inline-flex items-center gap-3 px-8 py-4 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-xl no-underline text-[15px] group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-blue-600 font-extrabold text-lg">W</span>
                                </div>
                                <div className="text-left">
                                    <span className="block">IJACR_Manuscript_Template.docx</span>
                                    <span className="block text-xs text-gray-500 font-normal">Microsoft Word • ~603 KB • One-click download</span>
                                </div>
                                <svg className="w-5 h-5 text-brand-600 group-hover:translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </a>
                        </div>
                        <p className="mt-4 text-xs text-gray-400">
                            A4 format • Times New Roman 10pt • Single spacing • IEEE citation style pre-configured
                        </p>
                    </div>
                </section>

                {/* ── Article Processing Workflow ─────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">From Submission to Publication</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Article Processing Workflow</h2>
                            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
                                Our AI-powered editorial workflow ensures rapid, fair, and transparent peer review — average time to first decision is just 10 days.
                            </p>
                        </div>

                        {/* Desktop: horizontal timeline */}
                        <div className="hidden lg:block relative">
                            <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-200" />
                            <div className="grid grid-cols-6 gap-4">
                                {workflow.map((w) => (
                                    <div key={w.step} className="relative text-center">
                                        <div className={`w-16 h-16 ${w.color} rounded-2xl flex items-center justify-center mx-auto shadow-lg relative z-10`}>
                                            <span className="text-white font-extrabold text-lg">{w.step}</span>
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 mt-4">{w.title}</h3>
                                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{w.desc}</p>
                                        <p className="text-xs text-brand-600 font-bold mt-2">{w.time}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Mobile: vertical cards */}
                        <div className="lg:hidden space-y-4">
                            {workflow.map((w) => (
                                <div key={w.step} className="flex items-start gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className={`w-12 h-12 ${w.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                        <span className="text-white font-extrabold text-sm">{w.step}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">{w.title}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{w.desc}</p>
                                        <p className="text-xs text-brand-600 font-bold mt-1">{w.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Workflow image */}
                        <div className="mt-10 rounded-2xl overflow-hidden shadow-lg">
                            <img src={IMG.review} alt="AI-powered review process" className="w-full h-48 object-cover" loading="lazy" />
                        </div>
                    </div>
                </section>

                {/* ── Submission Checklist ─────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Before You Submit</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Submission Checklist</h2>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {checklist.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition">
                                    <div className="w-6 h-6 rounded-md bg-brand-50 border border-brand-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="text-brand-600 text-xs font-bold">{idx + 1}</span>
                                    </div>
                                    <p className="text-sm text-gray-600">{item}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Ethics & Copyright side-by-side ─────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Publication Ethics */}
                            <div className="relative rounded-2xl overflow-hidden">
                                <img src={IMG.ethics} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" loading="lazy" />
                                <div className="relative bg-red-50/80 backdrop-blur-sm rounded-2xl border border-red-100 p-8 h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                                            </svg>
                                        </div>
                                        <h2 className="text-xl font-extrabold text-red-900">Publication Ethics</h2>
                                    </div>
                                    <p className="text-sm text-red-800 leading-relaxed">
                                        IJACR adheres to <strong>COPE guidelines</strong>. Authors must ensure their work is original, properly cited, and ethically compliant.
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm text-red-800">
                                        {[
                                            'No fabrication, falsification, or plagiarism',
                                            'Duplicate submission is strictly prohibited',
                                            'Proper disclosure of conflicts of interest',
                                            'Manuscripts with >15% similarity returned for revision',
                                        ].map(item => (
                                            <li key={item} className="flex items-start gap-2">
                                                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                                                </svg>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Copyright & Licensing */}
                            <div className="relative rounded-2xl overflow-hidden">
                                <img src={IMG.openAccess} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" loading="lazy" />
                                <div className="relative bg-emerald-50/80 backdrop-blur-sm rounded-2xl border border-emerald-100 p-8 h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                            </svg>
                                        </div>
                                        <h2 className="text-xl font-extrabold text-emerald-900">Copyright &amp; Licensing</h2>
                                    </div>
                                    <p className="text-sm text-emerald-800 leading-relaxed">
                                        All articles published under the <strong>Creative Commons Attribution 4.0 International License (CC BY 4.0)</strong>.
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm text-emerald-800">
                                        {[
                                            'Authors retain copyright of their work',
                                            'Readers may share, copy, and adapt freely',
                                            'Original work must be properly cited',
                                            'No article processing charges (APC)',
                                        ].map(item => (
                                            <li key={item} className="flex items-start gap-2">
                                                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

                {/* ── FAQs ────────────────────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Common Questions</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">FAQs for Authors</h2>
                        </div>
                        <div className="space-y-3">
                            {faqs.map((faq, idx) => (
                                <div key={idx} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition">
                                    <button
                                        onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                                        className="w-full px-6 py-4 text-left flex items-center justify-between gap-4"
                                    >
                                        <span className="text-sm font-bold text-gray-900">{faq.q}</span>
                                        <svg
                                            className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${openFaq === idx ? 'rotate-180' : ''}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </button>
                                    {openFaq === idx && (
                                        <div className="px-6 pb-4">
                                            <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CTA Banner ──────────────────────────── */}
                <section className="py-16 bg-brand-600">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Ready to Submit Your Research?</h2>
                        <p className="text-brand-200 text-lg mt-3 max-w-2xl mx-auto">
                            Join researchers from 50+ countries. Free to publish, rapid peer review, global visibility.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <Link to="/author-login" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                                Submit Your Paper
                            </Link>
                            <a
                                href="/IJACR_Manuscript_Template.docx"
                                download="IJACR_Manuscript_Template.docx"
                                className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download Template
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
};

export default ForAuthorsPage;
