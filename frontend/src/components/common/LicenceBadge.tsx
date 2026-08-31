import React from 'react';
import { useJournal } from '../../context/JournalContext';

// JG-103 — reusable licence badge. Reads the licence code from the
// journal identity (JG-101) rather than being hardcoded. Currently
// recognises CC BY 4.0; other codes fall back to a text-only chip.

interface Props {
    /** Override the journal-level licence with an article-specific one. */
    licence?: string | null;
    /** Compact chip vs. text-plus-badge. */
    variant?: 'chip' | 'inline';
    className?: string;
}

const LicenceBadge: React.FC<Props> = ({ licence, variant = 'chip', className = '' }) => {
    const { journal } = useJournal();
    const code = (licence ?? journal?.licence ?? '').toUpperCase();
    if (!code) return null;

    if (code === 'CC-BY-4.0' || code === 'CC BY 4.0') {
        const href = 'https://creativecommons.org/licenses/by/4.0/';
        if (variant === 'inline') {
            return (
                <span className={`inline-flex items-center gap-1.5 text-sm text-gray-700 ${className}`}>
                    Licensed under{' '}
                    <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                        aria-label="Creative Commons Attribution 4.0 International"
                    >
                        <CCByGlyph />
                        <span className="font-medium">CC BY 4.0</span>
                    </a>
                </span>
            );
        }
        return (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label="Creative Commons Attribution 4.0 International"
                className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors ${className}`}
            >
                <CCByGlyph />
                <span>CC BY 4.0</span>
            </a>
        );
    }

    // Unrecognised code — render as a plain text chip so nothing lies.
    return (
        <span
            className={`inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 ${className}`}
        >
            {code}
        </span>
    );
};

// Small inline SVG rendering the official CC and BY circles — no external
// image dependency, works in both themes.
const CCByGlyph: React.FC = () => (
    <span aria-hidden="true" className="flex items-center gap-0.5">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M10.7 14.4c-.8 0-1.4-.6-1.4-1.9s.6-1.9 1.4-1.9c.4 0 .7.2.9.5l1.3-.7c-.4-.7-1.2-1.2-2.2-1.2-1.9 0-3.1 1.3-3.1 3.3s1.2 3.3 3.1 3.3c1 0 1.8-.5 2.2-1.2l-1.3-.7c-.2.3-.5.5-.9.5z" />
        </svg>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 6.5c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm-3 5.5h1.5v6h3v-6H15v-1c0-1.4-1.4-2.5-3-2.5s-3 1.1-3 2.5v1z" />
        </svg>
    </span>
);

export default LicenceBadge;
