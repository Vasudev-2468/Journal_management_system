import React, { useEffect, useMemo, useState } from 'react';
import Loading from '../components/common/Loading';
import BackButton from '../components/common/BackButton';
import {
    EmailTemplate,
    fetchEmailTemplates,
    updateEmailTemplate,
} from '../api/platform';

const EditorEmailTemplatesPage: React.FC = () => {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<EmailTemplate> | null>(null);

    const load = () => {
        setLoading(true);
        fetchEmailTemplates()
            .then((data) => {
                setTemplates(data);
                if (data.length > 0 && !activeSlug) setActiveSlug(data[0].slug);
            })
            .catch((err) => setError(err?.message || 'Failed to load templates.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, []); // eslint-disable-line

    const active = useMemo(
        () => templates.find((t) => t.slug === activeSlug) || null,
        [templates, activeSlug],
    );

    useEffect(() => {
        setDraft(active ? { ...active } : null);
    }, [active]);

    const save = async () => {
        if (!draft || !active) return;
        try {
            const updated = await updateEmailTemplate(active.slug, {
                subject: draft.subject,
                body: draft.body,
                description: draft.description,
                placeholders: draft.placeholders,
                is_active: draft.is_active,
            });
            setTemplates((prev) => prev.map((t) => (t.slug === updated.slug ? updated : t)));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                <BackButton className="mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Templates</h1>
                <p className="text-sm text-gray-500 mb-6">
                    Customise the transactional emails sent by the platform. Use{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">{'{{placeholders}}'}</code> to
                    inject dynamic values.
                </p>

                {error && (
                    <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : (
                    <div className="grid grid-cols-4 gap-6">
                        <aside className="col-span-1">
                            <div className="bg-white rounded-2xl border border-gray-100 p-3 sticky top-6">
                                <ul className="space-y-1">
                                    {templates.map((t) => (
                                        <li key={t.slug}>
                                            <button
                                                onClick={() => setActiveSlug(t.slug)}
                                                className={`w-full text-left px-3 py-2 rounded text-sm ${
                                                    activeSlug === t.slug
                                                        ? 'bg-brand-50 text-brand-800 font-semibold'
                                                        : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="truncate">
                                                    {t.slug.replace(/_/g, ' ')}
                                                </div>
                                                <div className="text-[10px] font-mono text-gray-500 truncate">
                                                    /{t.slug}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </aside>

                        <main className="col-span-3">
                            {!draft || !active ? (
                                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                                    Select a template.
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-bold text-gray-900">
                                            {active.slug.replace(/_/g, ' ')}
                                        </h2>
                                        <label className="text-sm flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!!draft.is_active}
                                                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                                            />
                                            Active
                                        </label>
                                    </div>
                                    {active.placeholders && (
                                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                            <span className="font-semibold">Placeholders:</span>{' '}
                                            {active.placeholders
                                                .split(',')
                                                .map((p) => p.trim())
                                                .map((p) => (
                                                    <code key={p} className="mx-1 bg-white px-1 rounded font-mono">
                                                        {`{{${p}}}`}
                                                    </code>
                                                ))}
                                        </div>
                                    )}
                                    <label className="block text-sm">
                                        <span className="block text-gray-600 mb-1">Subject</span>
                                        <input
                                            value={draft.subject || ''}
                                            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-3 py-2 font-medium"
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="block text-gray-600 mb-1">Body</span>
                                        <textarea
                                            value={draft.body || ''}
                                            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                                            rows={14}
                                            className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="block text-gray-600 mb-1">Description (for editors)</span>
                                        <input
                                            value={draft.description || ''}
                                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                        />
                                    </label>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={save}
                                            className="px-5 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
                                        >
                                            Save changes
                                        </button>
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorEmailTemplatesPage;
