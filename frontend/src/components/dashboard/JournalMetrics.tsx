import React from 'react';

// Field-relevant images from Unsplash (free license)
const FIELD_IMAGES = {
    aiResearch: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop&q=80', // AI brain visualization
    dataScience: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop&q=80',  // Data dashboard
    coding: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&h=400&fit=crop&q=80',       // Code on screen
    research: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=600&h=400&fit=crop&q=80',   // Research lab
};

interface Metric {
    label: string;
    value: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    bgImage: string;
}

const metrics: Metric[] = [
    {
        label: 'Acceptance Rate',
        value: '19%',
        description: 'Highly selective review process',
        color: 'text-emerald-600 bg-emerald-50',
        bgImage: FIELD_IMAGES.research,
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        label: 'First Decision',
        value: '10 Days',
        description: 'Average time to first decision',
        color: 'text-blue-600 bg-blue-50',
        bgImage: FIELD_IMAGES.aiResearch,
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        label: 'Articles Published',
        value: '1,248',
        description: 'Total published articles to date',
        color: 'text-purple-600 bg-purple-50',
        bgImage: FIELD_IMAGES.coding,
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
        ),
    },
    {
        label: 'Active Reviewers',
        value: '342',
        description: 'Expert peer reviewers worldwide',
        color: 'text-amber-600 bg-amber-50',
        bgImage: FIELD_IMAGES.dataScience,
        icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
        ),
    },
];

const JournalMetrics: React.FC = () => {
    return (
        <section className="py-14 bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-10">
                    <h2 className="text-2xl font-bold text-gray-900">Journal at a Glance</h2>
                    <p className="text-gray-500 mt-2 text-sm max-w-lg mx-auto">Key performance indicators reflecting our commitment to quality and speed</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
                    {metrics.map((metric) => (
                        <div
                            key={metric.label}
                            className="relative rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                        >
                            {/* Background image */}
                            <div className="absolute inset-0">
                                <img
                                    src={metric.bgImage}
                                    alt=""
                                    className="w-full h-full object-cover opacity-[0.08] group-hover:opacity-[0.14] transition-opacity duration-500"
                                    loading="lazy"
                                />
                            </div>
                            <div className="relative p-6">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${metric.color} shadow-sm`}>
                                    {metric.icon}
                                </div>
                                <p className="text-4xl font-extrabold text-gray-900 tracking-tight">{metric.value}</p>
                                <p className="text-sm font-bold text-gray-700 mt-2">{metric.label}</p>
                                <p className="text-xs text-gray-400 mt-1">{metric.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default JournalMetrics;
