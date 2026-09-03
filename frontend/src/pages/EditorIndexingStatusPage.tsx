import React, { useEffect, useState } from 'react';
import BackButton from '../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../components/ui';
import { Table } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import {
    IndexingSummary,
    ServiceRollup,
    fetchIndexingSummary,
} from '../api/indexing';

// Indexing status dashboard — one row per external service (DOAJ,
// OpenAlex, Google Scholar, etc.) with counts per state so editors
// can see coverage at a glance.

const SERVICE_LABELS: Record<string, string> = {
    doaj:            'DOAJ',
    openalex:        'OpenAlex',
    google_scholar:  'Google Scholar',
    crossref:        'Crossref Search',
    pubmed_central:  'PubMed Central',
    scopus:          'Scopus',
    web_of_science:  'Web of Science',
    other:           'Other',
};

const cell = (n: number, tone: 'success' | 'info' | 'warn' | 'danger' | 'muted') => {
    const cls = {
        success: 'bg-emerald-50 text-emerald-800',
        info:    'bg-blue-50 text-blue-800',
        warn:    'bg-amber-50 text-amber-900',
        danger:  'bg-rose-50 text-rose-800',
        muted:   'bg-gray-50 text-gray-500',
    }[tone];
    return (
        <span className={`inline-block min-w-[2.25rem] text-center px-2 py-0.5 rounded font-mono text-xs ${cls}`}>
            {n}
        </span>
    );
};

const EditorIndexingStatusPage: React.FC = () => {
    const [summary, setSummary] = useState<IndexingSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchIndexingSummary()
            .then((s) => { if (!cancelled) setSummary(s); })
            .catch((e: any) => {
                if (!cancelled) {
                    const msg = e?.response?.data?.detail || e?.message || 'Could not load indexing summary.';
                    setError(msg);
                    toast.error(msg);
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [toast]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="🌐"
                    title="Indexing status"
                    subtitle="Per-service coverage across the journal"
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading indexing summary…" fullPage />
                ) : !summary ? null : (
                    <>
                        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-4">
                            <p className="text-xs text-gray-500 mb-3">
                                Records span <strong>{summary.total_articles}</strong> article{summary.total_articles === 1 ? '' : 's'}.
                                Add a new record per article from the article's admin page.
                            </p>
                            <Table<ServiceRollup>
                                columns={[
                                    {
                                        key: 'service',
                                        header: 'Service',
                                        render: (r) => (
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                {SERVICE_LABELS[r.service] || r.service}
                                            </span>
                                        ),
                                    },
                                    { key: 'indexed',   header: 'Indexed',   align: 'right', render: (r) => cell(r.indexed, 'success') },
                                    { key: 'submitted', header: 'Submitted', align: 'right', render: (r) => cell(r.submitted, 'info') },
                                    { key: 'pending',   header: 'Pending',   align: 'right', render: (r) => cell(r.pending, 'warn') },
                                    { key: 'rejected',  header: 'Rejected',  align: 'right', render: (r) => cell(r.rejected, 'danger') },
                                    { key: 'skipped',   header: 'Skipped',   align: 'right', render: (r) => cell(r.skipped, 'muted') },
                                    { key: 'total',     header: 'Total',     align: 'right', render: (r) => <span className="font-mono text-xs">{r.total}</span> },
                                ]}
                                rows={summary.services}
                                rowKey={(r) => r.service}
                                empty="No indexing records yet."
                            />
                        </section>
                        <p className="text-xs text-gray-500">
                            The Indexing endpoints let you record each submission to a service and update the state as it's acknowledged.
                            Use them from an article's admin view to keep coverage in sync.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default EditorIndexingStatusPage;
