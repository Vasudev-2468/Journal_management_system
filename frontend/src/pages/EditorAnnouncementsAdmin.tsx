import React, { useEffect, useState } from 'react';
import {
    Announcement,
    AnnouncementKind,
    createAnnouncement,
    deleteAnnouncement,
    fetchAnnouncements,
    updateAnnouncement,
} from '../api/announcements';
// Bulk endpoints from the editor API layer — kept in editor.js (JS, no
// generated types) so we import as any-typed at the module boundary.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import {
    bulkPublishAnnouncements,
    bulkDeleteAnnouncements,
} from '../api/editor';
import Loading from '../components/common/Loading';
import BackButton from '../components/common/BackButton';

interface Draft {
    title: string;
    body: string;
    kind: AnnouncementKind;
    link_url: string;
    is_published: boolean;
    expires_at: string;
}

const BLANK: Draft = {
    title: '',
    body: '',
    kind: 'news',
    link_url: '',
    is_published: true,
    expires_at: '',
};

const EditorAnnouncementsAdmin: React.FC = () => {
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [draft, setDraft] = useState<Draft>(BLANK);
    const [showForm, setShowForm] = useState(false);

    // ── Bulk selection state ───────────────────────────
    // Set of announcement ids the editor has checked. Floating action bar
    // shows while at least one row is selected.
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);

    const toggleRow = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allSelected =
        items.length > 0 && items.every((a) => selectedIds.has(a.id));

    const toggleAll = () => {
        setSelectedIds((prev) => {
            if (allSelected) return new Set();
            const next = new Set(prev);
            items.forEach((a) => next.add(a.id));
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const runBulkPublish = async (is_published: boolean) => {
        if (selectedIds.size === 0) return;
        setBulkBusy(true);
        setBulkError(null);
        try {
            const ids = Array.from(selectedIds);
            await bulkPublishAnnouncements(ids, is_published);
            setItems((prev) =>
                prev.map((a) => (ids.includes(a.id) ? { ...a, is_published } : a)),
            );
            clearSelection();
        } catch (err: any) {
            setBulkError(
                err?.response?.data?.detail || err?.message || 'Bulk publish failed.',
            );
        } finally {
            setBulkBusy(false);
        }
    };

    const runBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Delete ${selectedIds.size} announcement(s)?`)) return;
        setBulkBusy(true);
        setBulkError(null);
        try {
            const ids = Array.from(selectedIds);
            await bulkDeleteAnnouncements(ids);
            setItems((prev) => prev.filter((a) => !ids.includes(a.id)));
            clearSelection();
        } catch (err: any) {
            setBulkError(
                err?.response?.data?.detail || err?.message || 'Bulk delete failed.',
            );
        } finally {
            setBulkBusy(false);
        }
    };

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchAnnouncements({ include_unpublished: true, limit: 100 });
            setItems(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const resetForm = () => {
        setDraft(BLANK);
        setEditingId(null);
        setShowForm(false);
    };

    const save = async () => {
        try {
            const payload: any = {
                title: draft.title,
                body: draft.body,
                kind: draft.kind,
                is_published: draft.is_published,
            };
            if (draft.link_url.trim()) payload.link_url = draft.link_url.trim();
            if (draft.expires_at) payload.expires_at = new Date(draft.expires_at).toISOString();

            if (editingId) {
                const updated = await updateAnnouncement(editingId, payload);
                setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            } else {
                const created = await createAnnouncement(payload);
                setItems((prev) => [created, ...prev]);
            }
            resetForm();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const remove = async (a: Announcement) => {
        if (!window.confirm(`Delete "${a.title}"?`)) return;
        try {
            await deleteAnnouncement(a.id);
            setItems((prev) => prev.filter((x) => x.id !== a.id));
        } catch {
            /* noop */
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <BackButton className="mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900">Announcements & Call for Papers</h1>
                    <button
                        onClick={() => {
                            setDraft(BLANK);
                            setEditingId(null);
                            setShowForm(true);
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                    >
                        + New Announcement
                    </button>
                </div>

                {error && (
                    <div role="alert" className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {showForm && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
                        <input
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            placeholder="Title"
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                        <textarea
                            value={draft.body}
                            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                            placeholder="Body"
                            rows={5}
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                        <div className="grid grid-cols-3 gap-3">
                            <label className="text-sm">
                                Kind
                                <select
                                    value={draft.kind}
                                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as AnnouncementKind })}
                                    className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5"
                                >
                                    <option value="news">News</option>
                                    <option value="cfp">Call for Papers</option>
                                    <option value="update">Update</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                Link (optional)
                                <input
                                    value={draft.link_url}
                                    onChange={(e) => setDraft({ ...draft, link_url: e.target.value })}
                                    placeholder="https://…"
                                    className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5"
                                />
                            </label>
                            <label className="text-sm">
                                Expires (optional)
                                <input
                                    type="date"
                                    value={draft.expires_at}
                                    onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })}
                                    className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5"
                                />
                            </label>
                        </div>
                        <label className="text-sm flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={draft.is_published}
                                onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                            />
                            Published
                        </label>
                        <div className="flex justify-end gap-2">
                            <button onClick={resetForm} className="px-4 py-2 rounded border border-gray-200">
                                Cancel
                            </button>
                            <button
                                onClick={save}
                                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                            >
                                {editingId ? 'Save changes' : 'Publish'}
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                        No announcements yet.
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 mb-2 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                aria-label="Select all announcements"
                                className="rounded border-gray-300 text-blue-600"
                            />
                            <span>Select all</span>
                        </div>
                        <ul className="space-y-3">
                        {items.map((a) => (
                            <li key={a.id} className={`bg-white rounded-xl border p-5 ${
                                selectedIds.has(a.id) ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'
                            }`}>
                                <div className="flex items-start justify-between gap-4">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${a.title}`}
                                        checked={selectedIds.has(a.id)}
                                        onChange={() => toggleRow(a.id)}
                                        className="mt-1 rounded border-gray-300 text-blue-600"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={
                                                    a.kind === 'cfp'
                                                        ? 'text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800'
                                                        : a.kind === 'update'
                                                        ? 'text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800'
                                                        : 'text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800'
                                                }
                                            >
                                                {a.kind.toUpperCase()}
                                            </span>
                                            {!a.is_published && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                                    unpublished
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="font-semibold text-gray-900 mt-1">{a.title}</h2>
                                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{a.body}</p>
                                        {a.link_url && (
                                            <a
                                                href={a.link_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm text-blue-600 hover:underline"
                                            >
                                                {a.link_url}
                                            </a>
                                        )}
                                        <p className="text-xs text-gray-400 mt-2">
                                            Published {new Date(a.published_at).toLocaleDateString()}
                                            {a.expires_at &&
                                                ` · expires ${new Date(a.expires_at).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <button
                                            onClick={() => {
                                                setEditingId(a.id);
                                                setDraft({
                                                    title: a.title,
                                                    body: a.body,
                                                    kind: a.kind,
                                                    link_url: a.link_url || '',
                                                    is_published: a.is_published,
                                                    expires_at: a.expires_at
                                                        ? a.expires_at.slice(0, 10)
                                                        : '',
                                                });
                                                setShowForm(true);
                                            }}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => remove(a)}
                                            className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                        </ul>
                    </>
                )}

                {/*
                  Floating bulk-action bar. Sticky-bottom position so it
                  stays visible while the editor scrolls a long list of
                  announcements.
                */}
                {selectedIds.size > 0 && (
                    <div
                        role="toolbar"
                        aria-label="Bulk announcement actions"
                        className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-white shadow-lg px-4 py-3"
                    >
                        <span className="text-sm font-semibold text-gray-800">
                            {selectedIds.size} selected
                        </span>
                        <button
                            type="button"
                            onClick={() => runBulkPublish(true)}
                            disabled={bulkBusy}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                            Publish
                        </button>
                        <button
                            type="button"
                            onClick={() => runBulkPublish(false)}
                            disabled={bulkBusy}
                            className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                            Unpublish
                        </button>
                        <button
                            type="button"
                            onClick={runBulkDelete}
                            disabled={bulkBusy}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                            Delete
                        </button>
                        <button
                            type="button"
                            onClick={clearSelection}
                            disabled={bulkBusy}
                            className="px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded disabled:opacity-50"
                        >
                            Clear selection
                        </button>
                        {bulkError && (
                            <span role="alert" className="text-xs text-red-600 ml-2">
                                {bulkError}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorAnnouncementsAdmin;
