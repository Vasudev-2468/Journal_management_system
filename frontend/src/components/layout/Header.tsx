import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import JournalLogo from '../common/JournalLogo';

const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/about', label: 'About' },
    { to: '/editorial-board', label: 'Editorial Board' },
    { to: '/for-authors', label: 'For Authors' },
    { to: '/for-reviewers', label: 'For Reviewers' },
    { to: '/issues', label: 'Issues & Archives' },
    { to: '/articles', label: 'Articles' },
];

const Header: React.FC = () => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
            {/* Top accent bar */}
            <div className="h-1 bg-gradient-to-r from-brand-600 via-brand-500 to-blue-500" />

            {/* Upper bar — branding + ISSN */}
            <div className="bg-brand-950 text-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2 text-xs">
                    <span className="tracking-wide">
                        ISSN&nbsp;2348-8549&nbsp;&nbsp;|&nbsp;&nbsp;Published by Academic Press
                    </span>
                    <div className="hidden sm:flex items-center gap-4">
                        <Link to="/editor" className="hover:text-brand-300 transition">
                            Editor Portal
                        </Link>
                        <span className="text-brand-400">|</span>
                        <Link to="/login" className="hover:text-brand-300 transition">
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>

            {/* Main nav bar */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo / Title */}
                    <Link to="/" className="flex items-center no-underline">
                        <JournalLogo variant="full" />
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden lg:flex items-center gap-1">
                        {navLinks.map((link) => {
                            const active = location.pathname === link.to;
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition no-underline ${
                                        active
                                            ? 'bg-brand-50 text-brand-700'
                                            : 'text-gray-600 hover:text-brand-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* CTA + Mobile toggle */}
                    <div className="flex items-center gap-3">
                        <Link
                            to="/author-login"
                            className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Submit Paper
                        </Link>
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 transition"
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

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="lg:hidden border-t border-gray-200 bg-white">
                    <div className="px-4 py-3 space-y-1">
                        {navLinks.map((link) => {
                            const active = location.pathname === link.to;
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={() => setMobileOpen(false)}
                                    className={`block px-3 py-2 rounded-md text-sm font-medium no-underline ${
                                        active
                                            ? 'bg-brand-50 text-brand-700'
                                            : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                        <div className="pt-2 border-t border-gray-100">
                            <Link to="/editor" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm text-gray-600 no-underline">
                                Editor Portal
                            </Link>
                            <Link to="/login" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm text-gray-600 no-underline">
                                Sign In
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;