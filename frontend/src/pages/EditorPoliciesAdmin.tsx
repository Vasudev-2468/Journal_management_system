import React, { useEffect, useMemo, useState } from 'react';
import {
    PolicyPage,
    PolicySection,
    createPolicy,
    deletePolicy,
    fetchPolicies,
    updatePolicy,
} from '../api/policies';
import Loading from '../components/common/Loading';

const emptySection = (id: number): PolicySection => ({
    id: `section-${id}`,
    title: '',
    content: [''],
});

const EditorPoliciesAdmin: React.FC = () => {
    const [policies, setPolicies] = useState<PolicyPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<PolicyPage> | null>(null);
    const [creatingSlug, setCreatingSlug] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchPolicies();
            setPolicies(data);
            if (data.length > 0 && !activeSlug) setActiveSlug(data[0].slug);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load policies.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const active = useMemo(
        () => policies.find((p) => p.slug === activeSlug) || null,
        [policies, activeSlug],
    );

    useEffect(() => {
        setDraft(active ? { ...active, body: active.body.map((s) => ({ ...s, content: [...s.content] })) } : null);
    }, [active]);

    const updateSection = (idx: number, patch: Partial<PolicySection>) => {
        if (!draft?.body) return;
        const body = [...draft.body];
        body[idx] = { ...body[idx], ...patch };
        setDraft({ ...draft, body });
    };

    const addSection = () => {
        if (!draft) return;
        const body = draft.body ? [...draft.body] : [];
        body.push(emptySection(body.length + 1));
        setDraft({ ...draft, body });
    };

    const removeSection = (idx: number) => {
        if (!draft?.body) return;
        setDraft({ ...draft, body: draft.body.filter((_, i) => i !== idx) });
    };

    const save = async () => {
        if (!draft || !active) return;
        try {
            const updated = await updatePolicy(active.slug, {
                title: draft.title,
                subtitle: draft.subtitle,
                footer_note: draft.footer_note,
                is_published: draft.is_published,
                body: draft.body,
            });
            setPolicies((prev) => prev.map((p) => (p.slug === updated.slug ? updated : p)));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const remove = async (p: PolicyPage) => {
        if (!window.confirm(`Delete policy "${p.title}"?`)) return;
        try {
            await deletePolicy(p.slug);
            setPolicies((prev) => prev.filter((x) => x.slug !== p.slug));
            if (activeSlug === p.slug) setActiveSlug(policies[0]?.slug || null);
        } catch {
            /* noop */
        }
    };

    const createNew = async () => {
        const slug = creatingSlug.trim().toLowerCase();
        if (!slug) return;
        try {
            const created = await createPolicy({
                slug,
                title: slug
                    .split('-')
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' '),
                body: [],
                is_published: true,
            });
            setPolicies((prev) => [...prev, created]);
            setActiveSlug(created.slug);
            setCreatingSlug('');
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Create failed.');
        }
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Policy Pages</h1>

                {error && (
                    <div role="alert" className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-4 gap-6">
                    <aside className="col-span-1">
                        <div className="bg-white rounded-xl border border-gray-200 p-3">
                            <ul className="space-y-1">
                                {policies.map((p) => (
                                    <li key={p.slug}>
                                        <button
                                            onClick={() => setActiveSlug(p.slug)}
                                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                                                activeSlug === p.slug
                                                    ? 'bg-blue-50 text-blue-800 font-semibold'
                                                    : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            {p.title}
                                            <div className="text-xs text-gray-500 font-mono">/{p.slug}</div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3 pt-3 border-t border-gray-100">
                                <label className="text-xs text-gray-600 block mb-1">New policy slug</label>
                                <div className="flex gap-1">
                                    <input
                                        value={creatingSlug}
                                        onChange={(e) => setCreatingSlug(e.target.value)}
                                        placeholder="my-policy"
                                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                                    />
                                    <button
                                        onClick={createNew}
                                        className="bg-blue-600 text-white text-xs px-3 rounded font-semibold hover:bg-blue-700"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <main className="col-span-3">
                        {!draft || !active ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-8 text-gray-500 text-center">
                                Select a policy on the left.
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                        <input
                                            value={draft.title || ''}
                                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                            className="w-full text-xl font-bold border-b border-gray-200 py-1 focus:outline-none focus:border-blue-500"
                                        />
                                        <input
                                            value={draft.subtitle || ''}
                                            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                                            placeholder="Subtitle"
                                            className="w-full text-sm text-gray-600 border-b border-gray-100 py-1 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <button
                                        onClick={() => remove(active)}
                                        className="ml-2 text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                        Delete policy
                                    </button>
                                </div>

                                <label className="text-sm flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!!draft.is_published}
                                        onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                                    />
                                    Published
                                </label>

                                <div className="space-y-4">
                                    {(draft.body || []).map((section, idx) => (
                                        <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50">
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    value={section.id}
                                                    onChange={(e) => updateSection(idx, { id: e.target.value })}
                                                    placeholder="section-id"
                                                    className="w-40 text-xs font-mono border border-gray-300 rounded px-2 py-1"
                                                />
                                                <input
                                                    value={section.title}
                                                    onChange={(e) => updateSection(idx, { title: e.target.value })}
                                                    placeholder="Section title"
                                                    className="flex-1 font-semibold border border-gray-300 rounded px-2 py-1"
                                                />
                                                <button
                                                    onClick={() => removeSection(idx)}
                                                    className="text-xs px-2 rounded border border-red-200 text-red-600"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <textarea
                                                value={section.content.join('\n\n')}
                                                onChange={(e) =>
                                                    updateSection(idx, {
                                                        content: e.target.value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
                                                    })
                                                }
                                                rows={5}
                                                placeholder="Paragraphs separated by blank lines."
                                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                            />
                                        </div>
                                    ))}
                                    <button
                                        onClick={addSection}
                                        className="text-sm text-blue-700 hover:underline"
                                    >
                                        + Add section
                                    </button>
                                </div>

                                <div>
                                    <label className="text-sm text-gray-600 block mb-1">Footer note</label>
                                    <textarea
                                        value={draft.footer_note || ''}
                                        onChange={(e) => setDraft({ ...draft, footer_note: e.target.value })}
                                        rows={2}
                                        className="w-full border border-gray-300 rounded px-2 py-1"
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={save}
                                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
                                    >
                                        Save changes
                                    </button>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default EditorPoliciesAdmin;
