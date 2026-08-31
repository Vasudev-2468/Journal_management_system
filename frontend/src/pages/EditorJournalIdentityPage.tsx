import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useJournal } from '../context/JournalContext';
import type { JournalIdentityPatch } from '../api/journal';

// JG-101 — editor-only form for maintaining the journal's publication identity.
// Gated by the parent ProtectedEditorRoute (which enforces the editor tier).
// The backend re-checks the role on PATCH /journals/current — never trust the
// UI guard alone (see JG-407).

type FieldSpec = {
    key: keyof JournalIdentityPatch;
    label: string;
    placeholder?: string;
    type?: 'text' | 'number' | 'textarea' | 'email' | 'url';
    help?: string;
    preLine?: boolean;
    rows?: number;
};

const FIELDS: FieldSpec[] = [
    { key: 'title', label: 'Title', placeholder: 'JGAIR — Journal of…' },
    { key: 'abbreviation', label: 'Abbreviation', placeholder: 'JGAIR' },
    { key: 'subject_area', label: 'Subject area', placeholder: 'Applied Intelligence Research' },
    { key: 'language', label: 'Language', placeholder: 'English' },
    { key: 'start_year', label: 'Start year', placeholder: '2026', type: 'number' },
    { key: 'frequency', label: 'Frequency', placeholder: '2 issues per year (Jan–Jun, Jul–Dec)' },
    { key: 'issn_online', label: 'ISSN (online)', placeholder: '0000-0000', help: 'Leave blank until registered — the public site omits the line entirely.' },
    { key: 'issn_print', label: 'ISSN (print)', placeholder: '0000-0000' },
    { key: 'publisher_name', label: 'Publisher name' },
    { key: 'publisher_address', label: 'Publisher address', type: 'textarea' },
    { key: 'licence', label: 'Licence', placeholder: 'CC-BY-4.0' },
    { key: 'doi_prefix', label: 'DOI prefix', placeholder: '10.xxxxx' },
    { key: 'oai_identifier_prefix', label: 'OAI identifier prefix', placeholder: 'oai:jgair.org:' },
    { key: 'description', label: 'Description', type: 'textarea' },
];

// JG-CT — contact block added by migration h4d8e5f6a2c1. Rendered as a
// separate section below the identity block so editors can see at a glance
// which fields drive the public Footer / ContactPage sidebar.
const CONTACT_FIELDS: FieldSpec[] = [
    { key: 'phone', label: 'Phone', placeholder: '+91 000 000 0000' },
    {
        key: 'address',
        label: 'Address',
        type: 'textarea',
        rows: 3,
        preLine: true,
        placeholder: 'Street\nCity, State ZIP\nCountry',
        help: 'Line breaks are preserved on the public Contact page.',
    },
    {
        key: 'email_editorial',
        label: 'Email — Editorial office',
        type: 'email',
        placeholder: 'editorial@example.org',
    },
    {
        key: 'email_publisher',
        label: 'Email — Publisher',
        type: 'email',
        placeholder: 'publisher@example.org',
    },
    {
        key: 'twitter_url',
        label: 'Twitter URL',
        type: 'url',
        placeholder: 'https://twitter.com/…',
    },
    {
        key: 'linkedin_url',
        label: 'LinkedIn URL',
        type: 'url',
        placeholder: 'https://www.linkedin.com/company/…',
    },
];

