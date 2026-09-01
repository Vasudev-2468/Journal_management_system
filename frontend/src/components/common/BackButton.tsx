import React from 'react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
    /** Where to send the user if there is no in-app history (bookmark / direct URL). */
    fallback?: string;
    label?: string;
    className?: string;
}

/**
 * Back-to-dashboard button used across every editor admin page.
 *
 * Prefers ``navigate(-1)`` so a mid-flow drill-down actually returns to
 * the previous view, and only falls back to ``fallback`` when the tab
 * has no in-app history to walk (opened from a bookmark, a shared link,
 * or via a full page reload). Keep the visual identical everywhere so
 * the affordance reads the same on every admin screen.
 */
const BackButton: React.FC<BackButtonProps> = ({
    fallback = '/editor-dashboard',
    label = 'Back to dashboard',
    className = '',
}) => {
    const navigate = useNavigate();
    const onClick = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate(fallback);
    };
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 group ${className}`}
            aria-label={label}
        >
            <svg
                className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {label}
        </button>
    );
};

export default BackButton;
