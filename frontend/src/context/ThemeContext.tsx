import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Theme provider — light / dark / system. Persists the choice to
// localStorage and drives the `dark` class on <html> so every Tailwind
// `dark:` variant activates in one place.
//
// Tailwind config uses `darkMode: 'class'` (added when this file lands)
// so classes like `dark:bg-gray-900` only apply when `<html>` carries
// the class. `system` follows `prefers-color-scheme` live.

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
    mode: ThemeMode;
    resolved: 'light' | 'dark';
    setMode: (m: ThemeMode) => void;
    toggle: () => void;
}

const KEY = 'jgair.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readSystem = (): 'light' | 'dark' =>
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';

const readStored = (): ThemeMode => {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch { /* ignore quota / privacy */ }
    return 'system';
};

const applyClass = (dark: boolean) => {
    const el = document.documentElement;
    if (dark) el.classList.add('dark');
    else el.classList.remove('dark');
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<ThemeMode>(readStored);
    const [systemDark, setSystemDark] = useState(readSystem() === 'dark');

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => setSystemDark(mq.matches);
        mq.addEventListener?.('change', handler);
        return () => mq.removeEventListener?.('change', handler);
    }, []);

    const resolved: 'light' | 'dark' =
        mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

    useEffect(() => {
        applyClass(resolved === 'dark');
    }, [resolved]);

    const setMode = (m: ThemeMode) => {
        setModeState(m);
        try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    };

    const toggle = () => {
        // Single toggle button cycles light ↔ dark and drops out of `system`.
        setMode(resolved === 'dark' ? 'light' : 'dark');
    };

    const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
    const ctx = useContext(ThemeContext);
    if (ctx) return ctx;
    // Fallback for components rendered outside the provider (tests,
    // storybook). Never crashes; returns a stable no-op.
    return {
        mode: 'system',
        resolved: 'light',
        setMode: () => undefined,
        toggle: () => undefined,
    };
};

// Compact toggle — drop it into a header. Icons are inline SVG so
// Tailwind's `dark:` variants can style them without any asset load.
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
    const { resolved, toggle } = useTheme();
    const isDark = resolved === 'dark';
    return (
        <button
            type="button"
            onClick={toggle}
            className={
                'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 ' +
                'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 ' +
                'hover:bg-gray-50 dark:hover:bg-gray-700 ' +
                'px-2.5 py-1.5 text-xs font-medium ' + (className || '')
            }
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
        >
            <span aria-hidden>{isDark ? '☀' : '☾'}</span>
            <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
    );
};
