import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import JournalLogo from '../common/JournalLogo';
import { useJournal } from '../../context/JournalContext';

const HERO_VIDEOS = [
    'https://videos.pexels.com/video-files/36252897/15374243_1920_1080_30fps.mp4',
    'https://videos.pexels.com/video-files/34128971/14471949_1920_1080_30fps.mp4',
];

const HeroSection: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const { journal } = useJournal();

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        let srcIdx = 0;
        const tryNext = () => {
            srcIdx++;
            if (srcIdx < HERO_VIDEOS.length) {
                v.src = HERO_VIDEOS[srcIdx];
                v.load();
            }
        };
        v.addEventListener('error', tryNext);
        v.src = HERO_VIDEOS[0];
        v.load();
        return () => v.removeEventListener('error', tryNext);
    }, []);

    return (
        <section className="relative overflow-hidden bg-brand-950 min-h-[600px] lg:min-h-[680px] flex items-center">
            {/* Background video */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover scale-105"
                autoPlay
                loop
                muted
                playsInline
                onCanPlayThrough={() => setVideoLoaded(true)}
                style={{ opacity: videoLoaded ? 1 : 0, transition: 'opacity 1.5s ease-in' }}
            />

            {/* Dark overlay with stronger contrast for readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-brand-950/95 via-brand-950/80 to-brand-900/70" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-950/60 via-transparent to-brand-950/40" />

            <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
                <div className="max-w-3xl">
                    {/* Copy */}
                        {/* Logo badge */}
                        <div className="mb-8">
                            <JournalLogo variant="full" dark />
                        </div>

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-sm font-semibold mb-6 backdrop-blur-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                            Now Accepting Submissions{journal?.start_year ? ` — Since ${journal.start_year}` : ''}
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.1] tracking-tight drop-shadow-lg">
                            International Journal of{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-blue-300 to-cyan-300">
                                AI &amp; Computing
                            </span>{' '}
                            Research
                        </h1>

                        <p className="mt-6 text-lg sm:text-xl text-gray-200 leading-relaxed max-w-2xl font-light drop-shadow">
                            A peer-reviewed, open-access journal advancing research in artificial intelligence,
                            machine learning, and computational sciences — with AI-powered editorial workflows
                            for faster, fairer peer review.
                        </p>

                        {/* ISSN & licence — from JournalContext (JG-101).
                            Individual chips are omitted when the underlying
                            field is null, so an unregistered ISSN doesn't leave
                            an empty label. The "Scopus & Web of Science
                            Indexed" claim was untrue and has been removed;
                            JG-108 introduces an honest indexing page. */}
                        {(journal?.issn_print || journal?.issn_online || journal?.licence) && (
                            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                                {journal.issn_print && (
                                    <span className="px-3 py-1 rounded-full bg-white/10 text-white font-medium backdrop-blur-sm border border-white/10">
                                        Print ISSN: {journal.issn_print}
                                    </span>
                                )}
                                {journal.issn_online && (
                                    <span className="px-3 py-1 rounded-full bg-white/10 text-white font-medium backdrop-blur-sm border border-white/10">
                                        Online ISSN: {journal.issn_online}
                                    </span>
                                )}
                                {journal.licence && (
                                    <span className="px-3 py-1 rounded-full bg-brand-500/20 text-brand-200 font-medium backdrop-blur-sm border border-brand-400/20">
                                        {journal.licence}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Search bar */}
                        <div className="mt-8 max-w-xl">
                            <div className="flex rounded-xl overflow-hidden shadow-2xl shadow-black/30 ring-1 ring-white/10">
                                <div className="relative flex-1">
                                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search articles by title, author, or keyword…"
                                        className="w-full pl-12 pr-4 py-4 text-[15px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none"
                                    />
                                </div>
                                <Link
                                    to={`/articles?q=${encodeURIComponent(searchQuery)}`}
                                    className="px-7 py-4 bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition no-underline flex items-center gap-2 whitespace-nowrap"
                                >
                                    Search
                                </Link>
                            </div>
                        </div>

                        {/* CTA buttons */}
                        <div className="mt-8 flex flex-wrap gap-4">
                            <Link
                                to="/author-login"
                                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-brand-900 font-bold rounded-xl hover:bg-gray-100 transition shadow-xl shadow-black/20 no-underline text-[15px]"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                Submit Paper
                            </Link>
                            <Link
                                to="/articles"
                                className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px] backdrop-blur-sm"
                            >
                                Browse Articles
                            </Link>
                            <Link
                                to="/for-authors"
                                className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition no-underline text-[15px] backdrop-blur-sm"
                            >
                                Author Guidelines
                            </Link>
                        </div>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
