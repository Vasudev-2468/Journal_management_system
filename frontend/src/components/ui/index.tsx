/**
 * Shared UI primitives.
 *
 * The frontend evolved organically — the design audit surfaced four
 * competing primary colour families (blue/indigo/brand), two success
 * families (green/emerald), two danger families (red/rose), three
 * warnings (amber/orange/yellow), and no shared button, card, or
 * banner components. Every page rolled its own.
 *
 * This module is the migration target. New pages should build on
 * these primitives; old pages get replaced piece by piece. The
 * palette below is the canonical one — any new code that reaches
 * for ``bg-red-*`` / ``bg-green-*`` / ``bg-brand-*`` should switch
 * to ``bg-rose-*`` / ``bg-emerald-*`` / ``bg-blue-*`` here.
 */
import React from 'react';

// ── Canonical palette ────────────────────────────────────
//
// Consumers should reference these token names rather than hardcoding
// Tailwind classes so a future palette swap changes one place.

export const TONES = {
    primary:  { solid: 'bg-blue-700 hover:bg-blue-800 text-white',        soft: 'bg-blue-50 text-blue-800 border-blue-200',     ring: 'focus:ring-blue-500' },
    success:  { solid: 'bg-emerald-700 hover:bg-emerald-800 text-white',   soft: 'bg-emerald-50 text-emerald-800 border-emerald-200', ring: 'focus:ring-emerald-500' },
    warning:  { solid: 'bg-amber-600 hover:bg-amber-700 text-white',       soft: 'bg-amber-50 text-amber-900 border-amber-200',   ring: 'focus:ring-amber-500' },
    danger:   { solid: 'bg-rose-700 hover:bg-rose-800 text-white',         soft: 'bg-rose-50 text-rose-800 border-rose-200',      ring: 'focus:ring-rose-500' },
    neutral:  { solid: 'bg-gray-800 hover:bg-gray-900 text-white',         soft: 'bg-gray-100 text-gray-800 border-gray-200',      ring: 'focus:ring-gray-400' },
} as const;

export type Tone = keyof typeof TONES;

// ── Button ──────────────────────────────────────────────
//
// Consistent sizing, colours, focus states, and disabled state. Any
// button that needs different chrome is fine to build inline — but
// most usages fit one of these three sizes and five tones.

interface ButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    tone?: Tone;
    variant?: 'solid' | 'soft' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    tone = 'primary',
    variant = 'solid',
    size = 'md',
    loading = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
}) => {
    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-sm',
    };
    const toneSpec = TONES[tone];
    const variantClass =
        variant === 'solid'
            ? toneSpec.solid
            : variant === 'soft'
            ? `${toneSpec.soft} border`
            : 'text-gray-700 hover:bg-gray-100';

    return (
        <button
            type={type}
            disabled={disabled || loading}
            className={`inline-flex items-center gap-2 justify-center font-semibold rounded-lg transition ${sizes[size]} ${variantClass} focus:outline-none focus:ring-2 ${toneSpec.ring} focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...rest}
        >
            {loading && (
                <span
                    className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden
                />
            )}
            {children}
        </button>
    );
};

// ── IconButton ──────────────────────────────────────────
//
// Icon-only buttons MUST have an aria-label — screen readers otherwise
// read "balance scale" or "clipboard". The prop is required to enforce
// this at the type level. Every icon-only button in the app should
// migrate to this component.

interface IconButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
    tone?: Tone;
    size?: 'sm' | 'md';
    icon: React.ReactNode;
    label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
    tone = 'neutral',
    size = 'md',
    icon,
    label,
    className = '',
    type = 'button',
    ...rest
}) => {
    const dims = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
    return (
        <button
            type={type}
            aria-label={label}
            title={label}
            className={`inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 ${TONES[tone].ring} focus:ring-offset-1 ${dims} ${className}`}
            {...rest}
        >
            <span aria-hidden>{icon}</span>
        </button>
    );
};

// ── PageHeader ──────────────────────────────────────────

interface PageHeaderProps {
    title: string;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    right?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, right }) => (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                {icon && <span aria-hidden>{icon}</span>}
                {title}
            </h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
);

// ── AlertBanner ─────────────────────────────────────────
//
// Replaces the ~14 inline banners spread across editor pages. The
// tone drives the palette so success / warning / danger stay visually
// distinct without any per-page style choices.

interface AlertBannerProps {
    tone: Tone;
    children: React.ReactNode;
    onDismiss?: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ tone, children, onDismiss }) => {
    const spec = TONES[tone];
    const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
    return (
        <div
            role={role}
            className={`text-sm border rounded-lg px-3 py-2 flex items-center justify-between gap-3 ${spec.soft}`}
        >
            <span>{children}</span>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    className="text-current opacity-60 hover:opacity-100 text-xs font-semibold"
                >
                    Dismiss
                </button>
            )}
        </div>
    );
};

// ── EmptyState ──────────────────────────────────────────

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    hint?: React.ReactNode;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📭', title, hint, action }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <div className="text-4xl mb-2" aria-hidden>
            {icon}
        </div>
        <p className="text-gray-700 font-medium">{title}</p>
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
);

// ── LoadingIndicator ────────────────────────────────────
//
// Every page had its own "Loading…" string. Standardising the wording
// AND the spinner makes the app feel less patchwork.

interface LoadingIndicatorProps {
    label?: string;
    fullPage?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
    label = 'Loading…',
    fullPage = false,
}) => {
    const spinner = (
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <span
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                aria-hidden
            />
            <span>{label}</span>
        </div>
    );
    if (!fullPage) return spinner;
    return (
        <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
            {spinner}
        </div>
    );
};

// ── Card ────────────────────────────────────────────────

interface CardProps {
    children: React.ReactNode;
    className?: string;
    padding?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md' }) => {
    const pad = padding === 'sm' ? 'p-4' : padding === 'lg' ? 'p-6' : 'p-5';
    return (
        <div className={`bg-white rounded-xl border border-gray-200 ${pad} ${className}`}>
            {children}
        </div>
    );
};

// ── SectionTitle ────────────────────────────────────────

export const SectionTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = '',
}) => (
    <h2 className={`text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 ${className}`}>
        {children}
    </h2>
);
