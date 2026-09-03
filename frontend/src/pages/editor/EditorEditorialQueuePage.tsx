import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import BackButton from '../../components/common/BackButton';

/*
 * Editorial Queue (JG-Editor-Queue).
 *
 * A single filterable inbox surfacing everything the editor needs to
 * touch, in four buckets:
 *   - New Revisions       — resubmissions awaiting editor assessment
 *   - New Submissions     — early-pipeline manuscripts
 *   - Reviews Completed   — every review is in; a decision can be made
 *   - Decisions Pending   — under review with overdue reviewers +
 *                           at least one report already in
 *
 * The queue is deterministic — every category is derived from database
 * facts (Notification events, submission status, review state). No LLM.
 */

interface QueueItem {
    submission_id: string;
    paper_id_code: string | null;
    paper_title: string;
    author_name: string | null;
    submitted_at: string | null;
    status: string;
    round_number: number;
    previous_decision: string | null;
    kind: string;
}

interface QueueResponse {
    counts: Record<string, number>;
    revisions_submitted: QueueItem[];
    new_submissions: QueueItem[];
    reviews_completed: QueueItem[];
    decisions_pending: QueueItem[];
}

type TabKey = 'revisions_submitted' | 'new_submissions' | 'reviews_completed' | 'decisions_pending' | 'all';

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

const TAB_LABELS: Record<Exclude<TabKey, 'all'>, string> = {
    revisions_submitted: 'New Revisions',
    new_submissions:     'New Submissions',
    reviews_completed:   'Reviews Completed',
    decisions_pending:   'Decisions Pending',
};

const TAB_TONES: Record<Exclude<TabKey, 'all'>, string> = {
    revisions_submitted: 'text-rose-700',
    new_submissions:     'text-blue-700',
    reviews_completed:   'text-emerald-700',
    decisions_pending:   'text-amber-800',
};

const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDateTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const targetFor = (item: QueueItem): string => {
    switch (item.kind) {
        case 'revision':          return `/editor/submissions/${item.submission_id}/revision-assessment`;
        case 'reviews_completed': return `/editor/submissions/${item.submission_id}/decision`;
        case 'decision_pending':  return `/editor/bid-room/${item.submission_id}`;
        default:                  return `/editor/manuscripts/${item.submission_id}`;
    }
};

