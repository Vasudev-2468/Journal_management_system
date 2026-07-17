import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';

/* ── Images ─────────────────────────────────────────────── */
const IMG = {
    hero: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1920&h=600&fit=crop&q=80',
    peerReview: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&h=500&fit=crop&q=80',
    ethics: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=400&fit=crop&q=80',
    writing: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&h=500&fit=crop&q=80',
    recognition: 'https://images.unsplash.com/photo-1523050854058-8df90110c7f1?w=800&h=400&fit=crop&q=80',
    confidential: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&h=400&fit=crop&q=80',
};

const HERO_VIDEO = 'https://videos.pexels.com/video-files/5198148/5198148-hd_1920_1080_30fps.mp4';

/* ── Purpose of Peer Review ─────────────────────────────── */
const purposes = [
    { goal: 'Quality', desc: 'Ensure technical correctness and methodological rigor in every published paper.', icon: '🎯', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { goal: 'Fairness', desc: 'No bias against negative results, replication studies, or unconventional ideas.', icon: '⚖️', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { goal: 'Constructiveness', desc: 'Help authors improve their manuscript with actionable feedback, even if rejected.', icon: '🛠️', color: 'bg-amber-50 border-amber-200 text-amber-700' },
];

/* ── Reviewer Responsibilities ──────────────────────────── */
const responsibilities = [
    { text: 'Accept only manuscripts within your expertise', do: true },
    { text: 'Decline if you have a conflict of interest (collaborator, competitor, same institution)', do: true },
    { text: 'Complete the review within the agreed timeline', do: true },
    { text: 'Provide specific, actionable feedback — not just "accept" or "reject"', do: true },
    { text: 'Maintain strict confidentiality — do not share the manuscript or review', do: true },
    { text: 'Do not use AI tools (ChatGPT, etc.) to write your review — this violates confidentiality', do: true },
];

/* ── Review Process Steps ───────────────────────────────── */
const processSteps = [
    { num: '01', title: 'Editor Assigns', desc: 'Editor assigns the manuscript to you based on AI-matched expertise.', icon: '📨', time: 'Day 0' },
    { num: '02', title: 'Invitation Email', desc: 'You receive an email with the abstract, keywords, and review deadline.', icon: '📧', time: 'Day 0' },
    { num: '03', title: 'Accept or Decline', desc: 'Click Accept or Decline within 3 days. Suggest alternates if declining.', icon: '✋', time: '3 days' },
    { num: '04', title: 'Download & Review', desc: 'Access the full blinded manuscript and complete the structured review form.', icon: '📄', time: '14–21 days' },
    { num: '05', title: 'Submit Review', desc: 'Submit your review with recommendation via the online system before deadline.', icon: '📝', time: 'Before deadline' },
    { num: '06', title: 'Editor Decision', desc: 'Editor makes final decision (accept/revise/reject) based on all reviews.', icon: '⚖️', time: '~1 day' },
];

/* ── Review Form Structure ──────────────────────────────── */
const recommendations = [
    { label: 'Accept as is', meaning: 'No revisions needed (rare)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { label: 'Minor revision', meaning: 'Small changes: typos, clarity, one missing reference', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { label: 'Major revision', meaning: 'Significant changes: new experiments, rewriting sections', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    { label: 'Reject', meaning: 'Fatal flaws: incorrect methodology, no novelty, unethical', color: 'bg-red-100 text-red-800 border-red-200' },
];

/* ── How to Write a Review (Do / Don't) ─────────────────── */
const doItems = [
    { advice: 'Start with a one-paragraph summary', example: '"This paper proposes a new attention mechanism for transformer models…"' },
    { advice: 'List major concerns first', example: '"The baseline comparison is incomplete. Model X from 2024 is missing."' },
    { advice: 'List minor concerns separately', example: '"Figure 3 is unclear. Please add error bars."' },
    { advice: 'Be specific with page/line numbers', example: '"Page 5, line 120: The equation seems incorrect."' },
    { advice: 'Suggest how to fix problems', example: '"Run an ablation study on parameter X to address this."' },
];

const dontItems = [
    { advice: '"This paper is boring"', reason: 'Subjective, not constructive' },
    { advice: '"I don\'t like the author\'s style"', reason: 'Personal bias' },
    { advice: 'No comments, just "Reject"', reason: 'Useless for authors and editor' },
    { advice: 'Ask for unnecessary experiments', reason: 'Delays publication without value' },
];

/* ── Ethical Violations ─────────────────────────────────── */
const ethicsViolations = [
    { violation: 'Use ideas from the manuscript', example: 'Submit your own paper based on unpublished work' },
    { violation: 'Share the manuscript', example: 'Email it to a student or colleague without editor permission' },
    { violation: 'Delay intentionally', example: 'Hold the paper to block competitor publication' },
    { violation: 'Be rude or insulting', example: '"The authors clearly don\'t understand basic math"' },
    { violation: 'Review using AI', example: 'ChatGPT or similar — this is a confidentiality breach' },
];

/* ── Timeline ───────────────────────────────────────────── */
const timeline = [
    { milestone: 'Accept/Decline decision', days: '3 days after invitation' },
    { milestone: 'Submit review', days: '14–21 days (varies by paper length)' },
    { milestone: 'Extension request', days: 'Contact editor before deadline' },
];

/* ══════════════════════════════════════════════════════════ */

const ForReviewersPage: React.FC = () => {
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
            <Header />

            {/* ── Hero ──────────────────────────────────────── */}
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
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">For Reviewers</h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto leading-relaxed font-light">
                        Guidelines, expectations, and best practices for peer reviewers — helping you deliver constructive, fair, and impactful reviews.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <a href="mailto:editorial@jgair-journal.org?subject=Reviewer Application" className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                            Become a Reviewer
                        </a>
                        <Link to="/editorial-board" className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]">
                            Meet Our Editors
                        </Link>
                    </div>
                </div>
            </section>

            <main className="flex-1">

                {/* ── Purpose of Peer Review ──────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            <div>
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Double-Blind Process</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Purpose of Peer Review</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />
                                <p className="text-[15px] text-gray-600 leading-relaxed mb-6">
                                    At JGAIR, peer review serves three core goals. We practice <strong className="text-gray-900">double-blind peer review</strong> — 
                                    reviewers do not know author identities, and authors do not know reviewer identities — ensuring impartial evaluation based solely on scientific merit.
                                </p>
                                <div className="space-y-3">
                                    {purposes.map(p => (
                                        <div key={p.goal} className={`flex items-start gap-4 rounded-xl border p-4 ${p.color}`}>
                                            <span className="text-2xl flex-shrink-0">{p.icon}</span>
                                            <div>
                                                <h3 className="text-sm font-bold">{p.goal}</h3>
                                                <p className="text-xs mt-0.5 opacity-80">{p.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-2xl overflow-hidden shadow-xl">
                                <img src={IMG.peerReview} alt="Peer review collaboration" className="w-full h-80 object-cover" loading="lazy" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Reviewer Responsibilities ───────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Your Commitment</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Reviewer Responsibilities</h2>
                            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                                As a reviewer, you agree to uphold these standards to maintain the integrity of the peer review process.
                            </p>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {responsibilities.map((r, idx) => (
                                <div key={idx} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition">
                                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm text-gray-700">{r.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Review Process Flowchart ────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Step by Step</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Peer Review Process</h2>
                            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
                                From invitation to editorial decision — here's what to expect at every stage.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {processSteps.map(s => (
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
                    </div>
                </section>

                {/* ── How to Write a Useful Review ────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Best Practices</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">How to Write a Useful Review</h2>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Do's */}
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-6">
                                <h3 className="text-lg font-extrabold text-emerald-900 flex items-center gap-2 mb-4">
                                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Do This ✅
                                </h3>
                                <div className="space-y-3">
                                    {doItems.map((d, i) => (
                                        <div key={i} className="bg-white/60 rounded-xl p-4 border border-emerald-100">
                                            <p className="text-sm font-bold text-emerald-900">{d.advice}</p>
                                            <p className="text-xs text-emerald-700 mt-1 italic">{d.example}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Don'ts */}
                            <div className="bg-red-50 rounded-2xl border border-red-100 p-6">
                                <h3 className="text-lg font-extrabold text-red-900 flex items-center gap-2 mb-4">
                                    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                    Don't Do This ❌
                                </h3>
                                <div className="space-y-3">
                                    {dontItems.map((d, i) => (
                                        <div key={i} className="bg-white/60 rounded-xl p-4 border border-red-100">
                                            <p className="text-sm font-bold text-red-900">{d.advice}</p>
                                            <p className="text-xs text-red-700 mt-1">{d.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 rounded-2xl overflow-hidden shadow-lg">
                            <img src={IMG.writing} alt="Academic writing and review" className="w-full h-48 object-cover" loading="lazy" />
                        </div>
                    </div>
                </section>

                {/* ── Review Structure & Recommendations ──── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid lg:grid-cols-2 gap-12 items-start">
                            <div>
                                <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Review Form</span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Review Structure &amp; Template</h2>
                                <div className="w-12 h-1 bg-brand-600 rounded mt-3 mb-6" />

                                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Section A: Recommendation</h3>
                                <div className="space-y-2 mb-6">
                                    {recommendations.map(r => (
                                        <div key={r.label} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${r.color}`}>
                                            <span className="text-sm font-bold">{r.label}</span>
                                            <span className="text-xs">{r.meaning}</span>
                                        </div>
                                    ))}
                                </div>

                                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Section B: Confidential Comments to Editor</h3>
                                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-6">
                                    <ul className="space-y-1.5 text-xs text-gray-600">
                                        <li>• Suspected plagiarism or data fabrication</li>
                                        <li>• Conflicts of interest not declared</li>
                                        <li>• Whether you are qualified to judge certain parts</li>
                                    </ul>
                                </div>

                                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Section C: Comments to Authors</h3>
                                <div className="bg-brand-50 rounded-xl border border-brand-100 p-4">
                                    <ul className="space-y-2 text-xs text-brand-800">
                                        <li><strong>Summary</strong> — What does the paper claim? Is it novel?</li>
                                        <li><strong>Major Concerns</strong> — Numbered list of critical issues</li>
                                        <li><strong>Minor Concerns</strong> — Numbered list of small fixes</li>
                                        <li><strong>Suggestions</strong> — Optional constructive ideas</li>
                                        <li><strong>Overall Assessment</strong> — Final summary statement</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Scoring criteria */}
                                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Scoring Criteria (1–10 Scale)</h3>
                                    <div className="space-y-3">
                                        {[
                                            { criteria: 'Originality', desc: 'Novelty and uniqueness of contribution', pct: 85 },
                                            { criteria: 'Technical Quality', desc: 'Soundness of methodology and analysis', pct: 90 },
                                            { criteria: 'Significance', desc: 'Importance and relevance of research question', pct: 75 },
                                            { criteria: 'Clarity', desc: 'Quality of writing and presentation', pct: 80 },
                                            { criteria: 'References', desc: 'Adequacy and recency of cited literature', pct: 70 },
                                        ].map(c => (
                                            <div key={c.criteria}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-gray-900">{c.criteria}</span>
                                                    <span className="text-xs text-gray-400">{c.desc}</span>
                                                </div>
                                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${c.pct}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl overflow-hidden shadow-xl">
                                    <img src={IMG.confidential} alt="Confidential review process" className="w-full h-48 object-cover" loading="lazy" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Ethical Guidelines ──────────────────── */}
                <section className="relative py-20 overflow-hidden">
                    <div className="absolute inset-0">
                        <img src={IMG.ethics} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-red-950/90 via-red-900/85 to-red-800/80" />
                    </div>
                    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-extrabold text-white tracking-tight">Ethical Guidelines for Reviewers</h2>
                            <p className="text-red-200 mt-3 max-w-2xl mx-auto">
                                Violations of reviewer ethics are taken seriously. If you suspect plagiarism, data fabrication, or dual submission, 
                                report immediately to <strong className="text-white">editor@jgair-journal.org</strong>.
                            </p>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {ethicsViolations.map(v => (
                                <div key={v.violation} className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                        <h3 className="text-sm font-bold text-white">{v.violation}</h3>
                                    </div>
                                    <p className="text-xs text-red-200">{v.example}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Confidentiality & Timeline ──────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid sm:grid-cols-2 gap-8">
                            {/* Confidentiality */}
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                        </svg>
                                    </div>
                                    <h2 className="text-lg font-extrabold text-gray-900">Confidentiality</h2>
                                </div>
                                <ul className="space-y-2 text-sm text-gray-600">
                                    {[
                                        'The manuscript is confidential until published',
                                        'Do not discuss the paper with anyone outside the editorial team',
                                        'Do not post any part of the manuscript online',
                                        'Destroy all copies after submitting your review',
                                    ].map(item => (
                                        <li key={item} className="flex items-start gap-2">
                                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                            </svg>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Timeline & Deadlines */}
                            <div className="bg-brand-50 rounded-2xl border border-brand-100 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-brand-200 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h2 className="text-lg font-extrabold text-brand-900">Timeline &amp; Deadlines</h2>
                                </div>
                                <div className="space-y-3">
                                    {timeline.map(t => (
                                        <div key={t.milestone} className="bg-white/60 rounded-xl border border-brand-100 p-4 flex items-center justify-between">
                                            <span className="text-sm font-semibold text-brand-900">{t.milestone}</span>
                                            <span className="text-xs font-bold text-brand-600 bg-brand-100 px-3 py-1 rounded-full">{t.days}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-brand-700 mt-4 leading-relaxed">
                                    We prefer an honest extension request over a rushed or missing review. Contact the editor before the deadline if you need more time.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Reviewer Recognition ────────────────── */}
                <section className="relative py-20 overflow-hidden">
                    <div className="absolute inset-0">
                        <img src={IMG.recognition} alt="" className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-900/85 to-brand-800/80" />
                    </div>
                    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-extrabold text-white tracking-tight">Reviewer Recognition</h2>
                            <p className="text-brand-200 mt-3 max-w-2xl mx-auto">
                                Your contribution to scientific quality deserves acknowledgment. Here's how we recognize our reviewers.
                            </p>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { title: 'Annual Certificates', desc: 'Official reviewer recognition certificates for all completed reviews.', icon: '🏆' },
                                { title: 'Top Reviewer Awards', desc: 'Annual awards for reviewers with exceptional quality and timeliness.', icon: '⭐' },
                                { title: 'Publons Integration', desc: 'Verified review records on Publons / Web of Science Reviewer Profile.', icon: '📊' },
                                { title: 'Editorial Board Path', desc: 'Consistent, high-quality reviewers are considered for editorial board positions.', icon: '🎓' },
                            ].map(r => (
                                <div key={r.title} className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/15 p-5 text-center">
                                    <span className="text-3xl block mb-3">{r.icon}</span>
                                    <h3 className="text-sm font-bold text-white">{r.title}</h3>
                                    <p className="text-xs text-brand-200 mt-1.5">{r.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CTA Banner ──────────────────────────── */}
                <section className="py-16 bg-brand-600">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Ready to Review?</h2>
                        <p className="text-brand-200 text-lg mt-3 max-w-2xl mx-auto">
                            Join our global network of expert reviewers. Your expertise helps advance AI &amp; computing research worldwide.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <a href="mailto:editorial@jgair-journal.org?subject=Reviewer Application" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                                Apply as Reviewer
                            </a>
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

export default ForReviewersPage;
