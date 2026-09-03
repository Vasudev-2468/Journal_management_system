import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import BackButton from '../../components/common/BackButton';

/*
 * Pending Actions — the editor's operational inbox.
 *
 * Only items that require an editor action appear here. Informational
 * events (reviewer accepted, DOI registered, paper published) are
 * deliberately excluded — the JG-Pending-Actions spec calls this out.
 *
 * The backend derives every card from database facts, so the counts
 * always match what's in the system. This page just organises and
 * filters — no client-side computation.
 */

type Priority = 'urgent' | 'due_soon' | 'normal';
type Category =
    | 'urgent'
    | 'submissions'
    | 'peer_review'
    | 'revisions'
    | 'acceptance'
    | 'production'
    | 'exceptions';

interface ActionItem {
    id: string;
    kind: string;
    category: Category;
    priority: Priority;
    title: string;
    subtitle: string;
    cta_label: string;
    cta_url: string;
    meta: Record<string, string>;
}

interface PendingActionsResponse {
    total: number;
    priority_counts: Record<Priority, number>;
    category_counts: Record<string, number>;
    items: ActionItem[];
}

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

const CATEGORY_LABELS: Record<Category, string> = {
    urgent:       '🔴 Urgent',
    submissions:  '📝 Submissions',
    peer_review:  '👥 Peer Review',
    revisions:    '🔄 Revisions',
    acceptance:   '✅ Acceptance',
    production:   '📑 Production',
    exceptions:   '⚠ Exceptions',
};

const CATEGORY_ORDER: Category[] = [
    'submissions', 'peer_review', 'revisions', 'acceptance', 'production', 'exceptions',
];

const PRIORITY_STYLES: Record<Priority, { chip: string; icon: string; label: string; card: string }> = {
    urgent:    { chip: 'bg-rose-100 text-rose-800 border-rose-300',      icon: '🔴', label: 'Urgent',    card: 'border-l-4 border-rose-500' },
    due_soon:  { chip: 'bg-amber-100 text-amber-900 border-amber-300',    icon: '🟠', label: 'Due soon',  card: 'border-l-4 border-amber-500' },
    normal:    { chip: 'bg-blue-100 text-blue-800 border-blue-300',       icon: '🟡', label: 'Normal',    card: 'border-l-4 border-blue-300' },
};

const EditorPendingActionsPage: React.FC = () => {
    const [data, setData] = useState<PendingActionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');

    useEffect(() => {
        setLoading(true);
        client
            .get('/editor-portal/pending-actions', { headers: editorAuthHeader() })
            .then((r) => setData(r.data))
            .catch((e: any) => setError(e?.response?.data?.detail || e?.message || 'Could not load pending actions.'))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        if (!data) return [] as ActionItem[];
        return data.items.filter((it) => {
            if (priorityFilter !== 'all' && it.priority !== priorityFilter) return false;
            if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
            return true;
        });
    }, [data, priorityFilter, categoryFilter]);

    // Group filtered items by category so the display feels like an inbox.
    const grouped = useMemo(() => {
        const g: Record<string, ActionItem[]> = {};
        for (const it of filtered) {
            (g[it.category] = g[it.category] || []).push(it);
        }
        return g;
    }, [filtered]);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-6xl mx-auto">
                <BackButton className="mb-4" />

                <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Editor</div>
                        <h1 className="text-2xl font-black text-gray-900 mt-1">Pending Actions</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            The editor's operational inbox — only items that require action. Backend-derived.
                        </p>
                    </div>
                    {data && (
                        <div className="text-right">
                            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Total open</div>
                            <div className="text-3xl font-black text-gray-900">{data.total}</div>
                        </div>
                    )}
                </div>

                {/* Priority counter tiles */}
                {data && (
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {(['urgent', 'due_soon', 'normal'] as Priority[]).map((p) => (
                            <PriorityTile
                                key={p}
                                priority={p}
                                value={data.priority_counts[p] || 0}
                                active={priorityFilter === p}
                                onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)}
                            />
                        ))}
                    </div>
                )}

                {/* Category filter row */}
                <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-4 text-xs font-semibold">
                    <FilterChip
                        label="All"
                        count={data?.total}
                        active={categoryFilter === 'all'}
                        onClick={() => setCategoryFilter('all')}
                    />
                    {CATEGORY_ORDER.map((c) => (
                        <FilterChip
                            key={c}
                            label={CATEGORY_LABELS[c]}
                            count={data?.category_counts[c]}
                            active={categoryFilter === c}
                            onClick={() => setCategoryFilter(c)}
                        />
                    ))}
                </div>

                {/* Body */}
                {loading ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-500">
                        Loading actions…
                    </div>
                ) : error ? (
                    <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-800">{error}</div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
                        <div className="text-3xl mb-2">🎉</div>
                        Nothing to do here — inbox zero.
                    </div>
                ) : (
                    Object.entries(grouped)
                        .sort(([a], [b]) => CATEGORY_ORDER.indexOf(a as Category) - CATEGORY_ORDER.indexOf(b as Category))
                        .map(([cat, items]) => (
                            <section key={cat} className="mb-5">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                                    {CATEGORY_LABELS[cat as Category]} · {items.length}
                                </h2>
                                <div className="space-y-2">
                                    {items.map((it) => <ActionCard key={it.id} item={it} />)}
                                </div>
                            </section>
                        ))
                )}
            </div>
        </div>
    );
};

// ── Small helpers ──────────────────────────────────────

const PriorityTile: React.FC<{
    priority: Priority;
    value: number;
    active: boolean;
    onClick: () => void;
}> = ({ priority, value, active, onClick }) => {
    const spec = PRIORITY_STYLES[priority];
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                'text-left rounded-xl border-2 p-4 bg-white transition ' +
                (active ? 'ring-2 ring-offset-1 ring-blue-500 border-blue-400' : 'border-gray-200 hover:border-gray-300')
            }
        >
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{spec.label}</div>
            <div className="text-3xl font-black text-gray-900 mt-0.5">
                <span aria-hidden className="mr-2">{spec.icon}</span>
                {value}
            </div>
        </button>
    );
};

const FilterChip: React.FC<{
    label: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}> = ({ label, count, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={
            'px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap ' +
            (active ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900')
        }
    >
        {label}
        {typeof count === 'number' && count > 0 && (
            <span className="text-[10px] bg-gray-200 text-gray-800 rounded-full px-1.5 py-0.5 font-bold">
                {count > 99 ? '99+' : count}
            </span>
        )}
    </button>
);

const ActionCard: React.FC<{ item: ActionItem }> = ({ item }) => {
    const spec = PRIORITY_STYLES[item.priority];
    return (
        <div className={`bg-white rounded-lg shadow-sm ${spec.card} p-4`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${spec.chip}`}>
                            {spec.icon} {spec.label}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                            {item.kind.replace(/_/g, ' ')}
                        </span>
                    </div>
                    <div className="text-sm font-bold text-gray-900">{item.title}</div>
                    <div className="text-xs text-gray-600 mt-0.5 line-clamp-1">{item.subtitle}</div>
                    {Object.keys(item.meta).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(item.meta).map(([k, v]) => (
                                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-mono">
                                    {k.replace(/_/g, ' ')}: {v}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <Link
                    to={item.cta_url}
                    className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 whitespace-nowrap"
                >
                    {item.cta_label} →
                </Link>
            </div>
        </div>
    );
};

export default EditorPendingActionsPage;
