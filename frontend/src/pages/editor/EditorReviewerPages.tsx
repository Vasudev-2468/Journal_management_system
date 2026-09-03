import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import BackButton from '../../components/common/BackButton';
import { fetchReviewers } from '../../api/editor';

/*
 * Reviewer-module list pages.
 *
 * Three surfaces that share layout + auth glue:
 *   - Reviewer Pool  — the editor's reviewer directory
 *   - Active Reviews — assignments currently in-flight
 *   - Review History — every submitted review, newest first
 *
 * Consolidated in one file because the shell is identical and the
 * per-page differences are just the endpoint + columns. Keeps the
 * route table simple: three exports, three routes.
 */

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

// ── Reviewer Pool ────────────────────────────────────────

interface Reviewer {
    id: string;
    name: string;
    email: string;
    institution?: string | null;
    expertise_tags?: string[];
    current_load?: number;
    max_assignments?: number;
    is_active?: boolean;
}

export const EditorReviewerPoolPage: React.FC = () => {
    const [rows, setRows] = useState<Reviewer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useSearchParams();
    const q = (search.get('q') || '').toLowerCase();

    useEffect(() => {
        setLoading(true);
        fetchReviewers({})
            .then((data: any) => setRows(Array.isArray(data) ? data : (data?.items || [])))
            .catch((e: any) => setError(e?.response?.data?.detail || 'Could not load reviewer pool.'))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() =>
        !q ? rows : rows.filter((r) =>
            r.name.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            (r.institution || '').toLowerCase().includes(q) ||
            (r.expertise_tags || []).some((t) => t.toLowerCase().includes(q)),
        ),
    [rows, q]);

    return (
        <PageShell
            icon="👥" title="Reviewer Pool"
            subtitle="The editor's reviewer directory. Click a name to see stats + review history."
            breadcrumb="Reviewers › Reviewer Pool"
            searchValue={q}
            onSearch={(v) => setSearch(v ? { q: v } : {})}
            searchPlaceholder="Search by name, email, institution, or expertise…"
        >
            {loading ? <ShellLoading />
             : error ? <ShellError text={error} />
             : filtered.length === 0 ? <ShellEmpty text="No reviewers match this search." />
             : (
                <ListTable
                    columns={['Reviewer', 'Expertise', 'Load', 'Status', '']}
                    rows={filtered.map((r) => ({
                        key: r.id,
                        cells: [
                            <div key="n">
                                <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                                <div className="text-xs text-gray-500 truncate">{r.email}</div>
                                {r.institution && <div className="text-[11px] text-gray-500">{r.institution}</div>}
                            </div>,
                            <div key="t" className="flex flex-wrap gap-1">
                                {(r.expertise_tags || []).slice(0, 5).map((t) => (
                                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800">
                                        {t}
                                    </span>
                                ))}
                            </div>,
                            <span key="l" className="font-mono text-xs">
                                {(r.current_load ?? 0)} / {(r.max_assignments ?? 5)}
                            </span>,
                            <span key="s" className={
                                'text-[11px] font-bold px-2 py-0.5 rounded-full ' +
                                (r.is_active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-gray-200 text-gray-600')
                            }>
                                {r.is_active ? 'Active' : 'Inactive'}
                            </span>,
                            <Link key="a" to={`/editor/reviewers/${r.id}`} className="text-xs text-blue-700 hover:underline font-semibold">
                                Profile →
                            </Link>,
                        ],
                    }))}
                />
            )}
        </PageShell>
    );
};

// ── Active Reviews + Review History (shared data + shell) ──

interface ActivityItem {
    review_id: string;
    reviewer_id: string | null;
    reviewer_name: string | null;
    reviewer_email: string | null;
    submission_id: string;
    paper_id_code: string | null;
    paper_title: string;
    round_number: number;
    state: string | null;
    status: string | null;
    assigned_at: string | null;
    accepted_at: string | null;
    completed_at: string | null;
    link_expires_at: string | null;
    recommendation: string | null;
    is_overdue: boolean;
}

const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const useReviewActivity = (filter: 'active' | 'history') => {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setLoading(true);
        client.get(`/reviewers/activity?filter=${filter}`, { headers: editorAuthHeader() })
            .then((r) => setItems(r.data?.items || []))
            .catch((e: any) => setError(e?.response?.data?.detail || 'Could not load reviews.'))
            .finally(() => setLoading(false));
    }, [filter]);
    return { items, loading, error };
};

