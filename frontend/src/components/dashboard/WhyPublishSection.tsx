import React from 'react';
import { Link } from 'react-router-dom';

const reasons = [
    {
        icon: (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
        ),
        title: 'Rapid Peer Review',
        desc: 'Average 10-day first decision powered by AI-assisted reviewer matching',
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
        ),
        title: 'Open Access (CC BY 4.0)',
        desc: 'Free to read, share, and reuse — maximizing your research impact globally',
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
        ),
        title: 'Scopus & WoS Indexed',
        desc: 'Indexed in major databases ensuring discoverability and citation tracking',
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
        ),
        title: 'No Publication Fees',
        desc: 'Zero APC — completely free for authors to submit and publish research',
    },
];

const WhyPublishSection: React.FC = () => {
    return (
        <section className="relative py-20 overflow-hidden">
            {/* Background image */}
            <div className="absolute inset-0">
                <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&h=600&fit=crop&q=80"
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-950/95 via-brand-900/90 to-brand-800/85" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">
                        Why Publish With IJACR?
                    </h2>
                    <p className="text-brand-200 text-base mt-3 max-w-2xl mx-auto">
                        Join thousands of researchers worldwide who trust our AI-powered platform for high-quality, impactful publishing
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {reasons.map((r) => (
                        <div
                            key={r.title}
                            className="bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/[0.14] transition-all duration-300 group"
                        >
                            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-brand-300 mb-4 group-hover:text-white group-hover:bg-brand-600/50 transition">
                                {r.icon}
                            </div>
                            <h3 className="text-white font-bold text-[15px] mb-2">{r.title}</h3>
                            <p className="text-brand-300 text-sm leading-relaxed">{r.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="text-center mt-10">
                    <Link
                        to="/author-login"
                        className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-xl no-underline text-[15px]"
                    >
                        Submit Your Research Today
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default WhyPublishSection;
