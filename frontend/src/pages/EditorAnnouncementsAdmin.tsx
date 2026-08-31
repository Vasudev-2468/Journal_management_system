import React, { useEffect, useState } from 'react';
import {
    Announcement,
    AnnouncementKind,
    createAnnouncement,
    deleteAnnouncement,
    fetchAnnouncements,
    updateAnnouncement,
} from '../api/announcements';
import Loading from '../components/common/Loading';

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
                    <ul className="space-y-3">
                        {items.map((a) => (
                            <li key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-start justify-between gap-4">
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
                )}
            </div>
        </div>
    );
};

export default EditorAnnouncementsAdmin;
