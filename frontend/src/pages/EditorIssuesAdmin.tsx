import React, { useEffect, useState } from 'react';
import {
    IssueSummary,
    VolumeSummary,
    createIssue,
    createVolume,
    deleteIssue,
    deleteVolume,
    fetchVolumes,
    updateIssue,
} from '../api/publication';
import Loading from '../components/common/Loading';

const EditorIssuesAdmin: React.FC = () => {
    const [volumes, setVolumes] = useState<VolumeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newVol, setNewVol] = useState({ number: 1, year: new Date().getFullYear(), title: '' });
    const [newIssueFor, setNewIssueFor] = useState<number | null>(null);
    const [newIssue, setNewIssue] = useState({ number: 1, month: '', theme: '', status: 'planned' as IssueSummary['status'] });

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchVolumes();
            setVolumes(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const journalId = volumes[0]?.journal_id ?? 1;

    const addVolume = async () => {
        try {
            const v = await createVolume({
                journal_id: journalId,
                number: newVol.number,
                year: newVol.year,
                title: newVol.title || undefined,
            });
            setVolumes((prev) => [v, ...prev]);
            setNewVol({ number: newVol.number + 1, year: newVol.year, title: '' });
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Create failed.');
        }
    };

    const addIssue = async (volumeId: number) => {
        try {
            const i = await createIssue({
                volume_id: volumeId,
                number: newIssue.number,
                month: newIssue.month || undefined,
                theme: newIssue.theme || undefined,
                status: newIssue.status,
            });
            setVolumes((prev) =>
                prev.map((v) => (v.id === volumeId ? { ...v, issues: [...v.issues, i] } : v)),
            );
            setNewIssueFor(null);
            setNewIssue({ number: newIssue.number + 1, month: '', theme: '', status: 'planned' });
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Create failed.');
        }
    };

    const removeVolume = async (v: VolumeSummary) => {
        if (!window.confirm(`Delete Volume ${v.number} (${v.year}) and all its issues?`)) return;
        try {
            await deleteVolume(v.id);
            setVolumes((prev) => prev.filter((x) => x.id !== v.id));
        } catch {
            /* noop */
        }
    };

    const removeIssue = async (volumeId: number, i: IssueSummary) => {
        if (!window.confirm(`Delete Issue ${i.number}?`)) return;
        try {
            await deleteIssue(i.id);
            setVolumes((prev) =>
                prev.map((v) =>
                    v.id === volumeId ? { ...v, issues: v.issues.filter((x) => x.id !== i.id) } : v,
                ),
            );
        } catch {
            /* noop */
        }
    };

    const cycleStatus = async (volumeId: number, i: IssueSummary) => {
        const order: IssueSummary['status'][] = ['planned', 'accepting', 'published'];
        const next = order[(order.indexOf(i.status) + 1) % order.length];
        try {
            const updated = await updateIssue(i.id, { status: next });
            setVolumes((prev) =>
                prev.map((v) =>
                    v.id === volumeId
                        ? { ...v, issues: v.issues.map((x) => (x.id === updated.id ? updated : x)) }
                        : v,
                ),
            );
        } catch {
            /* noop */
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Volumes & Issues</h1>

                {error && (
                    <div role="alert" className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                    <h2 className="font-semibold text-gray-800 mb-3">Add Volume</h2>
                    <div className="flex flex-wrap gap-3 items-end">
                        <label className="text-sm">
                            Number
                            <input
                                type="number"
                                min={1}
                                value={newVol.number}
                                onChange={(e) => setNewVol({ ...newVol, number: Number(e.target.value) })}
                                className="mt-1 block w-24 border border-gray-300 rounded px-2 py-1.5"
                            />
                        </label>
                        <label className="text-sm">
                            Year
                            <input
                                type="number"
                                value={newVol.year}
                                onChange={(e) => setNewVol({ ...newVol, year: Number(e.target.value) })}
                                className="mt-1 block w-28 border border-gray-300 rounded px-2 py-1.5"
                            />
                        </label>
                        <label className="text-sm flex-1 min-w-[200px]">
                            Title (optional)
                            <input
                                value={newVol.title}
                                onChange={(e) => setNewVol({ ...newVol, title: e.target.value })}
                                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5"
                            />
                        </label>
                        <button
                            onClick={addVolume}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                        >
                            Add Volume
                        </button>
                    </div>
                </div>

                {loading ? (
                    <Loading />
                ) : volumes.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                        No volumes yet. Add the first one above.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {volumes.map((v) => (
                            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-900">
                                            Volume {v.number} <span className="text-gray-500 font-normal">({v.year})</span>
                                        </h3>
                                        {v.title && <p className="text-sm text-gray-600">{v.title}</p>}
                                        <p className="text-xs text-gray-400 mt-1">
                                            {v.issues.length} issue{v.issues.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() =>
                                                setNewIssueFor(newIssueFor === v.id ? null : v.id)
                                            }
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            {newIssueFor === v.id ? 'Cancel' : '+ Issue'}
                                        </button>
                                        <button
                                            onClick={() => removeVolume(v)}
                                            className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>

                                {newIssueFor === v.id && (
                                    <div className="mt-4 flex flex-wrap gap-2 items-end p-3 rounded bg-gray-50 border border-gray-100">
                                        <label className="text-sm">
                                            Number
                                            <input
                                                type="number"
                                                min={1}
                                                value={newIssue.number}
                                                onChange={(e) =>
                                                    setNewIssue({ ...newIssue, number: Number(e.target.value) })
                                                }
                                                className="mt-1 block w-20 border border-gray-300 rounded px-2 py-1.5"
                                            />
                                        </label>
                                        <label className="text-sm">
                                            Month
                                            <input
                                                value={newIssue.month}
                                                onChange={(e) =>
                                                    setNewIssue({ ...newIssue, month: e.target.value })
                                                }
                                                placeholder="March"
                                                className="mt-1 block w-28 border border-gray-300 rounded px-2 py-1.5"
                                            />
                                        </label>
                                        <label className="text-sm flex-1 min-w-[180px]">
                                            Theme
                                            <input
                                                value={newIssue.theme}
                                                onChange={(e) =>
                                                    setNewIssue({ ...newIssue, theme: e.target.value })
                                                }
                                                className="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5"
                                            />
                                        </label>
                                        <label className="text-sm">
                                            Status
                                            <select
                                                value={newIssue.status}
                                                onChange={(e) =>
                                                    setNewIssue({
                                                        ...newIssue,
                                                        status: e.target.value as IssueSummary['status'],
                                                    })
                                                }
                                                className="mt-1 block border border-gray-300 rounded px-2 py-1.5"
                                            >
                                                <option value="planned">Planned</option>
                                                <option value="accepting">Accepting</option>
                                                <option value="published">Published</option>
                                            </select>
                                        </label>
                                        <button
                                            onClick={() => addIssue(v.id)}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                                        >
                                            Create Issue
                                        </button>
                                    </div>
                                )}

                                {v.issues.length > 0 && (
                                    <ul className="mt-4 divide-y divide-gray-100">
                                        {v.issues.map((i) => (
                                            <li key={i.id} className="py-3 flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium text-gray-900">
                                                        Issue {i.number}
                                                        {i.month && ` — ${i.month}`}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {i.theme || 'No theme'} · {i.article_count} article
                                                        {i.article_count !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <button
                                                        onClick={() => cycleStatus(v.id, i)}
                                                        className={`text-xs px-3 py-1 rounded font-semibold ${
                                                            i.status === 'published'
                                                                ? 'bg-green-100 text-green-700'
                                                                : i.status === 'accepting'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-gray-100 text-gray-700'
                                                        }`}
                                                    >
                                                        {i.status}
                                                    </button>
                                                    <button
                                                        onClick={() => removeIssue(v.id, i)}
                                                        className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorIssuesAdmin;
