import React from 'react';
import { Link } from 'react-router-dom';
import JournalLogo from '../common/JournalLogo';
import { useJournal } from '../../context/JournalContext';

// Contact block added by migration h4d8e5f6a2c1 — the /journals/current
// response carries these fields even though the shared JournalIdentity
// type predates them, so Footer reads them via a local additive shape.
interface JournalContactFields {
    phone?: string | null;
    address?: string | null;
    twitter_url?: string | null;
    linkedin_url?: string | null;
    email_editorial?: string | null;
    email_publisher?: string | null;
}

const Footer: React.FC = () => {
    const { journal } = useJournal();
    // Narrow to the six contact fields once so the JSX stays flat.
    const contact = (journal ?? {}) as JournalContactFields;
    const hasContact = Boolean(
        contact.phone
            || contact.address
            || contact.twitter_url
            || contact.linkedin_url
            || contact.email_editorial
            || contact.email_publisher
    );
    // Assemble the masthead line from identity fields. When issn_online is
    // NULL (per JG-101, JGAIR is not yet ISSN-registered), the line is
    // omitted entirely rather than printing an empty label.
    const masthead = journal
        ? [
              journal.issn_online ? `ISSN ${journal.issn_online}` : null,
              journal.frequency,
          ]
              .filter(Boolean)
              .join('  |  ')
        : '';
    const journalName = journal?.title ?? 'JGAIR';

    return (
        <footer className="bg-gray-900 text-gray-300">
            {/* Main footer */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasContact ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-8`}>
                    {/* Brand */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <div className="mb-4">
                            <JournalLogo variant="full" dark />
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            An AI-powered academic journal management platform advancing scholarly publishing through intelligent peer review, automated analysis, and streamlined editorial workflows.
                        </p>
                        {masthead && (
                            <p className="text-xs text-gray-500 mt-3">
                                {masthead}
                            </p>
                        )}
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
                                { to: '/author-dashboard', label: 'My Submissions' },
                                // R8 — was /login (generic form that mints a
                                // plain 'token' key). /author-login mints
                                // 'author_token' which the client interceptor
                                // routes to /author-*/ endpoints.
                                { to: '/author-login', label: 'Author Login' },
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
                                // R8 — editors need the 2-step MFA flow at
                                // /editor-login, not the generic /login form.
                                { to: '/editor-login', label: 'Editor Login' },
                            ].map((l) => (
                                <li key={l.to}>
                                    <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition no-underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact — rendered from the Journal identity record
                        (migration h4d8e5f6a2c1). Each field is shown only
                        when populated; the whole column collapses when none
                        of the six are set (see hasContact above). */}
                    {hasContact && (
                        <div>
                            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
                                Contact
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-400">
                                {contact.address && (
                                    <li className="leading-relaxed whitespace-pre-line">
                                        {contact.address}
                                    </li>
                                )}
                                {contact.phone && (
                                    <li>
                                        <a
                                            href={`tel:${contact.phone}`}
                                            className="hover:text-white transition no-underline"
                                        >
                                            {contact.phone}
                                        </a>
                                    </li>
                                )}
                                {contact.email_editorial && (
                                    <li>
                                        <a
                                            href={`mailto:${contact.email_editorial}`}
                                            className="hover:text-white transition no-underline"
                                        >
                                            {contact.email_editorial}
                                        </a>
                                    </li>
                                )}
                                {contact.email_publisher && (
                                    <li>
                                        <a
                                            href={`mailto:${contact.email_publisher}`}
                                            className="hover:text-white transition no-underline"
                                        >
                                            {contact.email_publisher}
                                        </a>
                                    </li>
                                )}
                                {contact.twitter_url && (
                                    <li>
                                        <a
                                            href={contact.twitter_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-white transition no-underline"
                                        >
                                            Twitter
                                        </a>
                                    </li>
                                )}
                                {contact.linkedin_url && (
                                    <li>
                                        <a
                                            href={contact.linkedin_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-white transition no-underline"
                                        >
                                            LinkedIn
                                        </a>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                        &copy; {new Date().getFullYear()} {journalName}. All rights reserved.
                    </p>
                    {/* JG-fix F10 — the previous inert Privacy / Terms /
                        Contact spans looked clickable but did nothing. Policy
                        pages arrive with JG-102/103/104/408; contact with
                        JG-109. Nothing is rendered here until those exist. */}
                </div>
            </div>
        </footer>
    );
};

export default Footer;