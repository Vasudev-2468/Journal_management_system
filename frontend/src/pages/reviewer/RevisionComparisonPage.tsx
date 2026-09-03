import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../../components/ui';
import { Table } from '../../components/ui/Table';
import {
    DiffResponse,
    VersionRow,
    fetchDiff,
    fetchVersions,
} from '../../api/revisionComparison';

// Revision Comparison V1 ↔ V2 page — the missing "what changed?" view
// for reviewers doing round 2 (and editors auditing revisions).

const humanBytes = (n: number | null | undefined): string => {
    if (!n && n !== 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const changeChip = (change: string) => {
    const cfg = {
        added:    { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'ADDED' },
        removed:  { cls: 'bg-rose-100 text-rose-800 border-rose-200',           label: 'REMOVED' },
        modified: { cls: 'bg-amber-100 text-amber-900 border-amber-200',        label: 'MODIFIED' },
        unchanged:{ cls: 'bg-gray-100 text-gray-700 border-gray-200',           label: 'UNCHANGED' },
    }[change] || { cls: 'bg-gray-100 text-gray-700', label: change.toUpperCase() };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
};

const RevisionComparisonPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [versions, setVersions] = useState<VersionRow[] | null>(null);
    const [diff, setDiff] = useState<DiffResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fromV, setFromV] = useState<number | null>(null);
    const [toV, setToV] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchVersions(submissionId)
            .then((rows) => {
                if (cancelled) return;
                setVersions(rows);
                if (rows.length >= 2) {
                    setToV(rows[0].version_number);
                    setFromV(rows[1].version_number);
                } else if (rows.length === 1) {
                    setToV(rows[0].version_number);
                    setFromV(rows[0].version_number);
                }
            })
            .catch((e: any) => {
                if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Could not load versions.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [submissionId]);

    useEffect(() => {
        if (fromV === null || toV === null || fromV === toV) {
            setDiff(null);
            return;
        }
        let cancelled = false;
        fetchDiff(submissionId, fromV, toV)
            .then((d) => { if (!cancelled) setDiff(d); })
            .catch((e: any) => {
                if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Could not compute diff.');
            });
        return () => { cancelled = true; };
    }, [submissionId, fromV, toV]);

    const versionOptions = useMemo(
        () => (versions || []).map((v) => ({
            value: v.version_number,
            label: `v${v.version_number} — ${v.label}`,
        })),
        [versions],
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="🔀"
                    title="Revision comparison"
                    subtitle={`Submission ${submissionId.slice(0, 8)}`}
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading versions…" fullPage />
                ) : !versions || versions.length === 0 ? (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center text-sm text-gray-500">
                        No manuscript versions on record yet.
                    </div>
                ) : versions.length === 1 ? (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center text-sm text-gray-500">
                        Only one version exists — nothing to compare yet.
                    </div>
                ) : (
                    <>
                        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
                            <div className="flex flex-wrap items-end gap-4">
                                <label className="text-sm">
                                    <span className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Compare from</span>
                                    <select
                                        value={fromV ?? ''}
                                        onChange={(e) => setFromV(Number(e.target.value))}
                                        className="border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm p-2"
                                    >
                                        {versionOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <span className="text-2xl text-gray-400 pb-1">→</span>
                                <label className="text-sm">
                                    <span className="text-xs uppercase tracking-wider text-gray-500 block mb-1">to</span>
                                    <select
                                        value={toV ?? ''}
                                        onChange={(e) => setToV(Number(e.target.value))}
                                        className="border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm p-2"
                                    >
                                        {versionOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </section>

                        {diff && (
                            <>
                                <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                                        <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                                            Author's summary of changes
                                        </h3>
                                        {diff.author_summary ? (
                                            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                                                {diff.author_summary}
                                            </pre>
                                        ) : (
                                            <p className="text-xs text-gray-500 italic">
                                                No summary provided with this revision.
                                            </p>
                                        )}
                                    </div>
                                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                                        <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                                            Response to reviewers
                                        </h3>
                                        {diff.response_to_reviewers ? (
                                            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                                                {diff.response_to_reviewers}
                                            </pre>
                                        ) : (
                                            <p className="text-xs text-gray-500 italic">
                                                No point-by-point response provided.
                                            </p>
                                        )}
                                    </div>
                                </section>

                                <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
                                    <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
                                        File changes
                                    </h3>
                                    <Table
                                        columns={[
                                            { key: 'filename', header: 'File', render: (r) => <span className="font-mono text-xs">{r.filename}</span> },
                                            { key: 'change',   header: 'Change', render: (r) => changeChip(r.change) },
                                            { key: 'from',     header: 'From', align: 'right', render: (r) => humanBytes(r.from_size) },
                                            { key: 'to',       header: 'To',   align: 'right', render: (r) => humanBytes(r.to_size) },
                                        ]}
                                        rows={diff.file_changes}
                                        rowKey={(r) => r.filename}
                                        empty="No file changes tracked."
                                        dense
                                    />
                                </section>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default RevisionComparisonPage;
