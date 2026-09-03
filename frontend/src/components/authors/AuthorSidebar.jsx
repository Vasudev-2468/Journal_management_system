import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { authorLogout } from '../../api/authorAuth';

/*
 * Persistent sidebar for the Author Portal.
 *
 * The old dashboard was a header-only page with All / In Review / Published
 * tabs — every other author surface (Revision, Decision, Profile) lived on
 * disconnected routes with no cross-navigation. This rail restores a
 * predictable IA so authors can hop between Manuscripts / Revisions /
 * Notifications / Decision Letters / Profile without going back to the
 * dashboard first.
 *
 * ``pendingCounts`` — badge dictionary keyed by nav ``badgeKey`` so the
 * dashboard can flag "1 revision required", "3 unread messages", etc.
 * without this component having to know how to fetch that data.
 */

const NAV = [
    { to: '/author-dashboard',              label: 'Dashboard',          icon: '🏠' },
    { to: '/author/manuscripts',            label: 'My Manuscripts',     icon: '📄', badgeKey: 'total' },
    { to: '/author/revisions',              label: 'Revisions',          icon: '🔄', badgeKey: 'revisions_required' },
    { to: '/author/messages',               label: 'Messages',           icon: '💬', badgeKey: 'unread_messages' },
    { to: '/author/notifications',          label: 'Notifications',      icon: '🔔', badgeKey: 'unread_notifications' },
    { to: '/author/decision-letters',       label: 'Decision Letters',   icon: '📜' },
    { to: '/author/published',              label: 'Published Articles', icon: '📚' },
    { to: '/author-profile',                label: 'Profile',            icon: '👤' },
    { to: '/author/settings',               label: 'Settings',           icon: '⚙️' },
];

function Badge({ count }) {
    if (!count) return null;
    return (
        <span className="ml-auto min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold text-center">
            {count > 99 ? '99+' : count}
        </span>
    );
}

const AuthorSidebar = ({ pendingCounts = {}, profile }) => {
    const navigate = useNavigate();
    const displayName = profile?.full_name || profile?.email || 'Author';
    const initials = (displayName || 'A').trim().charAt(0).toUpperCase();

    const doLogout = () => {
        try { authorLogout(); } catch { /* ignore */ }
        navigate('/author-login', { replace: true });
    };

    return (
        <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
            {/* Brand */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold">📖</div>
                <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Author Portal</div>
                    <div className="text-sm font-black text-gray-900 truncate">JGAIR</div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-4">
                {NAV.map((item) => {
                    const count = item.badgeKey ? pendingCounts[item.badgeKey] : 0;
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/author-dashboard'}
                            className={({ isActive }) =>
                                'flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium no-underline ' +
                                (isActive
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'text-gray-600 hover:bg-gray-100')
                            }
                        >
                            <span aria-hidden>{item.icon}</span>
                            <span className="flex-1">{item.label}</span>
                            <Badge count={count} />
                        </NavLink>
                    );
                })}
            </nav>

            {/* Identity + logout */}
            <div className="border-t border-gray-100 p-3">
                <div className="flex items-center gap-2 px-2 py-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 grid place-items-center font-bold text-sm">
                        {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">{displayName}</div>
                        {profile?.email && (
                            <div className="text-[11px] text-gray-500 truncate">{profile.email}</div>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={doLogout}
                    className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                    <span aria-hidden>🚪</span>
                    <span>Sign out</span>
                </button>
            </div>
        </aside>
    );
};

export default AuthorSidebar;
