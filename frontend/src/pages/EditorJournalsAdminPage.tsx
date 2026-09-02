import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Journal } from '../types';
import {
    fetchJournals,
    createJournal,
    activateJournal,
    fetchTenancyHealth,
    TenancyHealthReport,
} from '../api/journals';

/*
 * Multi-Journal Tenancy Admin (JG-501).
 *
 * The Journal model already supports multiple rows, but there was no UI
 * to see them, activate one, or add another. This page fixes that.
 *
 * Runs alongside the Multi-Journal Tenancy Health Agent — a deterministic
 * backend audit (backend/app/routers/journals.py::tenancy_health_agent)
 * that reports per-journal identity completeness and tenancy-wide
 * invariants (exactly one active row, no duplicate ISSNs).
 */

const REQUIRED_HINTS = [
    'title', 'issn_online', 'publisher_name', 'abbreviation',
    'subject_area', 'language', 'doi_prefix', 'email_editorial',
];

function CompletenessBar({ pct }: { pct: number }) {
    const bg = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-500';
    return (
        <div className="w-32 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

export default function EditorJournalsAdminPage() {
    const [journals, setJournals] = useState<Journal[]>([]);
    const [health, setHealth] = useState<TenancyHealthReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newIssn, setNewIssn] = useState('');
    const [newPublisher, setNewPublisher] = useState('');
    const [creating, setCreating] = useState(false);

    const refresh = async () => {
        setLoading(true); setError(null);
        try {
            const [rows, report] = await Promise.all([
                fetchJournals(), fetchTenancyHealth(),
            ]);
            setJournals(rows); setHealth(report);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not load journals.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { refresh(); }, []);

    const handleActivate = async (id: number) => {
        if (!window.confirm('Make this journal the active masthead? Other journals will be deactivated.')) return;
        setBusyId(id); setError(null);
        try {
            await activateJournal(id);
            await refresh();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not activate journal.');
        } finally {
            setBusyId(null);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        setCreating(true); setError(null);
        try {
            await createJournal({
                title: newTitle.trim(),
                issn_online: newIssn.trim() || undefined,
                publisher_name: newPublisher.trim() || undefined,
            } as any);
            setNewTitle(''); setNewIssn(''); setNewPublisher('');
            setShowCreate(false);
            await refresh();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not create journal.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-5xl mx-auto">
                <div className="mb-4">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Tenancy</div>
                        <h1 className="text-2xl font-black text-gray-900 mt-1">Journals Admin</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            The platform can host multiple journal tenants. One row is active at a time; that row drives the masthead, DOI metadata, and citation export.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowCreate((v) => !v)}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800"
                    >
                        {showCreate ? 'Cancel' : '+ New journal'}
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
                )}

                {/* Tenancy Health Agent — invariants */}
                {health && health.invariants.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-2 mb-2">
                            Tenancy Health
                            <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agent</span>
                        </div>
                        <ul className="space-y-1">
                            {health.invariants.map((inv, i) => (
                                <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
                                    <span aria-hidden>{inv.severity === 'critical' ? '⚠' : inv.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                                    <span>{inv.message}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Create form */}
                {showCreate && (
                    <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 space-y-3">
                        <div className="text-sm font-bold text-gray-900">Add a new journal tenant</div>
                        <div>
                            <label className="text-xs font-semibold text-gray-700">Title <span className="text-rose-600">*</span></label>
                            <input
                                type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-gray-700">ISSN (online)</label>
                                <input type="text" value={newIssn} onChange={(e) => setNewIssn(e.target.value)} placeholder="XXXX-XXXX"
                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-700">Publisher</label>
                                <input type="text" value={newPublisher} onChange={(e) => setNewPublisher(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            You can complete the rest of the identity fields (subject area, DOI prefix, etc.) after creation from the Journal Identity page.
                        </p>
                        <button
                            type="submit" disabled={creating}
                            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {creating ? 'Creating…' : 'Create journal'}
                        </button>
                    </form>
                )}

                {/* Journals table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
                    ) : journals.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-sm">
                            No journals configured. Click "+ New journal" to add one.
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Journal</th>
                                    <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Identity</th>
                                    <th className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                                    <th className="text-right text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {journals.map((j: any) => {
                                    const jh = health?.journals.find((h) => h.id === j.id);
                                    return (
                                        <tr key={j.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900">{j.title}</div>
                                                {j.issn_online && (
                                                    <div className="text-xs text-gray-500">ISSN {j.issn_online}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {jh ? (
                                                    <div className="flex items-center gap-2">
                                                        <CompletenessBar pct={jh.completeness} />
                                                        <span className="text-xs text-gray-600">{jh.completeness}%</span>
                                                    </div>
                                                ) : <span className="text-xs text-gray-400">—</span>}
                                                {jh && jh.missing_fields.length > 0 && (
                                                    <div className="text-[11px] text-amber-700 mt-1">
                                                        Missing: {jh.missing_fields.slice(0, 3).join(', ')}
                                                        {jh.missing_fields.length > 3 && `, +${jh.missing_fields.length - 3} more`}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {j.is_active ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                                        ● Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {!j.is_active && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleActivate(j.id)}
                                                        disabled={busyId === j.id}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                                                    >
                                                        {busyId === j.id ? 'Activating…' : 'Make active'}
                                                    </button>
                                                )}
                                                <Link
                                                    to="/editor/journal-identity"
                                                    className="ml-2 text-xs font-semibold text-blue-700 hover:underline"
                                                >
                                                    Edit identity →
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <p className="mt-4 text-xs text-gray-500">
                    Required identity fields the agent checks: {REQUIRED_HINTS.join(', ')}.
                </p>
            </div>
        </div>
    );
}
