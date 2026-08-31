import React, { useEffect, useMemo, useState } from 'react';
import {
    BoardCategory,
    BoardMember,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    createBoardMember,
    deleteBoardMember,
    fetchBoardMembers,
    updateBoardMember,
} from '../api/board';
import Loading from '../components/common/Loading';

const BLANK: Omit<BoardMember, 'id'> = {
    name: '',
    role: '',
    category: 'board_member',
    affiliation: '',
    department: '',
    country: '',
    email: '',
    orcid: '',
    scholar_url: '',
    scopus_id: '',
    institutional_profile_url: '',
    qualifications: '',
    bio: '',
    expertise: '',
    photo_url: '',
    sort_order: 100,
    is_active: true,
};

const TEXT_FIELDS: [keyof Omit<BoardMember, 'id'>, string, string?][] = [
    ['name', 'Full name'],
    ['role', 'Designation / role', 'e.g. Editor-in-Chief, Section Editor — NLP'],
    ['affiliation', 'Affiliation (institution)'],
    ['department', 'Department'],
    ['country', 'Country'],
    ['email', 'Email', 'jane@university.edu'],
    ['orcid', 'ORCID', '0000-0000-0000-0000'],
    ['scholar_url', 'Google Scholar URL'],
    ['scopus_id', 'Scopus Author ID'],
    ['institutional_profile_url', 'Institutional profile URL'],
    ['photo_url', 'Photo URL'],
];

const TEXTAREA_FIELDS: [keyof Omit<BoardMember, 'id'>, string, string?][] = [
    ['qualifications', 'Academic qualifications', 'PhD in CS, Stanford, 2010; MSc, IIT Bombay, 2005'],
    ['expertise', 'Research interests', 'Comma-separated: Machine Learning, NLP, Federated Learning'],
    ['bio', 'Short bio'],
];

const EditorEditorialBoardAdmin: React.FC = () => {
    const [members, setMembers] = useState<BoardMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<BoardMember | null>(null);
    const [creating, setCreating] = useState<Omit<BoardMember, 'id'> | null>(null);
    const [filterCategory, setFilterCategory] = useState<BoardCategory | ''>('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchBoardMembers(true);
            setMembers(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load members.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(
        () => (filterCategory ? members.filter((m) => m.category === filterCategory) : members),
        [members, filterCategory],
    );

    const save = async () => {
        try {
            if (editing) {
                const updated = await updateBoardMember(editing.id, editing);
                setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
                setEditing(null);
            } else if (creating) {
                const created = await createBoardMember(creating);
                setMembers((prev) => [...prev, created]);
                setCreating(null);
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const remove = async (member: BoardMember) => {
        if (!window.confirm(`Remove ${member.name} from the board?`)) return;
        try {
            await deleteBoardMember(member.id);
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
        } catch {
            /* noop */
        }
    };

    const draft = editing ?? creating;
    const setDraftField = (key: keyof Omit<BoardMember, 'id'>, value: any) => {
        if (editing) setEditing({ ...editing, [key]: value } as BoardMember);
        else if (creating) setCreating({ ...creating, [key]: value } as Omit<BoardMember, 'id'>);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">Editorial Board</h1>
                    <div className="flex items-center gap-2">
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value as BoardCategory | '')}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="">All categories</option>
                            {CATEGORY_ORDER.map((c) => (
                                <option key={c} value={c}>
                                    {CATEGORY_LABELS[c]}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => {
                                setCreating({ ...BLANK });
                                setEditing(null);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                        >
                            + Add Member
                        </button>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                        No board members
                        {filterCategory ? ` in ${CATEGORY_LABELS[filterCategory]}` : ' yet'}.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filtered.map((m) => (
                            <div
                                key={m.id}
                                className={`bg-white border rounded-xl p-5 ${
                                    m.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-gray-900">{m.name}</span>
                                            <span className="text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                                {m.role}
                                            </span>
                                            <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                                {CATEGORY_LABELS[m.category] || m.category}
                                            </span>
                                            {!m.is_active && (
                                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                    inactive
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">
                                            {[m.department, m.affiliation].filter(Boolean).join(' · ')}
                                            {m.country ? ` — ${m.country}` : ''}
                                        </p>
                                        {m.expertise && (
                                            <p className="text-xs text-gray-500 mt-1">{m.expertise}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <button
                                            onClick={() => {
                                                setEditing({ ...m });
                                                setCreating(null);
                                            }}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => remove(m)}
                                            className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {draft && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
                            <h2 className="text-lg font-bold mb-4">
                                {editing ? `Edit ${editing.name || 'member'}` : 'Add board member'}
                            </h2>

                            <label className="text-sm block mb-3">
                                <span className="block text-gray-600 mb-1">Category</span>
                                <select
                                    value={draft.category}
                                    onChange={(e) =>
                                        setDraftField('category', e.target.value as BoardCategory)
                                    }
                                    className="w-full border border-gray-300 rounded px-2 py-1.5"
                                >
                                    {CATEGORY_ORDER.map((c) => (
                                        <option key={c} value={c}>
                                            {CATEGORY_LABELS[c]}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                {TEXT_FIELDS.map(([key, label, placeholder]) => (
                                    <label key={key} className="text-sm">
                                        <span className="block text-gray-600 mb-1">{label}</span>
                                        <input
                                            value={(draft as any)[key] || ''}
                                            placeholder={placeholder || ''}
                                            onChange={(e) => setDraftField(key, e.target.value)}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="mt-3 space-y-3">
                                {TEXTAREA_FIELDS.map(([key, label, placeholder]) => (
                                    <label key={key} className="text-sm block">
                                        <span className="block text-gray-600 mb-1">{label}</span>
                                        <textarea
                                            value={(draft as any)[key] || ''}
                                            placeholder={placeholder || ''}
                                            onChange={(e) => setDraftField(key, e.target.value)}
                                            rows={3}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <label className="text-sm">
                                    <span className="block text-gray-600 mb-1">Sort order</span>
                                    <input
                                        type="number"
                                        value={draft.sort_order}
                                        onChange={(e) => setDraftField('sort_order', Number(e.target.value))}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="text-sm flex items-end gap-2">
                                    <input
                                        type="checkbox"
                                        checked={draft.is_active}
                                        onChange={(e) => setDraftField('is_active', e.target.checked)}
                                    />
                                    Active
                                </label>
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        setEditing(null);
                                        setCreating(null);
                                    }}
                                    className="px-4 py-2 rounded border border-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={save}
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

export default EditorEditorialBoardAdmin;