export const EditorActiveReviewsPage: React.FC = () => {
    const { items, loading, error } = useReviewActivity('active');
    const [search, setSearch] = useSearchParams();
    const q = (search.get('q') || '').toLowerCase();
    const filtered = useMemo(() =>
        !q ? items : items.filter((it) =>
            (it.paper_id_code || '').toLowerCase().includes(q) ||
            it.paper_title.toLowerCase().includes(q) ||
            (it.reviewer_name || '').toLowerCase().includes(q),
        ), [items, q]);

    return (
        <PageShell
            icon="🕒" title="Active Reviews"
            subtitle="Assignments the reviewer has accepted but not yet submitted. Overdue rows are flagged red."
            breadcrumb="Reviewers › Active Reviews"
            searchValue={q}
            onSearch={(v) => setSearch(v ? { q: v } : {})}
            searchPlaceholder="Search by manuscript ID or reviewer…"
        >
            {loading ? <ShellLoading />
             : error ? <ShellError text={error} />
             : filtered.length === 0 ? <ShellEmpty text="No active reviews right now." />
             : (
                <ListTable
                    columns={['Manuscript', 'Reviewer', 'Round', 'Accepted', 'Due', 'State', '']}
                    rows={filtered.map((it) => ({
                        key: it.review_id,
                        rowClass: it.is_overdue ? 'bg-rose-50/40' : '',
                        cells: [
                            <div key="m">
                                <div className="font-mono text-xs text-gray-500">{it.paper_id_code || it.submission_id.slice(0, 8)}</div>
                                <div className="text-sm font-semibold text-gray-900 line-clamp-1 max-w-md">{it.paper_title}</div>
                            </div>,
                            <div key="r">
                                <div className="text-sm font-semibold text-gray-900">{it.reviewer_name || '—'}</div>
                                <div className="text-[11px] text-gray-500">{it.reviewer_email || ''}</div>
                            </div>,
                            <span key="rn" className="text-xs font-semibold text-gray-700">R{it.round_number}</span>,
                            <span key="a" className="text-xs text-gray-600">{fmtDate(it.accepted_at || it.assigned_at)}</span>,
                            <span key="d" className={'text-xs font-semibold ' + (it.is_overdue ? 'text-rose-800' : 'text-gray-600')}>
                                {fmtDate(it.link_expires_at)}
                                {it.is_overdue && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold uppercase">Overdue</span>}
                            </span>,
                            <span key="s" className="text-[11px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 uppercase">{(it.state || 'in progress').replace(/_/g, ' ')}</span>,
                            <Link key="a2" to={`/editor/bid-room/${it.submission_id}`} className="text-xs text-blue-700 hover:underline font-semibold">
                                Manage →
                            </Link>,
                        ],
                    }))}
                />
            )}
        </PageShell>
    );
};

export const EditorReviewHistoryPage: React.FC = () => {
    const { items, loading, error } = useReviewActivity('history');
    const [search, setSearch] = useSearchParams();
    const q = (search.get('q') || '').toLowerCase();
    const filtered = useMemo(() =>
        !q ? items : items.filter((it) =>
            (it.paper_id_code || '').toLowerCase().includes(q) ||
            it.paper_title.toLowerCase().includes(q) ||
            (it.reviewer_name || '').toLowerCase().includes(q) ||
            (it.recommendation || '').toLowerCase().includes(q),
        ), [items, q]);

    return (
        <PageShell
            icon="📜" title="Review History"
            subtitle="Every submitted review, newest first. Round-by-round audit trail preserved across revisions."
            breadcrumb="Reviewers › Review History"
            searchValue={q}
            onSearch={(v) => setSearch(v ? { q: v } : {})}
            searchPlaceholder="Search by reviewer, manuscript, or recommendation…"
        >
            {loading ? <ShellLoading />
             : error ? <ShellError text={error} />
             : filtered.length === 0 ? <ShellEmpty text="No submitted reviews yet." />
             : (
                <ListTable
                    columns={['Reviewer', 'Manuscript', 'Round', 'Submitted', 'Recommendation', '']}
                    rows={filtered.map((it) => ({
                        key: it.review_id,
                        cells: [
                            <div key="r">
                                <div className="text-sm font-semibold text-gray-900">{it.reviewer_name || '—'}</div>
                                <div className="text-[11px] text-gray-500">{it.reviewer_email || ''}</div>
                            </div>,
                            <div key="m">
                                <div className="font-mono text-xs text-gray-500">{it.paper_id_code || it.submission_id.slice(0, 8)}</div>
                                <div className="text-sm text-gray-800 line-clamp-1 max-w-md">{it.paper_title}</div>
                            </div>,
                            <span key="rn" className="text-xs font-semibold text-gray-700">R{it.round_number}</span>,
                            <span key="s" className="text-xs text-gray-600">{fmtDate(it.completed_at)}</span>,
                            <span key="rec" className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                                {(it.recommendation || '—').replace(/_/g, ' ')}
                            </span>,
                            <Link key="a" to={`/editor/reviewer-reports/${it.submission_id}`} className="text-xs text-blue-700 hover:underline font-semibold">
                                View →
                            </Link>,
                        ],
                    }))}
                />
            )}
        </PageShell>
    );
};

// ── Shared shell pieces ──────────────────────────────────

const PageShell: React.FC<{
    icon: string;
    title: string;
    subtitle: string;
    breadcrumb: string;
    searchValue: string;
    onSearch: (v: string) => void;
    searchPlaceholder: string;
    children: React.ReactNode;
}> = ({ icon, title, subtitle, breadcrumb, searchValue, onSearch, searchPlaceholder, children }) => (
    <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
        <div className="max-w-6xl mx-auto">
            <BackButton className="mb-4" />
            <div className="text-xs text-gray-500 mb-1">{breadcrumb}</div>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <span aria-hidden>{icon}</span> {title}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">{subtitle}</p>
                </div>
                <input
                    type="search"
                    value={searchValue}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
            </div>
            {children}
        </div>
    </div>
);

const ShellLoading = () => (
    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">Loading…</div>
);
const ShellError = ({ text }: { text: string }) => (
    <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-800">{text}</div>
);
const ShellEmpty = ({ text }: { text: string }) => (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">{text}</div>
);

const ListTable: React.FC<{
    columns: string[];
    rows: { key: string; cells: React.ReactNode[]; rowClass?: string }[];
}> = ({ columns, rows }) => (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                    {columns.map((c, i) => (
                        <th key={i} className={
                            'text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3 ' +
                            (i === columns.length - 1 ? 'text-right' : '')
                        }>
                            {c}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                    <tr key={r.key} className={'hover:bg-gray-50 align-top ' + (r.rowClass || '')}>
                        {r.cells.map((c, i) => (
                            <td key={i} className={'px-4 py-3 ' + (i === r.cells.length - 1 ? 'text-right' : '')}>
                                {c}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
