import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import BackButton from '../../components/common/BackButton';
import { fetchSubmissions } from '../../api/editor';

/*
 * Shared submission-list page.
 *
 * The Editor Portal exposes several near-identical list surfaces:
 *   - Revision Required — status ∈ {revision_requested, returned_to_author}
 *   - Accepted          — status = accepted (post-acceptance pipeline)
 *   - Rejected          — status ∈ {rejected, reject_and_resubmit}
 *
 * Rather than three copy-pasted files, this component takes a
 * ``variant`` prop and derives the columns, empty-state text, and per-
 * row action from a config table below. Each variant hits the same
 * ``/submissions/`` endpoint (which the router already gates for
 * editors) and, for the Accepted variant, layers a per-row publication
 * checklist that reads live DOI / production / proof status.
 */

type Variant = 'revision_required' | 'accepted' | 'rejected';

interface Submission {
    id: string;
    paper_id_code: string | null;
    paper_title: string;
    status: string;
    submitted_at?: string;
    updated_at?: string;
    author_name?: string | null;
    author_email?: string | null;
}

const VARIANT_CONFIG: Record<Variant, {
    title: string;
    subtitle: string;
    icon: string;
    statuses: string[];
    emptyMessage: string;
    actionLabel: (s: Submission) => string;
    actionUrl: (s: Submission) => string;
    breadcrumb: string;
    accent: string;
}> = {
    revision_required: {
        title: 'Revision Required',
        subtitle: 'Papers awaiting the author\'s revision, and revisions the author has resubmitted.',
        icon: '✏️',
        statuses: ['revision_requested', 'returned_to_author'],
        emptyMessage: 'No manuscripts currently require revision.',
        actionLabel: () => 'Open',
        actionUrl: (s) => `/editor/manuscripts/${s.id}`,
        breadcrumb: 'Submissions › Revision Required',
        accent: 'border-amber-400 bg-amber-50/40',
    },
    accepted: {
        title: 'Accepted',
        subtitle: 'Accepted manuscripts in the post-acceptance pipeline. Accepted ≠ Published — DOI, production and proof still need to complete.',
        icon: '🟢',
        statuses: ['accepted'],
        emptyMessage: 'No accepted manuscripts in the pipeline yet.',
        actionLabel: () => 'Manage',
        actionUrl: (s) => `/editor/manuscripts/${s.id}`,
        breadcrumb: 'Decisions › Accepted',
        accent: 'border-emerald-400 bg-emerald-50/40',
    },
    rejected: {
        title: 'Rejected',
        subtitle: 'Closed decision history. Rejected manuscripts do not enter the DOI / production / publication pipeline.',
        icon: '🔴',
        statuses: ['rejected', 'reject_and_resubmit'],
        emptyMessage: 'No rejected manuscripts on record.',
        actionLabel: () => 'View',
        actionUrl: (s) => `/editor/manuscripts/${s.id}`,
        breadcrumb: 'Decisions › Rejected',
        accent: 'border-rose-400 bg-rose-50/40',
    },
};

interface Props { variant: Variant }

const EditorSubmissionListPage: React.FC<Props> = ({ variant }) => {
    const cfg = VARIANT_CONFIG[variant];
    const [rows, setRows] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useSearchParams();
    const q = (search.get('q') || '').toLowerCase();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all(cfg.statuses.map((st) => fetchSubmissions({ status: st, page_size: 100 })))
            .then((results) => {
                if (cancelled) return;
                const merged: Submission[] = [];
                for (const r of results) {
                    const list = Array.isArray(r) ? r : ((r as any)?.items || (r as any)?.results || []);
                    for (const s of list) merged.push(s);
                }
                merged.sort(
                    (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime(),
                );
                setRows(merged);
            })
            .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.detail || 'Could not load submissions.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [variant, cfg.statuses.join(',')]);

    const filtered = useMemo(() => {
        if (!q) return rows;
        return rows.filter((s) =>
            (s.paper_id_code || '').toLowerCase().includes(q) ||
            (s.paper_title || '').toLowerCase().includes(q) ||
            (s.author_name || '').toLowerCase().includes(q),
        );
    }, [rows, q]);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-6xl mx-auto">
                <BackButton className="mb-4" />
                <div className="text-xs text-gray-500 mb-1">{cfg.breadcrumb}</div>
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <span aria-hidden>{cfg.icon}</span> {cfg.title}
                            <span className="ml-2 text-sm font-semibold text-gray-500">{filtered.length}</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">{cfg.subtitle}</p>
                    </div>
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => setSearch(e.target.value ? { q: e.target.value } : {})}
                        placeholder="Search by ID, title, or author…"
                        className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </div>

                {loading ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">Loading…</div>
                ) : error ? (
                    <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-800">{error}</div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
                        {q ? 'No results for this search.' : cfg.emptyMessage}
                    </div>
                ) : (
                    <div className={`bg-white rounded-2xl border-l-4 ${cfg.accent} border border-gray-200 overflow-hidden`}>
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Manuscript</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Title</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Author</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
                                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((s) => (
                                    <tr key={s.id} className="hover:bg-gray-50 align-top">
                                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.paper_id_code || s.id.slice(0, 8)}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-semibold text-gray-900 line-clamp-1">{s.paper_title}</div>
                                            {variant === 'accepted' && <AcceptedChecklistInline submission={s} />}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm text-gray-900 truncate">{s.author_name || '—'}</div>
                                            {s.author_email && (
                                                <a href={`mailto:${s.author_email}`} className="text-[11px] text-blue-700 hover:underline">
                                                    {s.author_email}
                                                </a>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-700">{s.status.replace(/_/g, ' ')}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                                            {s.updated_at ? new Date(s.updated_at).toLocaleDateString()
                                             : s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                to={cfg.actionUrl(s)}
                                                className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                            >
                                                {cfg.actionLabel(s)} →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Accepted-only inline checklist ─────────────────────
//
// For the Accepted variant every row shows a small chip strip:
// Decision · Final files · DOI · Production · Proof. The strip renders
// from the article record if one is already linked; the check is a
// pragmatic best-effort (a full pub-eligibility check runs server-side
// when the editor clicks "Assign DOI").

const AcceptedChecklistInline: React.FC<{ submission: Submission }> = ({ submission }) => {
    const [state, setState] = useState<{
        decision: boolean;
        final_files: boolean;
        doi: boolean;
        production: boolean;
        proof: boolean;
    } | null>(null);

    useEffect(() => {
        // Best-effort lookup: our production surface is not required for
        // the row to render. If the endpoint doesn't exist yet or the
        // article isn't linked, we show the "known-from-status" defaults.
        let cancelled = false;
        client.get(`/submissions/${submission.id}/publication-status`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('editor_token') || ''}` },
        })
            .then((r) => { if (!cancelled) setState(r.data); })
            .catch(() => {
                if (!cancelled) setState({
                    decision: true,          // accepted ⇒ decision made
                    final_files: false, doi: false, production: false, proof: false,
                });
            });
        return () => { cancelled = true; };
    }, [submission.id]);

    if (!state) return null;
    const chips: [string, boolean][] = [
        ['Decision', state.decision],
        ['Final files', state.final_files],
        ['DOI', state.doi],
        ['Production', state.production],
        ['Proof', state.proof],
    ];
    return (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map(([label, done]) => (
                <span
                    key={label}
                    className={
                        'inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ' +
                        (done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')
                    }
                >
                    {done ? '✓' : '⚠'} {label}
                </span>
            ))}
        </div>
    );
};

export default EditorSubmissionListPage;
