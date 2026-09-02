import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useJournal } from '../../context/JournalContext';
import {
    getMe, logout as reviewerLogout, ReviewerMe,
} from '../../api/reviewerAuth';

// Shared shell for every /reviewer/* page.
//
// Owns the sidebar, top bar, profile dropdown, and (later) the
// notifications bell. Individual pages pass their children as
// content — the layout keeps the reviewer's identity + journal
// context in one place so every page renders the same chrome.

interface Props {
    active: string;
    pendingInvites?: number;
    children: React.ReactNode;
}

// Reviewer WebSocket bell — connects to /ws/reviewer-notifications with
// the reviewer session token and dispatches a document-level event
// whenever a real push arrives. Any page can listen for the event and
// re-fetch its slice. Keeps the layout dependency-free.
function useReviewerLivePush() {
    useEffect(() => {
        const token = localStorage.getItem('reviewer_token');
        if (!token) return;
        const base = (process.env.REACT_APP_API_URL as string | undefined) || 'http://localhost:8000';
        const wsBase = base.replace(/^http/, 'ws');
        const url = `${wsBase.replace(/\/$/, '')}/ws/reviewer-notifications?token=${encodeURIComponent(token)}`;
        let ws: WebSocket | null = null;
        let closed = false;
        let retry = 0;
        const connect = () => {
            if (closed) return;
            try {
                ws = new WebSocket(url);
                ws.onmessage = (e) => {
                    try {
                        const msg = JSON.parse(e.data);
                        if (msg.type === 'notification') {
                            document.dispatchEvent(new CustomEvent('reviewer:live', { detail: msg.payload }));
                        }
                    } catch { /* ignore malformed */ }
                };
                ws.onclose = () => {
                    // Exponential backoff up to 30s.
                    retry = Math.min(retry + 1, 5);
                    setTimeout(connect, Math.min(30000, 1000 * 2 ** retry));
                };
            } catch { /* browser blocked ws */ }
        };
        connect();
        return () => {
            closed = true;
            try { ws?.close(); } catch { /* ignore */ }
        };
    }, []);
}

const SIDEBAR_ITEMS: Array<{ key: string; label: string; icon: string; to: string }> = [
    { key: 'dashboard',    label: 'Dashboard',       icon: '🏠', to: '/reviewer-dashboard' },
    { key: 'assignments',  label: 'My Assignments',  icon: '📄', to: '/reviewer/assignments' },
    { key: 'history',      label: 'Review History',  icon: '📚', to: '/reviewer/history' },
    { key: 'notifications',label: 'Notifications',   icon: '🔔', to: '/reviewer/notifications' },
    { key: 'profile',      label: 'My Profile',      icon: '👤', to: '/reviewer/profile' },
    { key: 'availability', label: 'Availability',    icon: '🗓️', to: '/reviewer/availability' },
    { key: 'security',     label: 'Account Security',icon: '🛡️', to: '/reviewer/security' },
    { key: 'guidelines',   label: 'Reviewer Guide',  icon: '📖', to: '/reviewer/guidelines' },
];

const Sidebar: React.FC<{ active: string; onSignOut: () => void }> = ({ active, onSignOut }) => (
    <aside className="w-60 bg-white border-r border-gray-200 min-h-screen flex flex-col">
        <div className="px-5 py-6 border-b border-gray-100">
            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                Reviewer Portal
            </span>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 text-sm">
            {SIDEBAR_ITEMS.map((item) => (
                <Link
                    key={item.key}
                    to={item.to}
                    className={
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition ' +
                        (active === item.key
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-gray-700 hover:bg-gray-50')
                    }
                >
                    <span aria-hidden>{item.icon}</span> {item.label}
                </Link>
            ))}
        </nav>
        <div className="px-2 py-4 border-t border-gray-100">
            <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-rose-50 hover:text-rose-700"
            >
                <span aria-hidden>🚪</span> Logout
            </button>
        </div>
    </aside>
);

const TopBar: React.FC<{
    journalName: string;
    reviewerName: string;
    pendingInvites: number;
    onSignOut: () => void;
}> = ({ journalName, reviewerName, pendingInvites, onSignOut }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && !target.closest?.('[data-topbar-menu]')) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const item = (label: string, to: string) => (
        <Link
            key={label}
            to={to}
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
            {label}
        </Link>
    );

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center font-bold text-sm">J</div>
                    <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate max-w-md">{journalName}</div>
                        <div className="text-[11px] uppercase tracking-wider text-gray-400">Reviewer workspace</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/reviewer/notifications"
                        aria-label="Notifications"
                        title="Notifications"
                        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
                    >
                        <span aria-hidden>🔔</span>
                        {pendingInvites > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {pendingInvites}
                            </span>
                        )}
                    </Link>
                    <Link to="/reviewer/guidelines" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">Help</Link>
                    <div className="relative" data-topbar-menu>
                        <button
                            type="button"
                            onClick={() => setMenuOpen((v) => !v)}
                            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                        >
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                                {reviewerName.slice(0, 1).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-800 hidden sm:inline">{reviewerName}</span>
                            <span aria-hidden className="text-gray-400 text-xs">▼</span>
                        </button>
                        {menuOpen && (
                            <div role="menu" className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                {item('My Profile', '/reviewer/profile')}
                                {item('Availability', '/reviewer/availability')}
                                {item('Account Security', '/reviewer/security')}
                                {item('Notification Settings', '/reviewer/security')}
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onSignOut(); }}
                                    className="w-full text-left px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

const ReviewerPortalLayout: React.FC<Props> = ({ active, pendingInvites = 0, children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { journal } = useJournal();
    const [me, setMe] = useState<ReviewerMe | null>(null);
    useReviewerLivePush();

    useEffect(() => {
        let mounted = true;
        getMe()
            .then((data) => { if (mounted) setMe(data); })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', {
                        replace: true,
                        state: { from: location.pathname },
                    });
                }
            });
        return () => { mounted = false; };
    }, [navigate, location.pathname]);

    const handleSignOut = () => {
        reviewerLogout();
        navigate('/reviewer-login', { replace: true });
    };

    const journalName =
        (journal && (journal.title || journal.abbreviation)) ||
        'International Journal of Data Science and Artificial Intelligence';

    return (
        <div className="min-h-screen flex bg-gray-50">
            <Sidebar active={active} onSignOut={handleSignOut} />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar
                    journalName={journalName}
                    reviewerName={me?.name || 'Reviewer'}
                    pendingInvites={pendingInvites}
                    onSignOut={handleSignOut}
                />
                <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default ReviewerPortalLayout;
