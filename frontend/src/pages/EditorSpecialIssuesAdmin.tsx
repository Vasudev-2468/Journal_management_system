import React, { useEffect, useState } from 'react';
import Loading from '../components/common/Loading';
import {
    SpecialIssue,
    createSpecialIssue,
    deleteSpecialIssue,
    fetchSpecialIssues,
    updateSpecialIssue,
} from '../api/platform';

const BLANK: Omit<SpecialIssue, 'id'> = {
    slug: '',
    title: '',
    description: '',
    guest_editors: '',
    topics: '',
    cover_image_url: '',
    submission_deadline: null,
    publication_date: null,
    status: 'open',
    is_published: true,
};

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (value: string): string | null =>
    value ? new Date(value + 'T00:00:00Z').toISOString() : null;

const EditorSpecialIssuesAdmin: React.FC = () => {
    const [items, setItems] = useState<SpecialIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingSlug, setEditingSlug] = useState<string | null>(null);
    const [draft, setDraft] = useState<Omit<SpecialIssue, 'id'>>(BLANK);
    const [showForm, setShowForm] = useState(false);

    const load = () => {
        setLoading(true);
        fetchSpecialIssues(true)
            .then(setItems)
            .catch((err) => setError(err?.message || 'Failed to load.'))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    const openCreate = () => {
        setDraft(BLANK);
        setEditingSlug(null);
        setShowForm(true);
    };
    const openEdit = (si: SpecialIssue) => {
        setDraft({ ...si });
        setEditingSlug(si.slug);
        setShowForm(true);
    };
    const cancel = () => {
        setDraft(BLANK);
        setEditingSlug(null);
        setShowForm(false);
    };

    const save = async () => {
        try {
            if (editingSlug) {
                const updated = await updateSpecialIssue(editingSlug, draft);
                setItems((prev) => prev.map((si) => (si.slug === updated.slug ? updated : si)));
            } else {
                const created = await createSpecialIssue(draft);
                setItems((prev) => [created, ...prev]);
            }
            cancel();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const remove = async (si: SpecialIssue) => {
        if (!window.confirm(`Delete special issue "${si.title}"?`)) return;
        try {
            await deleteSpecialIssue(si.slug);
            setItems((prev) => prev.filter((x) => x.slug !== si.slug));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Delete failed.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Special Issues</h1>
                    <button
                        onClick={openCreate}
                        className="bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-brand-700"
                    >
                        + New Special Issue
                    </button>
                </div>

                {error && (
                    <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                        No special issues yet.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {items.map((si) => (
                            <li key={si.slug} className="bg-white rounded-2xl border border-gray-100 p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-bold text-gray-900">{si.title}</h2>
                                            <span
                                                className={
                                                    si.status === 'open'
                                                        ? 'text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold'
                                                        : si.status === 'published'
                                                        ? 'text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold'
                                                        : 'text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-semibold'
                                                }
                                            >
                                                {si.status}
                                            </span>
                                            {!si.is_published && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                                                    hidden
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-mono">/{si.slug}</p>
                                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{si.description}</p>
                                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                            {si.submission_deadline && <span>📅 {new Date(si.submission_deadline).toLocaleDateString()}</span>}
                                            {si.guest_editors && <span>👥 {si.guest_editors.split('\n')[0]}</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => openEdit(si)}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => remove(si)}
                                            className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {showForm && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                            <h2 className="text-lg font-bold mb-4">
                                {editingSlug ? `Edit ${editingSlug}` : 'Create special issue'}
                            </h2>
                            <div className="space-y-3 text-sm">
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Slug</span>
                                    <input
                                        disabled={!!editingSlug}
                                        value={draft.slug}
                                        onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                                        placeholder="agentic-ai-2027"
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 disabled:bg-gray-100 font-mono"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Title</span>
                                    <input
                                        value={draft.title}
                                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Description</span>
                                    <textarea
                                        value={draft.description}
                                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                        rows={5}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Guest editors (one per line)</span>
                                    <textarea
                                        value={draft.guest_editors || ''}
                                        onChange={(e) => setDraft({ ...draft, guest_editors: e.target.value })}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Topics (one per line)</span>
                                    <textarea
                                        value={draft.topics || ''}
                                        onChange={(e) => setDraft({ ...draft, topics: e.target.value })}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label>
                                        <span className="block text-gray-600 mb-1">Submission deadline</span>
                                        <input
                                            type="date"
                                            value={toDateInput(draft.submission_deadline)}
                                            onChange={(e) => setDraft({ ...draft, submission_deadline: fromDateInput(e.target.value) })}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                    <label>
                                        <span className="block text-gray-600 mb-1">Publication date</span>
                                        <input
                                            type="date"
                                            value={toDateInput(draft.publication_date)}
                                            onChange={(e) => setDraft({ ...draft, publication_date: fromDateInput(e.target.value) })}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label>
                                        <span className="block text-gray-600 mb-1">Status</span>
                                        <select
                                            value={draft.status}
                                            onChange={(e) => setDraft({ ...draft, status: e.target.value as SpecialIssue['status'] })}
                                            className="w-full border border-gray-300 rounded px-2 py-1.5"
                                        >
                                            <option value="open">Open</option>
                                            <option value="closed">Closed</option>
                                            <option value="published">Published</option>
                                        </select>
                                    </label>
                                    <label className="flex items-end gap-2">
                                        <input
                                            type="checkbox"
                                            checked={draft.is_published}
                                            onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                                        />
                                        Visible to public
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="block text-gray-600 mb-1">Cover image URL</span>
                                    <input
                                        value={draft.cover_image_url || ''}
                                        onChange={(e) => setDraft({ ...draft, cover_image_url: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5"
                                    />
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={cancel} className="px-4 py-2 rounded border border-gray-200">
                                    Cancel
                                </button>
                                <button
                                    onClick={save}
                                    className="px-4 py-2 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700"
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

export default EditorSpecialIssuesAdmin;
