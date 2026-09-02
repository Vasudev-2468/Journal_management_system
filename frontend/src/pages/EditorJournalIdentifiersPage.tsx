import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { ACTION, Permission } from '../context/PermissionsContext';

/*
 * Journal Identifiers admin (spec §3-6).
 *
 * Shows every identifier for the primary journal — ISSN, EISSN, PISSN,
 * DOI Prefix, DOI Agency — with the state machine status pill,
 * current value (or "—"), notes, and per-row edit / advance-status
 * actions. The Journal Identifier Agent's "Prepare Application"
 * assistant lives here too — an editor-only modal that collects the
 * ISSN application fields, runs the completeness check, and moves
 * the identifier to APPLICATION_PREPARED.
 */

const TYPE_LABEL: Record<string, string> = {
    issn:       'ISSN',
    eissn:      'eISSN',
    pissn:      'pISSN',
    doi_prefix: 'DOI Prefix',
    doi_agency: 'DOI Agency',
};

const TYPE_HELP: Record<string, string> = {
    issn:       'Legacy combined ISSN — one of ISSN / eISSN / pISSN is required.',
    eissn:      'Electronic ISSN — used for the DOI + online-first pipeline.',
    pissn:      'Print ISSN — only needed if the journal has a print edition.',
    doi_prefix: 'Publisher prefix (e.g. 10.12345) assigned by Crossref / DataCite.',
    doi_agency: 'Registration agency — Crossref / DataCite / mEDRA / etc.',
};

const STATUS_ORDER = [
    'not_requested', 'application_prepared', 'application_submitted',
    'under_review', 'assigned', 'verified', 'active',
    'rejected', 'correction_required',
];

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
    not_requested:          { cls: 'bg-gray-100 text-gray-600',           label: 'Not requested' },
    application_prepared:   { cls: 'bg-blue-100 text-blue-800',           label: 'Application prepared' },
    application_submitted:  { cls: 'bg-indigo-100 text-indigo-800',       label: 'Application submitted' },
    under_review:           { cls: 'bg-amber-100 text-amber-800',         label: 'Under review' },
    assigned:               { cls: 'bg-cyan-100 text-cyan-800',           label: 'Assigned' },
    verified:               { cls: 'bg-emerald-100 text-emerald-800',     label: 'Verified' },
    active:                 { cls: 'bg-emerald-200 text-emerald-900',     label: 'Active' },
    rejected:               { cls: 'bg-rose-100 text-rose-800',           label: 'Rejected' },
    correction_required:    { cls: 'bg-amber-100 text-amber-900',         label: 'Correction required' },
};

interface IdentifierRow {
    identifier_type: string;
    status: string;
    value?: string | null;
    note?: string | null;
    application_prepared_at?: string | null;
    application_submitted_at?: string | null;
    verified_at?: string | null;
    updated_at?: string | null;
}

interface StatusResponse {
    journal_id: number | null;
    journal_title?: string | null;
    identifiers: IdentifierRow[];
    any_issn_verified: boolean;
}

const IDENTIFIER_TYPES = ['issn', 'eissn', 'pissn', 'doi_prefix', 'doi_agency'];

/* ── ISSN Application Assistant modal ─────────────────── */

interface AppField { key: string; label: string; }

const DEFAULT_REQUIRED: AppField[] = [
    { key: 'journal_title',     label: 'Journal title' },
    { key: 'journal_type',      label: 'Journal type (Electronic / Print / Both)' },
    { key: 'publisher',         label: 'Publisher name' },
    { key: 'country',           label: 'Country of publication' },
    { key: 'website',           label: 'Journal website URL' },
    { key: 'frequency',         label: 'Publication frequency' },
    { key: 'language',          label: 'Primary language(s)' },
    { key: 'editorial_contact', label: 'Editorial contact email' },
];

