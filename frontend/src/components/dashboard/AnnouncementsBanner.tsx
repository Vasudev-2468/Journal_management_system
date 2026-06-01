import React from 'react';

const announcements = [
    {
        id: 1,
        type: 'deadline',
        text: 'Special Issue on Generative AI — Submission deadline: May 30, 2026',
    },
    {
        id: 2,
        type: 'news',
        text: 'Journal indexed in Scopus and Web of Science (2025 Impact Factor: 4.32)',
    },
];

const AnnouncementsBanner: React.FC = () => {
    return (
        <section className="bg-gradient-to-r from-amber-50 via-amber-50 to-orange-50 border-y border-amber-200/60">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
                <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                        </svg>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-8 text-sm">
                            {announcements.map((a) => (
                                <span key={a.id} className="flex items-center gap-2.5 whitespace-nowrap">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.type === 'deadline' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                                    <span className="text-amber-900 font-semibold">{a.text}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AnnouncementsBanner;
