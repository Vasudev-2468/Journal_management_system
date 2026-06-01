import React from 'react';
import { Link } from 'react-router-dom';

const topics = [
    'Artificial Intelligence',
    'Machine Learning',
    'Natural Language Processing',
    'Computer Vision',
    'Deep Learning',
    'Transformers & Attention',
    'Reinforcement Learning',
    'Federated Learning',
    'Generative AI & LLMs',
    'Diffusion Models',
    'AI for Healthcare',
    'Robotics & Autonomous Systems',
    'AI Ethics & Fairness',
    'Quantum Computing & AI',
    'Edge AI & IoT',
];

const CallForPapers: React.FC = () => {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Header image */}
            <div className="h-40 overflow-hidden relative">
                <img
                    src="https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=500&h=250&fit=crop&q=80"
                    alt="Academic research"
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-900/80 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                    <h2 className="text-xl font-bold text-white drop-shadow">Call for Papers</h2>
                    <p className="text-sm text-brand-200 mt-0.5">Volume 14, 2026</p>
                </div>
            </div>

            <div className="p-6">

            {/* Aim & Scope */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                    Aim &amp; Scope
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                    The Academic Journal System publishes high-quality, peer-reviewed research
                    covering theoretical foundations, applied methodologies, and emerging
                    innovations in artificial intelligence, machine learning, and data science.
                    We welcome full-length papers, comprehensive reviews, short communications,
                    and technical notes.
                </p>
            </div>

            {/* Topics */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    Topics of Interest
                </h3>
                <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                        <span
                            key={topic}
                            className="inline-block px-2.5 py-1 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition cursor-default"
                        >
                            {topic}
                        </span>
                    ))}
                </div>
            </div>

            {/* Important Dates */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    Key Information
                </h3>
                <div className="space-y-2">
                    {[
                        { label: 'Review Type', value: 'Double-Blind Peer Review' },
                        { label: 'Submission to Decision', value: '~27 Days' },
                        { label: 'Decision to Publication', value: '~32 Days' },
                        { label: 'Publication Frequency', value: 'Monthly (12 Issues/Year)' },
                    ].map((item) => (
                        <div key={item.label} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                            <span className="text-gray-500">{item.label}</span>
                            <span className="text-gray-900 font-medium">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* CTA */}
            <Link
                to="/author-login"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition no-underline"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Submit Your Research
            </Link>
            </div>
        </div>
    );
};

export default CallForPapers;