// Single row renderer — shared by the identity block and the contact block.
// Keeps label/input layout in one place so both sections read the same.
function renderField(
    f: FieldSpec,
    form: JournalIdentityPatch,
    handleChange: (key: keyof JournalIdentityPatch, raw: string) => void,
) {
    const value = (form[f.key] ?? '') as string | number;
    const displayValue =
        value === null || value === undefined ? '' : String(value);
    return (
        <div
            key={f.key as string}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start"
        >
            <label
                htmlFor={f.key as string}
                className="text-sm font-medium text-gray-700 pt-2"
            >
                {f.label}
            </label>
            <div className="sm:col-span-2">
                {f.type === 'textarea' ? (
                    <textarea
                        id={f.key as string}
                        value={displayValue}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        rows={f.rows ?? 3}
                        // `preLine` preserves the line breaks the editor typed
                        // (e.g. multi-line publisher address) so the textarea
                        // renders the way the public site will.
                        style={f.preLine ? { whiteSpace: 'pre-line' } : undefined}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                ) : (
                    <input
                        id={f.key as string}
                        type={f.type ?? 'text'}
                        value={displayValue}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                )}
                {f.help && (
                    <p className="mt-1 text-xs text-gray-500">{f.help}</p>
                )}
            </div>
        </div>
    );
}

const EditorJournalIdentityPage: React.FC = () => {
    const { journal, loading, error, update, refresh } = useJournal();
    const [form, setForm] = useState<JournalIdentityPatch>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (journal) {
            const { id: _id, is_active: _isActive, ...rest } = journal;
            setForm(rest);
        }
    }, [journal]);

    // Fix R3 — `title` and `licence` are NOT NULL on the model, so a
    // cleared input MUST NOT be written back as `null` (that raises 500 on
    // save). For these fields we drop the key entirely rather than send
    // null, which preserves the existing DB value.
    const REQUIRED_FIELDS = new Set<keyof JournalIdentityPatch>(['title', 'licence']);

    const handleChange = (key: keyof JournalIdentityPatch, raw: string) => {
        setSaved(false);
        setSaveError(null);
        setForm((f) => {
            const next = { ...f };
            if (raw === '') {
                if (REQUIRED_FIELDS.has(key)) {
                    // Skip the write entirely — the previous saved value stays.
                    delete (next as Record<string, unknown>)[key];
                } else {
                    (next as Record<string, unknown>)[key] = null;
                }
            } else {
                (next as Record<string, unknown>)[key] =
                    key === 'start_year' ? Number(raw) : raw;
            }
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveError(null);
        try {
            await update(form);
            setSaved(true);
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setSaveError(
                typeof detail === 'string'
                    ? detail
                    : e?.message || 'Update failed'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-6 py-10">
                <div className="mb-6">
                    <Link to="/editor" className="text-sm text-blue-700 hover:underline">
                        ← Back to editor dashboard
                    </Link>
                </div>

                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Journal identity</h1>
                    <p className="mt-2 text-gray-600 max-w-2xl">
                        One source of truth for the masthead, DOI metadata, citation export, footer,
                        and every indexer submission. Changes propagate to the public site immediately —
                        no redeploy required.
                    </p>
                </div>

                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                {error && (
                    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                        <button
                            onClick={() => refresh()}
                            className="ml-3 underline font-medium"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {journal && (
                    <form
                        onSubmit={handleSubmit}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
                    >
                        {FIELDS.map((f) => renderField(f, form, handleChange))}

                        {/* JG-CT — Contact info. These fields drive the public
                            Contact page sidebar and the site footer contact
                            block. All optional; missing values are hidden on
                            the public site rather than shown blank. */}
                        <div className="pt-6 border-t border-gray-100">
                            <h2 className="text-lg font-semibold text-gray-900">Contact info</h2>
                            <p className="mt-1 mb-4 text-sm text-gray-500">
                                Rendered in the public site footer and Contact page. Leave any
                                field blank to hide it from the public.
                            </p>
                            <div className="space-y-5">
                                {CONTACT_FIELDS.map((f) => renderField(f, form, handleChange))}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-md bg-blue-700 text-white text-sm font-semibold px-4 py-2 hover:bg-blue-800 disabled:opacity-50"
                            >
                                {saving ? 'Saving…' : 'Save changes'}
                            </button>
                            {saved && (
                                <span className="text-sm text-green-700">Saved.</span>
                            )}
                            {saveError && (
                                <span className="text-sm text-red-700">{saveError}</span>
                            )}
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default EditorJournalIdentityPage;
