import React from 'react';
import { Link } from 'react-router-dom';

const newsItems = [
    {
        id: 1,
        date: 'Apr 15, 2026',
        title: 'Special Issue: Generative AI and Large Language Models',
        excerpt: 'We invite original contributions exploring the frontiers of generative AI, including foundation models, alignment, and responsible deployment. Submission deadline: May 30, 2026.',
        tag: 'Call for Papers',
        tagColor: 'bg-red-100 text-red-700',
        image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&h=250&fit=crop&q=80', // AI robot
    },
    {
        id: 2,
        date: 'Apr 10, 2026',
        title: 'JGAIR Now Indexed in Scopus and Web of Science',
        excerpt: 'We are pleased to announce that JGAIR has been accepted for indexing in Scopus (CiteScore 3.8) and the Web of Science Emerging Sources Citation Index (ESCI).',
        tag: 'Indexing',
        tagColor: 'bg-emerald-100 text-emerald-700',
        image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&h=250&fit=crop&q=80', // Library books
    },
    {
        id: 3,
        date: 'Apr 5, 2026',
        title: 'Best Paper Award — Volume 13 (2025)',
        excerpt: 'Congratulations to Dr. L. Chen and team for "Self-Supervised Representation Learning for Medical Imaging," selected as the Best Paper of Volume 13.',
        tag: 'Award',
        tagColor: 'bg-amber-100 text-amber-700',
        image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400&h=250&fit=crop&q=80', // laboratory
    },
    {
        id: 4,
        date: 'Mar 28, 2026',
        title: 'Reviewer Recognition Certificates Now Available',
        excerpt: 'All reviewers who completed at least 3 reviews in 2025 can now download their official Reviewer Recognition Certificate from the reviewer dashboard.',
        tag: 'Announcement',
        tagColor: 'bg-blue-100 text-blue-700',
        image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=250&fit=crop&q=80', // Writing desk
    },
];

const NewsAnnouncements: React.FC = () => {
    return (
        <section className="py-12 bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">News &amp; Announcements</h2>
                        <p className="text-sm text-gray-500 mt-1">Latest updates from the editorial office</p>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                    {newsItems.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all duration-300 group bg-white"
                        >
                            {/* Image */}
                            <div className="h-44 overflow-hidden">
                                <img
                                    src={item.image}
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    loading="lazy"
                                />
                            </div>
                            <div className="p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${item.tagColor}`}>
                                        {item.tag}
                                    </span>
                                    <span className="text-xs text-gray-400">{item.date}</span>
                                </div>
                                <h3 className="text-base font-bold text-gray-900 group-hover:text-brand-700 transition leading-snug mb-2">
                                    {item.title}
                                </h3>
                                <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                                    {item.excerpt}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default NewsAnnouncements;
