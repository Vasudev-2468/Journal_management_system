import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
    path: string;
    label: string;
    roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
    { path: '/', label: 'Dashboard' },
    { path: '/journals', label: 'Journals' },
    { path: '/articles', label: 'Articles' },
    { path: '/issues', label: 'Issues & Archives' },
    { path: '/editorial-board', label: 'Editorial Board' },
    { path: '/ai-insights', label: 'AI Insights', roles: ['editor', 'section_editor', 'admin'] },
    { path: '/editor', label: 'Editor Portal', roles: ['editor', 'section_editor', 'admin'] },
    { path: '/author-dashboard', label: 'My Submissions', roles: ['author'] },
    { path: '/submit', label: 'Submit Paper', roles: ['author'] },
];

const isVisible = (item: NavItem, role: string | undefined): boolean => {
    if (!item.roles || item.roles.length === 0) return true;
    if (!role) return false;
    return item.roles.includes(role);
};

const Sidebar: React.FC = () => {
    const { user } = useAuth();
    const role: string | undefined = user?.role;

    return (
        <div className="w-64 h-full bg-gray-800 text-white">
            <h2 className="text-2xl font-bold p-4">JGAIR</h2>
            <nav className="mt-4" aria-label="Primary">
                <ul>
                    {NAV_ITEMS.filter((item) => isVisible(item, role)).map((item) => (
                        <li key={item.path}>
                            <NavLink
                                to={item.path}
                                end={item.path === '/'}
                                className={({ isActive }) =>
                                    `block p-2 hover:bg-gray-700 ${
                                        isActive ? 'bg-gray-700 font-semibold' : ''
                                    }`
                                }
                            >
                                {item.label}
                            </NavLink>
                        </li>
                    ))}
                    {!user && (
                        <li>
                            <NavLink to="/login" className="block p-2 hover:bg-gray-700">
                                Login
                            </NavLink>
                        </li>
                    )}
                </ul>
            </nav>
        </div>
    );
};

export default Sidebar;
