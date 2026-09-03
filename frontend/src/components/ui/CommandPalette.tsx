import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Ctrl/⌘+K command palette — the top-of-app navigation shortcut.
// Registers global keydown, filters commands by fuzzy substring
// match, arrow-key navigation, Enter to invoke. Mount once at the
// root; commands are declared here so the surface is easy to grep.

export interface Command {
    id: string;
    label: string;
    hint?: string;
    group?: string;
    icon?: string;
    keywords?: string[];             // extra strings scored against the query
    to?: string;                     // navigate() target — mutually exclusive with `run`
    run?: () => void;
    guard?: () => boolean;           // hide when returns false
}

const DEFAULT_COMMANDS: Command[] = [
    // Author
    { id: 'author.dashboard',    label: 'Author dashboard',        group: 'Author',   icon: '📄', to: '/author-dashboard', keywords: ['home', 'my submissions'] },
    { id: 'author.submit',       label: 'Submit a new paper',      group: 'Author',   icon: '✍', to: '/submit', keywords: ['new manuscript', 'upload'] },
    // Reviewer
    { id: 'rev.dashboard',       label: 'Reviewer dashboard',      group: 'Reviewer', icon: '🔬', to: '/reviewer-dashboard' },
    { id: 'rev.assignments',     label: 'My review assignments',   group: 'Reviewer', icon: '📥', to: '/reviewer/assignments' },
    { id: 'rev.history',         label: 'My review history',       group: 'Reviewer', icon: '⌛', to: '/reviewer/history' },
    { id: 'rev.guidelines',      label: 'Reviewer guidelines',     group: 'Reviewer', icon: '📘', to: '/reviewer/guidelines' },
    // Editor
    { id: 'ed.dashboard',        label: 'Editor dashboard',        group: 'Editor',   icon: '🧭', to: '/editor' },
    { id: 'ed.reviewers',        label: 'Reviewers panel',         group: 'Editor',   icon: '🧑‍🔬', to: '/editor/reviewers' },
    { id: 'ed.board',            label: 'Editorial board',         group: 'Editor',   icon: '🏛', to: '/editor/board' },
    { id: 'ed.doi',              label: 'DOI management',          group: 'Editor',   icon: '🔗', to: '/editor/doi', keywords: ['crossref'] },
    { id: 'ed.corrections',      label: 'Corrections & retractions', group: 'Editor', icon: '⚠', to: '/editor/corrections' },
    { id: 'ed.emails',           label: 'Email templates',         group: 'Editor',   icon: '✉', to: '/editor/email-templates' },
    { id: 'ed.audit',            label: 'Audit log',               group: 'Editor',   icon: '📜', to: '/editor/audit-log' },
    // Public
    { id: 'pub.articles',        label: 'Browse articles',         group: 'Journal',  icon: '📰', to: '/articles' },
    { id: 'pub.issues',          label: 'Issues & archives',       group: 'Journal',  icon: '📚', to: '/issues-archives' },
    { id: 'pub.about',           label: 'About the journal',       group: 'Journal',  icon: 'ℹ', to: '/about' },
    { id: 'pub.contact',         label: 'Contact editorial office', group: 'Journal', icon: '📮', to: '/contact' },
];

const score = (q: string, cmd: Command): number => {
    const hay = (cmd.label + ' ' + (cmd.keywords || []).join(' ') + ' ' + (cmd.group || '')).toLowerCase();
    const needle = q.trim().toLowerCase();
    if (!needle) return 1;
    if (hay.includes(needle)) return 5;
    // Loose subsequence match — every char of needle appears in hay in order
    let hi = 0;
    for (const ch of needle) {
        const found = hay.indexOf(ch, hi);
        if (found < 0) return 0;
        hi = found + 1;
    }
    return 1;
};

export const CommandPalette: React.FC<{ extra?: Command[] }> = ({ extra }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const all = useMemo(() => [...DEFAULT_COMMANDS, ...(extra || [])], [extra]);
    const results = useMemo(() => {
        const scored = all
            .filter((c) => !c.guard || c.guard())
            .map((c) => ({ c, s: score(q, c) }))
            .filter((r) => r.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12)
            .map((r) => r.c);
        return scored;
    }, [q, all]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((v) => !v);
                setQ('');
                setCursor(0);
            } else if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 30);
    }, [open]);

    const invoke = useCallback((c: Command) => {
        setOpen(false);
        if (c.run) c.run();
        else if (c.to) navigate(c.to);
    }, [navigate]);

    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[120] flex items-start justify-center pt-24 px-4 bg-black/40"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <span className="text-gray-400 dark:text-gray-500">⌘K</span>
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setCursor(0); }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { setCursor((c) => Math.min(c + 1, results.length - 1)); e.preventDefault(); }
                            else if (e.key === 'ArrowUp') { setCursor((c) => Math.max(c - 1, 0)); e.preventDefault(); }
                            else if (e.key === 'Enter' && results[cursor]) { invoke(results[cursor]); }
                        }}
                        placeholder="Jump to…"
                        className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                        aria-label="Command search"
                    />
                </div>
                <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
                    {results.length === 0 ? (
                        <li className="px-4 py-6 text-center text-sm text-gray-500">No matches</li>
                    ) : (
                        results.map((c, i) => (
                            <li
                                key={c.id}
                                role="option"
                                aria-selected={i === cursor}
                                onMouseEnter={() => setCursor(i)}
                                onClick={() => invoke(c)}
                                className={
                                    'px-4 py-2 text-sm cursor-pointer flex items-center gap-3 ' +
                                    (i === cursor
                                        ? 'bg-blue-50 dark:bg-gray-800 text-blue-900 dark:text-blue-200'
                                        : 'text-gray-800 dark:text-gray-200')
                                }
                            >
                                <span aria-hidden className="text-base w-5 text-center">{c.icon || '·'}</span>
                                <span className="flex-1 truncate">{c.label}</span>
                                {c.group && (
                                    <span className="text-[10px] uppercase tracking-wider text-gray-400">{c.group}</span>
                                )}
                            </li>
                        ))
                    )}
                </ul>
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 flex items-center justify-between">
                    <span>↑↓ navigate · ↵ open · Esc close</span>
                    <span>Ctrl/⌘+K toggles this palette</span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
