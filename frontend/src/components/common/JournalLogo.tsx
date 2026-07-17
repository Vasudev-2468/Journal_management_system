import React from 'react';

interface JournalLogoProps {
    variant?: 'full' | 'compact' | 'icon';
    className?: string;
    dark?: boolean;
}

/**
 * Professional JGAIR logo – renders a custom SVG mark combining
 * an open-book motif with a neural-network / circuit node, plus
 * the journal name in a clean typographic lockup.
 */
const JournalLogo: React.FC<JournalLogoProps> = ({ variant = 'full', className = '', dark = false }) => {
    const accent  = dark ? '#818cf8' : '#4f46e5'; // brand-400 / brand-600
    const accent2 = dark ? '#a5b4fc' : '#6366f1'; // lighter accent
    const text1   = dark ? '#ffffff' : '#111827';  // white / gray-900
    const text2   = dark ? '#c7d2fe' : '#6b7280';  // brand-200 / gray-500

    const LogoMark = (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={variant === 'icon' ? 'w-10 h-10' : 'w-11 h-11'}>
            {/* Background rounded square */}
            <rect width="48" height="48" rx="12" fill={accent} />

            {/* Open book silhouette */}
            <path
                d="M24 14C21.5 13 18 12 14 12V34C18 34 21.5 35 24 36C26.5 35 30 34 34 34V12C30 12 26.5 13 24 14Z"
                fill="white"
                fillOpacity="0.15"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Center spine */}
            <path d="M24 14V36" stroke="white" strokeWidth="1.5" strokeLinecap="round" />

            {/* Neural network nodes — left page */}
            <circle cx="18" cy="19" r="1.8" fill="white" />
            <circle cx="20" cy="25" r="1.5" fill="white" fillOpacity="0.8" />
            <circle cx="17" cy="28" r="1.2" fill="white" fillOpacity="0.6" />
            {/* Connections left */}
            <line x1="18" y1="19" x2="20" y2="25" stroke="white" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="20" y1="25" x2="17" y2="28" stroke="white" strokeWidth="0.8" strokeOpacity="0.5" />

            {/* Neural network nodes — right page */}
            <circle cx="30" cy="20" r="1.8" fill="white" />
            <circle cx="28" cy="26" r="1.5" fill="white" fillOpacity="0.8" />
            <circle cx="31" cy="29" r="1.2" fill="white" fillOpacity="0.6" />
            {/* Connections right */}
            <line x1="30" y1="20" x2="28" y2="26" stroke="white" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="28" y1="26" x2="31" y2="29" stroke="white" strokeWidth="0.8" strokeOpacity="0.5" />

            {/* Cross-page connection through spine */}
            <line x1="20" y1="25" x2="28" y2="26" stroke="white" strokeWidth="0.6" strokeOpacity="0.35" strokeDasharray="2 2" />

            {/* AI sparkle at top-right */}
            <path d="M36 8L37 10L39 11L37 12L36 14L35 12L33 11L35 10Z" fill={accent2} fillOpacity="0.9" />
        </svg>
    );

    if (variant === 'icon') {
        return <span className={className}>{LogoMark}</span>;
    }

    if (variant === 'compact') {
        return (
            <span className={`inline-flex items-center gap-2.5 ${className}`}>
                {LogoMark}
                <span style={{ color: text1 }} className="font-bold text-lg tracking-tight leading-none select-none">
                    JGAIR
                </span>
            </span>
        );
    }

    // Full variant
    return (
        <span className={`inline-flex items-center gap-3 ${className}`}>
            {LogoMark}
            <span className="flex flex-col select-none">
                <span style={{ color: text1 }} className="font-extrabold text-[17px] tracking-tight leading-tight">
                    JGAIR
                </span>
                <span style={{ color: text2 }} className="text-[10px] font-medium tracking-wide leading-tight">
                    Generative &amp; Applied Intelligence
                </span>
            </span>
        </span>
    );
};

export default JournalLogo;