const EditorEditorialQueuePage: React.FC = () => {
    const [data, setData] = useState<QueueResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>('revisions_submitted');

    useEffect(() => {
        setLoading(true);
        client.get('/editor-portal/queue', { headers: editorAuthHeader() })
            .then((r) => setData(r.data))
            .catch((e: any) => setError(e?.response?.data?.detail || e?.message || 'Could not load the queue.'))
            .finally(() => setLoading(false));
    }, []);

    const items = useMemo(() => {
        if (!data) return [] as QueueItem[];
        if (tab === 'all') {
            return [
                ...data.revisions_submitted,
                ...data.new_submissions,
                ...data.reviews_completed,
                ...data.decisions_pending,
            ];
        }
        return data[tab] || [];
    }, [data, tab]);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />

                <div className="mb-6">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Editor</div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">Editorial Queue</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Everything the editorial office needs to touch, in one place.
                        Backend-derived — the counts always match reality.
                    </p>
                </div>

                {/* Counter tiles */}
                {data && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <CounterTile
                            label="🔴 New Revisions" tone="rose"
                            value={data.counts.revisions_submitted}
                            active={tab === 'revisions_submitted'}
                            onClick={() => setTab('revisions_submitted')}
                        />
                        <CounterTile
                            label="🆕 New Submissions" tone="blue"
                            value={data.counts.new_submissions}
                            active={tab === 'new_submissions'}
                            onClick={() => setTab('new_submissions')}
                        />
                        <CounterTile
                            label="✅ Reviews Completed" tone="emerald"
                            value={data.counts.reviews_completed}
                            active={tab === 'reviews_completed'}
                            onClick={() => setTab('reviews_completed')}
                        />
                        <CounterTile
                            label="🟡 Decisions Pending" tone="amber"
                            value={data.counts.decisions_pending}
                            active={tab === 'decisions_pending'}
                            onClick={() => setTab('decisions_pending')}
                        />
                    </div>
                )}

                {/* Filter tabs */}
                <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-4 text-xs font-semibold w-fit">
                    <TabButton k="all" activeTab={tab} onSelect={setTab} label="All" />
                    {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((k) => (
                        <TabButton
                            key={k} k={k} activeTab={tab} onSelect={setTab}
                            label={TAB_LABELS[k]}
                            count={data ? data.counts[k] : undefined}
                        />
                    ))}
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-6 text-center text-sm text-gray-500">Loading queue…</div>
                    ) : error ? (
                        <div className="p-6 text-sm text-rose-800">{error}</div>
                    ) : items.length === 0 ? (
                        <div className="p-10 text-center text-sm text-gray-500">
                            Nothing in this bucket right now.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Manuscript</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Title</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
                                    <th className="text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Submitted</th>
                                    <th className="text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((it) => (
                                    <tr key={`${it.submission_id}-${it.kind}`} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                                            {it.paper_id_code || it.submission_id.slice(0, 8)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-semibold text-gray-900 line-clamp-1">{it.paper_title}</div>
                                            <div className="text-[11px] text-gray-500 truncate">
                                                {it.author_name || '—'}
                                                {it.previous_decision && ` · previous: ${it.previous_decision.replace(/_/g, ' ')}`}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <KindPill kind={it.kind} roundNumber={it.round_number} />
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                                            {fmtDate(it.submitted_at)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                to={targetFor(it)}
                                                className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800"
                                            >
                                                {it.kind === 'revision' ? 'Review revision →' : 'Open →'}
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Small pieces ──────────────────────────────────────────

const CounterTile: React.FC<{ label: string; value: number; tone: 'rose' | 'blue' | 'emerald' | 'amber'; active: boolean; onClick: () => void }> = ({
    label, value, tone, active, onClick,
}) => {
    const styles = {
        rose:    'from-rose-50 border-rose-200 text-rose-900',
        blue:    'from-blue-50 border-blue-200 text-blue-900',
        emerald: 'from-emerald-50 border-emerald-200 text-emerald-900',
        amber:   'from-amber-50 border-amber-200 text-amber-900',
    }[tone];
    return (
        <button
            type="button" onClick={onClick}
            className={
                'text-left rounded-xl border-2 p-4 bg-gradient-to-br to-white transition ' +
                styles + ' ' +
                (active ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:brightness-105')
            }
        >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
            <div className="text-3xl font-black mt-1">{value ?? 0}</div>
        </button>
    );
};

const TabButton: React.FC<{
    k: TabKey; activeTab: TabKey; onSelect: (k: TabKey) => void; label: string; count?: number;
}> = ({ k, activeTab, onSelect, label, count }) => (
    <button
        type="button" onClick={() => onSelect(k)}
        className={
            'px-3 py-1.5 rounded-md flex items-center gap-1.5 ' +
            (activeTab === k ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900')
        }
    >
        {label}
        {typeof count === 'number' && count > 0 && (
            <span className="text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {count > 99 ? '99+' : count}
            </span>
        )}
    </button>
);

const KindPill: React.FC<{ kind: string; roundNumber: number }> = ({ kind, roundNumber }) => {
    const spec = {
        revision:          { label: `Revision R${roundNumber}`,   cls: 'bg-rose-100 text-rose-800' },
        new:               { label: 'New submission',              cls: 'bg-blue-100 text-blue-800' },
        reviews_completed: { label: 'Reviews complete',            cls: 'bg-emerald-100 text-emerald-800' },
        decision_pending:  { label: 'Decision pending',            cls: 'bg-amber-100 text-amber-900' },
    }[kind] || { label: kind, cls: 'bg-gray-100 text-gray-700' };
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${spec.cls}`}>
            {spec.label}
        </span>
    );
};

export default EditorEditorialQueuePage;
