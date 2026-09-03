import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../components/ui';
import { Table } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import {
    NewSubmissionRow,
    listNewSubmissions,
} from '../api/editorScreening';

// New Submissions list — the editor's starting point for newly
// submitted manuscripts. Filters + search + one-click Review action
// per row. Rows leave this list the moment the editor takes a
// screening decision on them.

const PRIORITY_META: Record<string, { label: string; cls: string; icon: string }> = {
    fast_track:    { label: 'Fast track',    cls: 'bg-rose-100 text-rose-800 border-rose-200',       icon: '🔴' },
    special_issue: { label: 'Special issue', cls: 'bg-amber-100 text-amber-900 border-amber-200',    icon: '🟡' },
    invited:       { label: 'Invited',       cls: 'bg-purple-100 text-purple-800 border-purple-200', icon: '💌' },
    normal:        { label: 'Normal',        cls: 'bg-gray-100 text-gray-700 border-gray-200',       icon: '⚪' },
};

const CHECK_META: Record<string, { label: string; cls: string }> = {
    passed:  { label: '✓',  cls: 'text-emerald-600' },
    warning: { label: '⚠',  cls: 'text-amber-600' },
    flagged: { label: '⚠',  cls: 'text-rose-600' },
    pending: { label: '…',  cls: 'text-gray-400' },
};

const humanDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

const EditorNewSubmissionsPage: React.FC = () => {
    const [rows, setRows] = useState<NewSubmissionRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [articleType, setArticleType] = useState('');
    const [sinceDays, setSinceDays] = useState<number | undefined>(undefined);
    const toast = useToast();

    const reload = useMemo(() => async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listNewSubmissions({
                q: q.trim() || undefined,
                article_type: articleType || undefined,
                since_days: sinceDays,
            });
            setRows(res.submissions);
            setTotal(res.total);
        } catch (e: any) {
            const msg = e?.response?.data?.detail || e?.message || 'Could not load new submissions.';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [q, articleType, sinceDays, toast]);

    useEffect(() => {
        reload();
    }, [reload]);

    const articleTypes = useMemo(() => {
        const s = new Set<string>();
        rows.forEach((r) => r.article_type && s.add(r.article_type));
        return Array.from(s).sort();
    }, [rows]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-6xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="📥"
                    title={`New Submissions (${total})`}
                    subtitle="Manuscripts awaiting initial editorial screening"
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {/* ── Filters row ── */}
                <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 mb-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-wrap gap-1">
                            <FilterChip active={sinceDays === undefined} onClick={() => setSinceDays(undefined)}>All</FilterChip>
                            <FilterChip active={sinceDays === 1}       onClick={() => setSinceDays(1)}>Today</FilterChip>
                            <FilterChip active={sinceDays === 7}       onClick={() => setSinceDays(7)}>This week</FilterChip>
                        </div>
                        <select
                            value={articleType}
                            onChange={(e) => setArticleType(e.target.value)}
                            className="border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm px-2 py-1.5"
                        >
                            <option value="">All article types</option>
                            {articleTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <div className="flex-1 min-w-[220px]">
                            <input
                                type="search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search manuscript ID, title, author…"
                                className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm px-3 py-1.5"
                            />
                        </div>
                    </div>
                </section>

                {loading ? (
                    <LoadingIndicator label="Loading queue…" fullPage />
                ) : (
                    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                        <Table<NewSubmissionRow>
                            columns={[
                                {
                                    key: 'id',
                                    header: 'ID',
                                    width: '140px',
                                    render: (r) => (
                                        <Link
                                            to={`/editor/screening/${r.submission_id}`}
                                            className="font-mono text-xs text-blue-700 hover:underline"
                                        >
                                            {r.manuscript_id}
                                        </Link>
                                    ),
                                },
                                {
                                    key: 'title',
                                    header: 'Title',
                                    render: (r) => (
                                        <div className="min-w-0">
                                            <Link
                                                to={`/editor/screening/${r.submission_id}`}
                                                className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-700 line-clamp-2"
                                            >
                                                {r.title}
                                            </Link>
                                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                                                {r.corresponding_author} · {r.author_email}
                                            </p>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'type',
                                    header: 'Type',
                                    width: '140px',
                                    render: (r) => (
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                            {r.article_type}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'submitted',
                                    header: 'Submitted',
                                    width: '150px',
                                    render: (r) => (
                                        <div>
                                            <p className="text-xs text-gray-900 dark:text-gray-100">{humanDate(r.submitted_at)}</p>
                                            <p className="text-[11px] text-gray-500">
                                                {r.age_days} day{r.age_days === 1 ? '' : 's'} ago
                                            </p>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'priority',
                                    header: 'Priority',
                                    width: '120px',
                                    render: (r) => {
                                        const p = PRIORITY_META[r.priority] || PRIORITY_META.normal;
                                        return (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${p.cls}`}>
                                                {p.icon} {p.label}
                                            </span>
                                        );
                                    },
                                },
                                {
                                    key: 'screening',
                                    header: 'Screening',
                                    width: '140px',
                                    render: (r) => (
                                        <div className="flex items-center gap-1 flex-wrap" title={r.screening.map((c) => `${c.label}: ${c.state}`).join('\n')}>
                                            {r.screening.map((c) => {
                                                const m = CHECK_META[c.state] || CHECK_META.pending;
                                                return (
                                                    <span key={c.key} className={`text-xs font-bold ${m.cls}`}>
                                                        {m.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ),
                                },
                                {
                                    key: 'action',
                                    header: 'Action',
                                    width: '100px',
                                    align: 'right',
                                    render: (r) => (
                                        <Link
                                            to={`/editor/screening/${r.submission_id}`}
                                            className="inline-block px-3 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                                        >
                                            Review
                                        </Link>
                                    ),
                                },
                            ]}
                            rows={rows}
                            rowKey={(r) => r.submission_id}
                            empty={
                                <div className="py-4">
                                    <p className="text-lg mb-1">🎉</p>
                                    <p>No manuscripts are waiting for editorial screening right now.</p>
                                </div>
                            }
                        />
                    </section>
                )}
            </div>
        </div>
    );
};

const FilterChip: React.FC<{
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={
            'px-3 py-1 rounded-full text-xs font-semibold border transition ' +
            (active
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800')
        }
    >
        {children}
    </button>
);

export default EditorNewSubmissionsPage;
