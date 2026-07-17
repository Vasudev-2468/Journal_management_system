import React from 'react';
import { Link } from 'react-router-dom';
import JournalLogo from '../common/JournalLogo';

const Footer: React.FC = () => {
    return (
        <footer className="bg-gray-900 text-gray-300">
            {/* Main footer */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <div className="mb-4">
                            <JournalLogo variant="full" dark />
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            An AI-powered academic journal management platform advancing scholarly publishing through intelligent peer review, automated analysis, and streamlined editorial workflows.
                        </p>
                        <p className="text-xs text-gray-500 mt-3">
                            ISSN 2348-8549&nbsp;&nbsp;|&nbsp;&nbsp;12 Issues per Year
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
                            Quick Links
                        </h3>
                        <ul className="space-y-2">
                            {[
                                { to: '/', label: 'Home' },
                                { to: '/about', label: 'About the Journal' },
                                { to: '/editorial-board', label: 'Editorial Board' },
                                { to: '/articles', label: 'Browse Articles' },
                                { to: '/journals', label: 'All Journals' },
                            ].map((l) => (
                                <li key={l.to}>
                                    <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition no-underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* For Authors */}
                    <div>
                        <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
                            For Authors
                        </h3>
                        <ul className="space-y-2">
                            {[
                                { to: '/for-authors', label: 'Author Guidelines' },
                                { to: '/author-login', label: 'Submit Paper' },
                                { to: '/reviews', label: 'Track Reviews' },
                                { to: '/login', label: 'Author Login' },
                            ].map((l) => (
                                <li key={l.to}>
                                    <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition no-underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* For Editors */}
                    <div>
                        <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
                            For Editors
                        </h3>
                        <ul className="space-y-2">
                            {[
                                { to: '/editor', label: 'Editor Dashboard' },
                                { to: '/for-reviewers', label: 'Reviewer Guidelines' },
                                { to: '/login', label: 'Editor Login' },
                            ].map((l) => (
                                <li key={l.to}>
                                    <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition no-underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                        &copy; {new Date().getFullYear()} JGAIR — Journal of Generative and Applied Intelligence Research. All rights reserved.
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="hover:text-gray-300 cursor-pointer transition">Privacy Policy</span>
                        <span className="hover:text-gray-300 cursor-pointer transition">Terms of Service</span>
                        <span className="hover:text-gray-300 cursor-pointer transition">Contact</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;