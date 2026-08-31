import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';

const coverFacts: { label: string; value: string; icon: string }[] = [
    { label: 'Length', value: 'Up to 8,000 words (excluding refs)', icon: '📏' },
    { label: 'Format', value: 'DOCX preferred; LaTeX (.zip) accepted', icon: '📝' },
    { label: 'Language', value: 'British or American English (be consistent)', icon: '🌐' },
    { label: 'Template', value: 'Official DOCX template — download below', icon: '📄' },
];

interface Section {
    title: string;
    icon: string;
    guidance: string[];
}

const sections: Section[] = [
    {
        title: 'Title & abstract',
        icon: '🪪',
        guidance: [
            'Title: informative, ≤ 20 words, no jargon or abbreviations.',
            'Structured abstract: Background, Methods, Results, Conclusion — 250 words max.',
            'Up to eight keywords, comma-separated, in order of importance.',
        ],
    },
    {
        title: 'Introduction',
        icon: '🎯',
        guidance: [
            'State the problem, its significance, and the gap being addressed.',
            'End with an explicit statement of the manuscript’s contribution.',
            'Do not review the entire field — cite only what the argument requires.',
        ],
    },
    {
        title: 'Methods',
        icon: '🧪',
        guidance: [
            'Give enough detail that a competent researcher could reproduce the work.',
            'Cite existing tools; describe novel algorithms with pseudocode.',
            'Note ethics approvals, data provenance, and pre-registration where applicable.',
        ],
    },
    {
        title: 'Results',
        icon: '📊',
        guidance: [
            'Present findings in the same order as the methods.',
            'Use figures for trends, tables for exact values — never both for the same data.',
            'Report effect sizes and confidence intervals alongside significance.',
        ],
    },
    {
        title: 'Discussion',
        icon: '💬',
        guidance: [
            'Interpret results without repeating them.',
            'Address limitations candidly.',
            'Situate the work within the existing literature and outline future directions.',
        ],
    },
    {
        title: 'Figures & tables',
        icon: '🖼️',
        guidance: [
            'Numbered sequentially; every figure and table cited in the text.',
            'Captions self-explanatory; do not force the reader back to the body.',
            'Colour permitted throughout (free of charge) — ensure legibility in grayscale.',
        ],
    },
    {
        title: 'References',
        icon: '📚',
        guidance: [
            'Use the journal’s numbered Vancouver-style references or author-year — be consistent.',
            'Include DOIs for every reference where available.',
            'Cite primary literature; avoid excessive self-citation.',
        ],
    },
];

const ManuscriptPreparationPage: React.FC = () => (
    <div className="min-h-screen flex flex-col bg-gray-50">
        <SEO
            title="Manuscript Preparation"
            description="Formatting, structure, and citation guidance for preparing a manuscript for submission."
            keywords={['manuscript preparation', 'author guidelines', 'formatting', 'template']}
        />
        <Header />

        {/* Hero */}
        <section className="relative py-20 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
            <div className="absolute inset-0 opacity-30">
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-purple-500 blur-3xl" />
            </div>
            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                    Manuscript preparation
                </h1>
                <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto">
                    Everything an author needs to prepare a submission — length, structure,
                    figures, citations, and templates.
                </p>
                <a
                    href="/JGAIR_Manuscript_Template.docx"
                    download
                    className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-brand-900 text-sm font-bold hover:bg-brand-50 transition no-underline shadow-lg"
                >
                    ⬇ Download DOCX template
                </a>
            </div>
        </section>

        <main className="flex-1 py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                {/* Cover facts */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {coverFacts.map((c) => (
                        <div
                            key={c.label}
                            className="bg-white rounded-2xl border border-gray-100 p-5"
                        >
                            <span className="text-2xl">{c.icon}</span>
                            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                                {c.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900 leading-snug">
                                {c.value}
                            </p>
                        </div>
                    ))}
                </section>

                {/* Structure sections */}
                <section className="space-y-4">
                    <h2 className="text-2xl font-extrabold text-gray-900">Manuscript structure</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sections.map((s) => (
                            <div
                                key={s.title}
                                className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-2xl">{s.icon}</span>
                                    <h3 className="text-lg font-bold text-gray-900">{s.title}</h3>
                                </div>
                                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                                    {s.guidance.map((g, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="text-brand-600 font-bold">·</span>
                                            <span>{g}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Callouts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <aside className="bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-100 rounded-2xl p-6">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-brand-800">
                            Citation format
                        </h3>
                        <p className="mt-2 text-gray-800 leading-relaxed">
                            Numbered (Vancouver) or author-year (APA-style) citations are both
                            accepted — pick one and use it throughout the manuscript. Every
                            citation must resolve to a DOI where one exists.
                        </p>
                    </aside>
                    <aside className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-amber-800">
                            Figure resolution
                        </h3>
                        <p className="mt-2 text-gray-800 leading-relaxed">
                            Submit line art at ≥ 600 DPI and photographs at ≥ 300 DPI. Vector
                            formats (SVG, EPS, PDF) are preferred. Fonts embedded; no fonts
                            below 8 pt in the printed page.
                        </p>
                    </aside>
                </div>

                {/* CTA */}
                <div className="text-center">
                    <Link
                        to="/author-login"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition no-underline shadow-lg shadow-brand-600/30"
                    >
                        Ready to submit? Sign in →
                    </Link>
                </div>
            </div>
        </main>

        <Footer />
    </div>
);

export default ManuscriptPreparationPage;