const DEFAULT_OPTIONAL: AppField[] = [
    { key: 'subject_areas',    label: 'Subject areas / discipline(s)' },
    { key: 'first_issue_date', label: 'Date of first issue' },
    { key: 'issue_numbering',  label: 'Volume/issue numbering scheme' },
    { key: 'archival_policy',  label: 'Long-term archival policy' },
];

const ApplicationModal: React.FC<{
    identifierType: string;
    onClose: () => void;
    onPrepared: () => void;
}> = ({ identifierType, onClose, onPrepared }) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [required, setRequired] = useState<AppField[]>(DEFAULT_REQUIRED);
    const [optional, setOptional] = useState<AppField[]>(DEFAULT_OPTIONAL);
    const [check, setCheck] = useState<null | {
        ok: boolean; missing_required: string[]; missing_optional: string[]; warnings: string[];
    }>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            const { data } = await client.post('/journal-identifier/prepare-application', {
                identifier_type: identifierType,
                application: values,
            });
            setRequired(data.required_fields || required);
            setOptional(data.optional_fields || optional);
            setCheck({
                ok: !!data.ok,
                missing_required: data.missing_required || [],
                missing_optional: data.missing_optional || [],
                warnings: data.warnings || [],
            });
            if (data.ok) onPrepared();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not run the application check.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">ISSN Application Assistant</h3>
                        <p className="text-xs text-gray-500">
                            The agent checks completeness. You still submit the application to the ISSN authority manually.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-700" aria-label="Close">×</button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="space-y-3">
                        {required.map((f) => (
                            <label key={f.key} className="block">
                                <span className="text-xs font-semibold text-gray-700">{f.label} <span className="text-rose-600">*</span></span>
                                <input
                                    type="text" value={values[f.key] || ''}
                                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </label>
                        ))}
                        <div className="pt-3 border-t border-gray-100">
                            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">
                                Optional
                            </div>
                            {optional.map((f) => (
                                <label key={f.key} className="block mb-3">
                                    <span className="text-xs font-semibold text-gray-700">{f.label}</span>
                                    <input
                                        type="text" value={values[f.key] || ''}
                                        onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                    {check && (
                        <div className="mt-5">
                            {check.ok ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                    ✓ Application is complete — the identifier has been moved to <strong>Application prepared</strong>.
                                    Print or export the fields above and submit to the ISSN authority.
                                </div>
                            ) : (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                                    <strong>Missing required fields:</strong>
                                    <ul className="list-disc pl-5 mt-1">
                                        {check.missing_required.map((m) => <li key={m}>{m}</li>)}
                                    </ul>
                                </div>
                            )}
                            {check.warnings.length > 0 && (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                    <strong>Warnings:</strong>
                                    <ul className="list-disc pl-5 mt-1">
                                        {check.warnings.map((w) => <li key={w}>{w}</li>)}
                                    </ul>
                                </div>
                            )}
                            {check.missing_optional.length > 0 && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Optional fields not filled: {check.missing_optional.join(', ')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">Close</button>
                    <button
                        type="button" onClick={submit} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                    >
                        {busy ? 'Checking…' : '✨ Run completeness check'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ── Edit-row modal ─────────────────────────────────────── */

const EditIdentifierModal: React.FC<{
    row: IdentifierRow;
    onClose: () => void;
    onSaved: () => void;
}> = ({ row, onClose, onSaved }) => {
    const [status, setStatus] = useState(row.status);
    const [value, setValue] = useState(row.value || '');
    const [note, setNote] = useState(row.note || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setBusy(true); setError(null);
        try {
            await client.patch(`/journal-identifier/${row.identifier_type}`, {
                status, value, note,
            });
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not save the identifier.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
                <h3 className="text-lg font-black text-gray-900 mb-2">Edit {TYPE_LABEL[row.identifier_type] || row.identifier_type}</h3>
                <p className="text-xs text-gray-500 mb-4">{TYPE_HELP[row.identifier_type] || ''}</p>
                <label className="block mb-3">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Status</span>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                        {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>{STATUS_STYLE[s]?.label || s}</option>
                        ))}
                    </select>
                </label>
                <label className="block mb-3">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Value</span>
                    <input
                        type="text" value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                        placeholder={
                            row.identifier_type.startsWith('doi_prefix')
                                ? '10.12345'
                                : row.identifier_type === 'doi_agency'
                                    ? 'Crossref'
                                    : '1234-5678'
                        }
                    />
                    <span className="mt-1 block text-[11px] text-gray-500">
                        Only stamp a value once the authority has assigned one. The agent will not accept it if the checksum fails.
                    </span>
                </label>
                <label className="block mb-3">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Note</span>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Optional — last correspondence, reason for state change, etc."
                    />
                </label>
                {error && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 mb-3">{error}</div>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">Cancel</button>
                    <button
                        type="button" onClick={save} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                    >
                        {busy ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ── Page ───────────────────────────────────────────────── */

export default function EditorJournalIdentifiersPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<IdentifierRow | null>(null);
    const [prepFor, setPrepFor] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        client.get<StatusResponse>('/journal-identifier/status')
            .then((r) => setData(r.data))
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/editor-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not load identifiers.');
            })
            .finally(() => setLoading(false));
    };
    useEffect(load, [navigate]);

    // Fill any missing rows client-side so the editor sees a row for
    // every identifier type even before their first save.
    const rowsByType = useMemo(() => {
        const m: Record<string, IdentifierRow> = {};
        if (data) for (const r of data.identifiers) m[r.identifier_type] = r;
        return m;
    }, [data]);

    const rows: IdentifierRow[] = IDENTIFIER_TYPES.map((t) =>
        rowsByType[t] || {
            identifier_type: t, status: 'not_requested', value: null, note: null,
        },
    );

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-4">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Journal Administration</div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">Identifiers</h1>
                    <p className="text-sm text-gray-600 mt-2">
                        The Journal Identifier Agent tracks the lifecycle of every identifier your journal
                        needs — ISSN, DOI prefix, registration agency. Values are stamped by the editor
                        after the issuing authority assigns them; the agent never invents one.
                    </p>
                    {data && !data.any_issn_verified && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                            <span aria-hidden>⚠</span>
                            <div>
                                <strong>No verified ISSN on file.</strong> Indexers (Scholar, Index Copernicus, DOAJ) will not accept this journal until a verified ISSN is recorded. Use <em>Prepare Application</em> below to draft the paperwork.
                            </div>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="p-8 text-gray-500">Loading…</div>
                ) : error ? (
                    <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-widest text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Identifier</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-left">Value</th>
                                    <th className="px-4 py-3 text-left">Note</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((r) => {
                                    const style = STATUS_STYLE[r.status] || STATUS_STYLE.not_requested;
                                    const isIssn = r.identifier_type === 'issn' || r.identifier_type === 'eissn' || r.identifier_type === 'pissn';
                                    return (
                                        <tr key={r.identifier_type} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-900">{TYPE_LABEL[r.identifier_type]}</div>
                                                <div className="text-xs text-gray-500">{TYPE_HELP[r.identifier_type]}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${style.cls}`}>
                                                    {style.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-800">{r.value || '—'}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600">
                                                <div className="line-clamp-2">{r.note || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Permission
                                                    action={ACTION.CONFIGURE_JOURNAL}
                                                    fallback={
                                                        <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                                            🔒 read-only
                                                        </span>
                                                    }
                                                >
                                                    <div className="flex justify-end gap-2">
                                                        {isIssn && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setPrepFor(r.identifier_type)}
                                                                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold"
                                                            >
                                                                Prepare Application
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditing(r)}
                                                            className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 font-semibold"
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                </Permission>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editing && (
                <EditIdentifierModal
                    row={editing}
                    onClose={() => setEditing(null)}
                    onSaved={load}
                />
            )}
            {prepFor && (
                <ApplicationModal
                    identifierType={prepFor}
                    onClose={() => setPrepFor(null)}
                    onPrepared={load}
                />
            )}
        </div>
    );
}
