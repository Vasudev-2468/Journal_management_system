import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import JournalLogo from '../common/JournalLogo';
import { useJournal } from '../../context/JournalContext';

interface NavItem {
    label: string;
    to?: string;
    children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
    { label: 'Home', to: '/' },
    {
        label: 'About',
        children: [
            { label: 'About Journal', to: '/about' },
            { label: 'Editorial Board', to: '/editorial-board' },
            { label: 'Peer Review', to: '/peer-review-process' },
            { label: 'Publication Ethics', to: '/publication-ethics' },
            { label: 'Open Access', to: '/open-access' },
            { label: 'Statistics', to: '/statistics' },
        ],
    },
    {
        label: 'Articles',
        children: [
            { label: 'Current Issue & Archive', to: '/issues' },
            { label: 'Latest Articles', to: '/articles' },
            { label: 'Search Archive', to: '/issues' },
        ],
    },
    {
        label: 'For Authors',
        children: [
            { label: 'Author Guidelines', to: '/for-authors' },
            { label: 'Manuscript Preparation', to: '/manuscript-preparation' },
            { label: 'Submission', to: '/author-login' },
            { label: 'Article Processing Charges', to: '/apc' },
            { label: 'Copyright & Licensing', to: '/copyright' },
        ],
    },
    {
        label: 'For Reviewers',
        children: [
            { label: 'Reviewer Guidelines', to: '/for-reviewers' },
            { label: 'Become a Reviewer', to: '/for-reviewers' },
            { label: 'Reviewer Sign In', to: '/reviewer-login' },
        ],
    },
    { label: 'Special Issues', to: '/special-issues' },
    { label: 'Announcements', to: '/announcements' },
    { label: 'Search', to: '/search' },
    { label: 'Contact', to: '/contact' },
];

const Header: React.FC = () => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const location = useLocation();
    const menuRef = useRef<HTMLDivElement>(null);
    const { journal } = useJournal();
    const bannerParts = [
        journal?.issn_online ? `ISSN ${journal.issn_online}` : null,
        journal?.publisher_name ? `Published by ${journal.publisher_name}` : null,
    ].filter(Boolean);

    // Close the dropdown when the user navigates.
    useEffect(() => {
        setOpenMenu(null);
        setMobileOpen(false);
    }, [location.pathname]);

    // Click outside to close dropdown.
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const isActive = (to?: string) => !!to && location.pathname === to;

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
            <div className="h-1 bg-gradient-to-r from-brand-600 via-brand-500 to-blue-500" />

            <div className="bg-brand-950 text-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2 text-xs">
                    <span className="tracking-wide">
                        {bannerParts.length > 0 ? bannerParts.join('  |  ') : ' '}
                    </span>
                    <div className="hidden sm:flex items-center gap-4">
                        <Link to="/editor-login" className="hover:text-brand-300 transition">
                            Editor Portal
                        </Link>
                        <span className="text-brand-400">|</span>
                        <Link to="/author-login" className="hover:text-brand-300 transition">
                            Author Sign In
                        </Link>
                        <span className="text-brand-400">|</span>
                        <Link to="/reviewer-login" className="hover:text-brand-300 transition">
                            Reviewer Sign In
                        </Link>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16" ref={menuRef}>
                    <Link to="/" className="flex items-center no-underline">
                        <JournalLogo variant="full" />
                    </Link>

                    <nav className="hidden lg:flex items-center gap-1">
                        {NAV.map((item) => {
                            if (item.children) {
                                const open = openMenu === item.label;
                                const anyChildActive = item.children.some((c) => isActive(c.to));
                                return (
                                    <div key={item.label} className="relative">
                                        <button
                                            onClick={() => setOpenMenu(open ? null : item.label)}
                                            className={`px-3 py-2 rounded-md text-sm font-medium transition inline-flex items-center gap-1 ${
                                                open || anyChildActive
                                                    ? 'bg-brand-50 text-brand-700'
                                                    : 'text-gray-600 hover:text-brand-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            {item.label}
                                            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </button>
                                        {open && (
                                            <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                                <div className="p-2">
                                                    {item.children.map((c) => (
                                                        <Link
                                                            key={c.to + c.label}
                                                            to={c.to}
                                                            className={`block px-3 py-2 rounded-lg text-sm no-underline ${
                                                                isActive(c.to)
                                                                    ? 'bg-brand-50 text-brand-700 font-semibold'
                                                                    : 'text-gray-700 hover:bg-gray-50 hover:text-brand-700'
                                                            }`}
                                                        >
                                                            {c.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            const active = isActive(item.to);
                            return (
                                <Link
                                    key={item.label}
                                    to={item.to!}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition no-underline ${
                                        active
                                            ? 'bg-brand-50 text-brand-700'
                                            : 'text-gray-600 hover:text-brand-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link
                            to="/author-login"
                            className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 text-white text-sm font-bold rounded-xl hover:from-brand-700 hover:to-brand-800 transition no-underline shadow-lg shadow-brand-600/30"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Submit Manuscript
                        </Link>
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 transition"
                            aria-label="Toggle navigation"
                        >
                            {mobileOpen ? (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {mobileOpen && (
                <div className="lg:hidden border-t border-gray-200 bg-white max-h-[70vh] overflow-y-auto">
                    <div className="px-4 py-3 space-y-1">
                        {NAV.map((item) => (
                            <div key={item.label}>
                                {item.to && !item.children && (
                                    <Link
                                        to={item.to}
                                        className={`block px-3 py-2 rounded-md text-sm font-medium no-underline ${
                                            isActive(item.to)
                                                ? 'bg-brand-50 text-brand-700'
                                                : 'text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {item.label}
                                    </Link>
                                )}
                                {item.children && (
                                    <details className="group">
                                        <summary className="px-3 py-2 text-sm font-semibold text-gray-800 cursor-pointer flex items-center justify-between hover:bg-gray-50 rounded-md">
                                            {item.label}
                                            <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </summary>
                                        <div className="ml-3 pl-3 border-l border-gray-100 mt-1 space-y-1">
                                            {item.children.map((c) => (
                                                <Link
                                                    key={c.to + c.label}
                                                    to={c.to}
                                                    className="block px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50 no-underline"
                                                >
                                                    {c.label}
                                                </Link>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))}
                        <div className="pt-3 mt-3 border-t border-gray-100 space-y-1">
                            <Link to="/editor-login" className="block px-3 py-2 text-sm text-gray-600 no-underline">
                                → Editor Portal
                            </Link>
                            <Link to="/author-login" className="block px-3 py-2 text-sm text-gray-600 no-underline">
                                → Author Sign In
                            </Link>
                            <Link to="/reviewer-login" className="block px-3 py-2 text-sm text-gray-600 no-underline">
                                → Reviewer Sign In
                            </Link>
                            <Link
                                to="/author-login"
                                className="block mt-2 px-3 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-bold text-center no-underline"
                            >
                                Submit Manuscript →
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
