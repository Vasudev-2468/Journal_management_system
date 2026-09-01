import React, { useEffect, useMemo, useState } from 'react';
import Loading from '../components/common/Loading';
import BackButton from '../components/common/BackButton';
import PageActionBar from '../components/common/PageActionBar';
import {
    AdminRole,
    AdminUser,
    deactivateAdminUser,
    fetchAdminUsers,
    updateAdminUser,
} from '../api/platform';

const USER_COLUMNS = [
    { header: 'Name', accessor: (u: AdminUser) => u.full_name || u.username || '' },
    { header: 'Email', accessor: (u: AdminUser) => u.email },
    { header: 'Role', accessor: (u: AdminUser) => u.role.replace('_', ' ') },
    { header: 'Institution', accessor: (u: AdminUser) => u.institution || '' },
    { header: 'Country', accessor: (u: AdminUser) => u.country || '' },
    { header: 'Status', accessor: (u: AdminUser) => (u.is_active ? 'active' : 'inactive') },
];

const ROLE_COLOR: Record<AdminRole, string> = {
    author: 'bg-blue-100 text-blue-700',
    editor: 'bg-purple-100 text-purple-700',
    section_editor: 'bg-indigo-100 text-indigo-700',
    admin: 'bg-red-100 text-red-700',
};

const EditorUsersAdmin: React.FC = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [roleFilter, setRoleFilter] = useState<AdminRole | ''>('');
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState<AdminUser | null>(null);

    const load = () => {
        setLoading(true);
        fetchAdminUsers({ role: roleFilter || undefined, q: query || undefined })
            .then(setUsers)
            .catch((err) => setError(err?.message || 'Failed to load users.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, [roleFilter]); // eslint-disable-line

    const submit = () => {
        if (query) load();
    };

    const patch = async () => {
        if (!editing) return;
        try {
            const updated = await updateAdminUser(editing.id, {
                full_name: editing.full_name || undefined,
                role: editing.role,
                is_active: editing.is_active,
                country: editing.country || undefined,
                institution: editing.institution || undefined,
            });
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setEditing(null);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const deactivate = async (u: AdminUser) => {
        if (!window.confirm(`Deactivate ${u.email}?`)) return;
        try {
            const updated = await deactivateAdminUser(u.id);
            setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Deactivate failed.');
        }
    };

    const counts = useMemo(() => {
        const map: Record<AdminRole, number> = { author: 0, editor: 0, section_editor: 0, admin: 0 };
        for (const u of users) map[u.role]++;
        return map;
    }, [users]);

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <BackButton className="mb-4" />
                <div className="flex items-start justify-between gap-4 mb-2">
                    <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                    <PageActionBar
                        download={{
                            filenameBase: 'users',
                            rows: users,
                            columns: USER_COLUMNS,
                            pdfTitle: 'User Management',
                        }}
                        share={{ subject: 'User Management — Journal Editor' }}
                    />
                </div>
                <p className="text-sm text-gray-500 mb-6">
                    Manage authors, editors, and administrators. Deactivation is soft — the account keeps
                    its history but can't sign in.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {(Object.keys(counts) as AdminRole[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRoleFilter(roleFilter === r ? '' : r)}
                            className={`rounded-2xl border p-4 text-left transition ${
                                roleFilter === r
                                    ? 'border-brand-500 shadow-md bg-brand-50'
                                    : 'border-gray-200 bg-white hover:shadow'
                            }`}
                        >
                            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">{r.replace('_', ' ')}</p>
                            <p className="text-2xl font-extrabold text-gray-900 mt-1">{counts[r]}</p>
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder="Search name, email, or username…"
                        className="flex-1 min-w-[240px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                        onClick={submit}
                        className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
                    >
                        Search
                    </button>
                    {roleFilter && (
                        <button
                            onClick={() => setRoleFilter('')}
                            className="px-4 py-2 rounded-lg border border-gray-200 text-sm"
                        >
                            Clear role filter
                        </button>
                    )}
                </div>

                {error && (
                    <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : users.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                        No users found.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 text-left">
                                <tr>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Affiliation</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map((u) => (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{u.full_name || u.username || u.email}</div>
                                            <div className="text-xs text-gray-500">{u.email}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${ROLE_COLOR[u.role]}`}>
                                                {u.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {[u.institution, u.country].filter(Boolean).join(' · ') || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={
                                                    u.is_active
                                                        ? 'text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-semibold'
                                                        : 'text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold'
                                                }
                                            >
                                                {u.is_active ? 'active' : 'inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => setEditing({ ...u })}
                                                    className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                                >
                                                    Edit
                                                </button>
                                                {u.is_active && (
                                                    <button
                                                        onClick={() => deactivate(u)}
                                                        className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                                    >
                                                        Deactivate
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {editing && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
                            <h2 className="text-lg font-bold mb-4">Edit {editing.email}</h2>
                            <div className="space-y-3">
                                <label className="text-sm block">
                                    <span className="block text-gray-600 mb-1">Full name</span>
                                    <input
                                        value={editing.full_name || ''}
                                        onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="text-sm block">
                                    <span className="block text-gray-600 mb-1">Role</span>
                                    <select
                                        value={editing.role}
                                        onChange={(e) => setEditing({ ...editing, role: e.target.value as AdminRole })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    >
                                        <option value="author">Author</option>
                                        <option value="editor">Editor</option>
                                        <option value="section_editor">Section Editor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="text-sm">
                                        <span className="block text-gray-600 mb-1">Institution</span>
                                        <input
                                            value={editing.institution || ''}
                                            onChange={(e) => setEditing({ ...editing, institution: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                    <label className="text-sm">
                                        <span className="block text-gray-600 mb-1">Country</span>
                                        <input
                                            value={editing.country || ''}
                                            onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                </div>
                                <label className="text-sm flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={editing.is_active}
                                        onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                                    />
                                    Active
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-gray-200">
                                    Cancel
                                </button>
                                <button
                                    onClick={patch}
                                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorUsersAdmin;
