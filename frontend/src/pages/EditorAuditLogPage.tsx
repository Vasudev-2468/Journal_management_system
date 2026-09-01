import React, { useEffect, useState } from 'react';
import Loading from '../components/common/Loading';
import { AuditLogEntry, fetchAuditLog } from '../api/platform';
import BackButton from '../components/common/BackButton';
import PageActionBar from '../components/common/PageActionBar';

const AUDIT_COLUMNS = [
    { header: 'Timestamp', accessor: (e: AuditLogEntry) => new Date(e.created_at).toLocaleString() },
    { header: 'Action', accessor: (e: AuditLogEntry) => e.action },
    { header: 'Actor', accessor: (e: AuditLogEntry) => e.actor_email || 'system' },
    {
        header: 'Target',
        accessor: (e: AuditLogEntry) => (e.target_type ? `${e.target_type}#${e.target_id}` : ''),
    },
    { header: 'IP', accessor: (e: AuditLogEntry) => e.ip_address || '' },
    {
        header: 'Meta',
        accessor: (e: AuditLogEntry) => (e.meta ? JSON.stringify(e.meta) : ''),
    },
];

const EditorAuditLogPage: React.FC = () => {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [action, setAction] = useState('');

    const load = () => {
        setLoading(true);
        fetchAuditLog({ q: q || undefined, action: action || undefined, limit: 300 })
            .then(setEntries)
            .catch((err) => setError(err?.message || 'Failed to load audit log.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, []); // eslint-disable-line

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <BackButton className="mb-4" />
                <div className="flex items-start justify-between gap-4 mb-2">
                    <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
                    <PageActionBar
                        download={{
                            filenameBase: 'audit-log',
                            rows: entries,
                            columns: AUDIT_COLUMNS,
                            pdfTitle: 'Audit Log',
                        }}
                        share={{ subject: 'Audit Log — Journal Editor' }}
                        filters={
                            <div className="space-y-3">
                                <label className="block text-sm">
                                    <span className="block text-gray-600 mb-1">Search</span>
                                    <input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && load()}
                                        placeholder="Search action, actor, or target…"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </label>
                                <label className="block text-sm">
                                    <span className="block text-gray-600 mb-1">Exact action</span>
                                    <input
                                        value={action}
                                        onChange={(e) => setAction(e.target.value)}
                                        placeholder="e.g. special_issue.updated"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </label>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQ('');
                                            setAction('');
                                            load();
                                        }}
                                        className="px-3 py-1.5 rounded border border-gray-200 text-sm"
                                    >
                                        Reset
                                    </button>
                                    <button
                                        type="button"
                                        onClick={load}
                                        className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        }
                    />
                </div>
                <p className="text-sm text-gray-500 mb-6">
                    Structured trail of editor and admin actions. Read-only.
                </p>

                {error && (
                    <div role="alert" className="mb-3 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : entries.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                        No audit entries match your filters.
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                        {entries.map((e) => (
                            <div key={e.id} className="p-4 flex items-start gap-4 hover:bg-gray-50">
                                <div className="w-24 flex-shrink-0 text-[11px] text-gray-400">
                                    {new Date(e.created_at).toLocaleString()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                                            {e.action}
                                        </span>
                                        {e.target_type && (
                                            <span className="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                                                {e.target_type}#{e.target_id}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-700 mt-1">
                                        <span className="font-semibold">{e.actor_email || 'system'}</span>
                                        {e.ip_address && (
                                            <span className="text-xs text-gray-400 ml-2">from {e.ip_address}</span>
                                        )}
                                    </p>
                                    {e.meta && Object.keys(e.meta).length > 0 && (
                                        <pre className="mt-2 text-[11px] bg-gray-900 text-emerald-200 rounded p-2 overflow-x-auto">
                                            {JSON.stringify(e.meta, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorAuditLogPage;
