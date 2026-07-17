import React, { useRef, useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';

/* ── Images (Unsplash — free licence) ───────────────────── */
const IMG = {
    hero: 'https://images.unsplash.com/photo-1523050854058-8df90110c7f1?w=1920&h=600&fit=crop&q=80',
    eic: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&q=80',
    photos: [
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&q=80',
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&q=80',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&q=80',
    ],
    advisory: [
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&q=80',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&q=80',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&q=80',
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&q=80',
    ],
};

const HERO_VIDEO = 'https://videos.pexels.com/video-files/3255275/3255275-hd_1920_1080_25fps.mp4';

/* ── Data ────────────────────────────────────────────────── */

interface BoardMember {
    name: string;
    role: string;
    affiliation: string;
    country: string;
    expertise: string[];
    email: string;
    orcid: string;
    scholar?: string;
    photo: string;
    bio: string;
    cvAvailable: boolean;
}

const editorInChief: BoardMember = {
    name: 'Prof. Dr. A. Rajendran',
    role: 'Editor-in-Chief',
    affiliation: 'Department of Computer Science, Stanford University',
    country: 'USA',
    expertise: ['Machine Learning', 'Neural Architecture Search', 'AI Systems'],
    email: 'editor@jgair-journal.org',
    orcid: '0000-0001-2345-6789',
    scholar: 'https://scholar.google.com',
    photo: IMG.eic,
    bio: 'Leading researcher with 25+ years in ML/AI. Published 200+ papers, h-index 78. Previously at Google Brain and MIT CSAIL. Editor for IEEE TPAMI and NeurIPS area chair.',
    cvAvailable: true,
};

const associateEditors: BoardMember[] = [
    {
        name: 'Prof. Dr. Maria Santos',
        role: 'Associate Editor',
        affiliation: 'Faculty of Engineering, ETH Zurich',
        country: 'Switzerland',
        expertise: ['Computer Vision', '3D Reconstruction', 'Medical Imaging'],
        email: 'santos@jgair-journal.org',
        orcid: '0000-0002-3456-7890',
        photo: IMG.photos[0],
        bio: 'Pioneer in medical image analysis using deep learning. 120+ publications, recipient of the ECCV Best Paper Award 2023.',
        cvAvailable: true,
    },
    {
        name: 'Prof. Dr. Wei Zhang',
        role: 'Associate Editor',
        affiliation: 'School of AI, Tsinghua University',
        country: 'China',
        expertise: ['NLP', 'Large Language Models', 'Dialogue Systems'],
        email: 'zhang@jgair-journal.org',
        orcid: '0000-0003-4567-8901',
        photo: IMG.photos[1],
        bio: 'Expert in transformer architectures and multilingual NLP. Core contributor to open-source LLM projects. ACL Fellow.',
        cvAvailable: true,
    },
    {
        name: 'Prof. Dr. Sarah Mitchell',
        role: 'Associate Editor',
        affiliation: 'Department of Data Science, University of Oxford',
        country: 'UK',
        expertise: ['Reinforcement Learning', 'Robotics', 'Autonomous Agents'],
        email: 'mitchell@jgair-journal.org',
        orcid: '0000-0004-5678-9012',
        photo: IMG.photos[2],
        bio: 'Focuses on safe RL for real-world deployment. Advisor to UK AI Safety Institute. 80+ peer-reviewed articles.',
        cvAvailable: true,
    },
    {
        name: 'Prof. Dr. Kenji Tanaka',
        role: 'Associate Editor',
        affiliation: 'Graduate School of Informatics, University of Tokyo',
        country: 'Japan',
        expertise: ['Edge AI', 'IoT Intelligence', 'Embedded ML'],
        email: 'tanaka@jgair-journal.org',
        orcid: '0000-0005-6789-0123',
        photo: IMG.photos[3],
        bio: 'Specialises in on-device inference and TinyML. Holds 15 patents. IEEE Senior Member and JST CREST PI.',
        cvAvailable: true,
    },
];

interface AdvisoryMember {
    name: string;
    affiliation: string;
    country: string;
    expertise: string;
    photo: string;
}

const advisoryBoard: AdvisoryMember[] = [
    { name: 'Prof. Dr. Elena Voronova', affiliation: 'Moscow Institute of Physics and Technology', country: 'Russia', expertise: 'Quantum ML, Optimization', photo: IMG.advisory[0] },
    { name: 'Prof. Dr. James Okonkwo', affiliation: 'University of Lagos', country: 'Nigeria', expertise: 'AI for Development, NLP for African Languages', photo: IMG.advisory[1] },
    { name: 'Prof. Dr. Priya Sharma', affiliation: 'IIT Bombay', country: 'India', expertise: 'Federated Learning, Privacy-Preserving ML', photo: IMG.advisory[2] },
    { name: 'Prof. Dr. Carlos Fernandez', affiliation: 'Universidad Politécnica de Madrid', country: 'Spain', expertise: 'Explainable AI, Trustworthy AI', photo: IMG.advisory[3] },
    { name: 'Prof. Dr. Aisha Al-Rashid', affiliation: 'King Abdullah University', country: 'Saudi Arabia', expertise: 'Generative Models, Multimodal Learning', photo: IMG.advisory[4] },
    { name: 'Prof. Dr. Henrik Johansson', affiliation: 'KTH Royal Institute of Technology', country: 'Sweden', expertise: 'AI Safety, Alignment, Formal Verification', photo: IMG.advisory[5] },
];

const sectionEditors = [
    { name: 'Dr. Liang Chen', section: 'Machine Learning', affiliation: 'UC Berkeley, USA' },
    { name: 'Dr. Fatima Noor', section: 'Computer Vision', affiliation: 'KAUST, Saudi Arabia' },
    { name: 'Dr. Marco Rossi', section: 'NLP & Language Models', affiliation: 'Sapienza University, Italy' },
    { name: 'Dr. Akiko Yamada', section: 'Robotics & Autonomous Systems', affiliation: 'NAIST, Japan' },
];

/* ── CV Request Modal ───────────────────────────────────── */

const CVRequestModal: React.FC<{
    member: BoardMember;
    onClose: () => void;
}> = ({ member, onClose }) => {
    const [form, setForm] = useState({ name: '', email: '', reason: '' });
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('sending');

        try {
            const res = await fetch(
                `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/editorial/cv-request`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        member_name: member.name,
                        member_email: member.email,
                        requester_name: form.name,
                        requester_email: form.email,
                        reason: form.reason,
                    }),
                },
            );
            if (res.ok) setStatus('sent');
            else setStatus('error');
        } catch {
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-brand-600 p-6">
                    <h3 className="text-lg font-bold text-white">Request CV Access</h3>
                    <p className="text-brand-200 text-sm mt-1">
                        Request to view <strong className="text-white">{member.name}</strong>'s resume
                    </p>
                </div>

                {status === 'sent' ? (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h4 className="font-bold text-gray-900 text-lg">Request Submitted</h4>
                        <p className="text-sm text-gray-500 mt-2">
                            An authentication email has been sent to the editor. You will receive the CV via email once approved.
                        </p>
                        <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition">
                            Close
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Your Full Name</label>
                            <input
                                type="text" required
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Dr. Jane Doe"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Your Email</label>
                            <input
                                type="email" required
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="jane.doe@university.edu"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for Request</label>
                            <textarea
                                required rows={3}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                                value={form.reason}
                                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                placeholder="I would like to review the editor's qualifications for a potential collaboration..."
                            />
                        </div>
                        {status === 'error' && (
                            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                                Something went wrong. Please try again or email editorial@jgair-journal.org directly.
                            </p>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={status === 'sending'}
                                className="flex-1 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-60"
                            >
                                {status === 'sending' ? 'Sending...' : 'Submit Request'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 text-center">
                            Your request will be reviewed by the editorial office. An authentication email will be sent for approval.
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════ */

const EditorialBoardPage: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [cvModal, setCvModal] = useState<BoardMember | null>(null);

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
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">Editorial Board</h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto leading-relaxed font-light">
                        Distinguished researchers and practitioners from world-leading institutions, dedicated to advancing AI &amp; computing research.
                    </p>
                    {/* Country badges */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {['USA', 'Switzerland', 'China', 'UK', 'Japan', 'India', 'Spain', 'Sweden', 'Saudi Arabia', 'Nigeria', 'Russia', 'Italy'].map(c => (
                            <span key={c} className="px-3 py-1 bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-xs font-medium rounded-full">
                                {c}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            <main className="flex-1">

                {/* ── Editor-in-Chief ─────────────────────────── */}
                <section className="py-16 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Leadership</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Editor-in-Chief</h2>
                        </div>

                        <div className="max-w-3xl mx-auto bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-100 overflow-hidden shadow-lg">
                            <div className="flex flex-col sm:flex-row">
                                <div className="sm:w-56 flex-shrink-0">
                                    <img src={editorInChief.photo} alt={editorInChief.name} className="w-full h-56 sm:h-full object-cover" loading="lazy" />
                                </div>
                                <div className="p-6 sm:p-8 flex-1">
                                    <h3 className="text-xl font-extrabold text-gray-900">{editorInChief.name}</h3>
                                    <p className="text-brand-600 font-semibold text-sm mt-0.5">{editorInChief.role}</p>
                                    <p className="text-sm text-gray-500 mt-1">{editorInChief.affiliation}, {editorInChief.country}</p>
                                    <p className="text-sm text-gray-600 mt-3 leading-relaxed">{editorInChief.bio}</p>

                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {editorInChief.expertise.map(e => (
                                            <span key={e} className="px-2.5 py-0.5 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">{e}</span>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 mt-4 text-xs">
                                        <a href={`https://orcid.org/${editorInChief.orcid}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 font-semibold no-underline flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm-.6 4.8c.6 0 1.08.48 1.08 1.08s-.48 1.08-1.08 1.08-1.08-.48-1.08-1.08S10.8 4.8 11.4 4.8zm-1.2 3.6h2.4v10.8h-2.4V8.4z" /></svg>
                                            ORCID
                                        </a>
                                        {editorInChief.scholar && (
                                            <a href={editorInChief.scholar} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 font-semibold no-underline">
                                                Google Scholar
                                            </a>
                                        )}
                                        <a href={`mailto:${editorInChief.email}`} className="text-brand-600 hover:text-brand-700 font-semibold no-underline">{editorInChief.email}</a>
                                    </div>

                                    {editorInChief.cvAvailable && (
                                        <button
                                            onClick={() => setCvModal(editorInChief)}
                                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            Request CV / Resume
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Associate Editors ────────────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Core Team</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Associate Editors</h2>
                            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                                Our associate editors manage peer review across key AI sub-disciplines, ensuring rigorous and timely evaluation of every manuscript.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {associateEditors.map(m => (
                                <div key={m.name} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow group">
                                    <div className="flex">
                                        <div className="w-32 flex-shrink-0 overflow-hidden">
                                            <img src={m.photo} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                        </div>
                                        <div className="p-5 flex-1">
                                            <h3 className="font-bold text-gray-900 text-[15px]">{m.name}</h3>
                                            <p className="text-brand-600 text-xs font-semibold mt-0.5">{m.role}</p>
                                            <p className="text-xs text-gray-500 mt-1">{m.affiliation}, {m.country}</p>
                                            <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">{m.bio}</p>

                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {m.expertise.map(e => (
                                                    <span key={e} className="px-2 py-0.5 bg-brand-50 border border-brand-100 text-brand-600 text-[10px] font-semibold rounded-full">{e}</span>
                                                ))}
                                            </div>

                                            <div className="flex items-center gap-3 mt-3 text-[11px]">
                                                <a href={`https://orcid.org/${m.orcid}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 font-semibold no-underline">ORCID</a>
                                                <a href={`mailto:${m.email}`} className="text-brand-600 hover:text-brand-700 font-semibold no-underline">{m.email}</a>
                                            </div>

                                            {m.cvAvailable && (
                                                <button
                                                    onClick={() => setCvModal(m)}
                                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-lg hover:bg-brand-50 hover:text-brand-700 transition"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                    Request CV
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Section Editors ──────────────────────────── */}
                <section className="py-12 bg-white">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-8">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Subject Expertise</span>
                            <h2 className="text-2xl font-extrabold text-gray-900 mt-2 tracking-tight">Section Editors</h2>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {sectionEditors.map(s => (
                                <div key={s.name} className="bg-gray-50 rounded-xl border border-gray-100 p-5 text-center hover:shadow-md transition">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                                        </svg>
                                    </div>
                                    <p className="text-xs text-brand-600 font-bold uppercase tracking-wider">{s.section}</p>
                                    <h3 className="font-bold text-gray-900 text-sm mt-1">{s.name}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">{s.affiliation}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Editorial Advisory Board ─────────────────── */}
                <section className="py-16 bg-gray-50">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-10">
                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">Senior Experts</span>
                            <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">Editorial Advisory Board</h2>
                            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
                                Distinguished senior researchers providing strategic guidance and ensuring the journal's global academic standing.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {advisoryBoard.map(m => (
                                <div key={m.name} className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4 hover:shadow-md transition">
                                    <img src={m.photo} alt={m.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-brand-100" loading="lazy" />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold text-gray-900">{m.name}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{m.affiliation}, {m.country}</p>
                                        <p className="text-xs text-brand-600 mt-1 font-medium">{m.expertise}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Managing Editor & Contact ────────────────── */}
                <section className="py-12 bg-white">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid sm:grid-cols-2 gap-6">
                            {/* Managing Editor */}
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">Managing Editor</h3>
                                        <p className="text-xs text-gray-500">Administrative & Coordination</p>
                                    </div>
                                </div>
                                <p className="text-sm font-semibold text-gray-900">Emily Chen</p>
                                <p className="text-xs text-gray-500 mt-0.5">Academic Press International</p>
                                <a href="mailto:managing-editor@jgair-journal.org" className="text-xs text-brand-600 hover:text-brand-700 font-semibold no-underline mt-2 inline-block">
                                    managing-editor@jgair-journal.org
                                </a>
                            </div>

                            {/* Editorial Office */}
                            <div className="bg-brand-50 rounded-2xl border border-brand-100 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-brand-200 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-brand-900">Editorial Office</h3>
                                        <p className="text-xs text-brand-600">General Inquiries</p>
                                    </div>
                                </div>
                                <p className="text-sm text-brand-800">
                                    For editorial inquiries, reviewer concerns, or submission questions:
                                </p>
                                <a href="mailto:editorial@jgair-journal.org" className="text-sm text-brand-700 hover:text-brand-800 font-bold no-underline mt-2 inline-block">
                                    editorial@jgair-journal.org
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── CTA: Join the Board ─────────────────────── */}
                <section className="py-16 bg-brand-600">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Interested in Joining Our Board?</h2>
                        <p className="text-brand-200 text-lg mt-3 max-w-2xl mx-auto">
                            We welcome applications from researchers with strong publication records. Send your CV and a brief statement of interest to our editorial office.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            <a href="mailto:editorial@jgair-journal.org?subject=Editorial Board Application" className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-lg no-underline text-[15px]">
                                Apply Now
                            </a>
                            <a href="/for-reviewers" className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px]">
                                Become a Reviewer
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />

            {/* ── CV Modal ────────────────────────────────── */}
            {cvModal && <CVRequestModal member={cvModal} onClose={() => setCvModal(null)} />}
        </div>
    );
};

export default EditorialBoardPage;
