import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../components/ui';
import { Table } from '../components/ui/Table';
import client from '../api/client';

// Ethics Screening report — pulls all Review rows whose reviewers
// flagged an ethics concern for the submission, plus the (masked)
// notes. Editors read this before finalising a decision; it's the
// central view for Corrections & retractions.

interface ReviewSummary {
    id: string;
    reviewer_label: string;
    ethics_flag: boolean;
    ethics_note: string | null;
    submitted_at: string | null;
    coi_declared_at: string | null;
    overall_recommendation: string | null;
}

interface EthicsBundle {
    submission_id: string;
    paper_title: string;
    reviews: ReviewSummary[];
}

const editorAuth = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

// Pull the reviewer reports for this submission via the existing
// editor reviewer-reports endpoint and derive the ethics subset.
// The endpoint returns the full report shape; we distil it down.
const fetchEthics = async (submissionId: string): Promise<EthicsBundle> => {
    const r = await client.get(`/editor-portal/submissions/${submissionId}/reports`, {
        headers: editorAuth(),
    });
    const d = r.data as any;
    return {
        submission_id: submissionId,
        paper_title: d.paper_title || 'Manuscript',
        reviews: (d.reports || []).map((rep: any, i: number) => ({
            id: rep.id || rep.review_id || String(i),
            reviewer_label: rep.reviewer_display_name || `Reviewer ${i + 1}`,
            ethics_flag: !!rep.ethics_flag,
            ethics_note: rep.ethics_note || rep.ethics_notes || null,
            submitted_at: rep.submitted_at || null,
            coi_declared_at: rep.coi_declared_at || null,
            overall_recommendation: rep.overall_recommendation || null,
        })),
    };
};

const EditorEthicsScreeningPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [data, setData] = useState<EthicsBundle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchEthics(submissionId)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e: any) => {
                if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Could not load ethics screening.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [submissionId]);

    const flagged = useMemo(
        () => (data?.reviews || []).filter((r) => r.ethics_flag),
        [data],
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="⚖"
                    title="Ethics screening"
                    subtitle={data ? data.paper_title : `Submission ${submissionId.slice(0, 8)}`}
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading ethics screening…" fullPage />
                ) : !data ? null : (
                    <>
                        {flagged.length === 0 ? (
                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
                                <p className="text-2xl mb-2">✓</p>
                                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                    No ethics concerns raised on this manuscript.
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                    {data.reviews.length} reviewer{data.reviews.length === 1 ? '' : 's'} reviewed and
                                    none flagged this paper for editorial attention.
                                </p>
                            </div>
                        ) : (
                            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-rose-200 dark:border-rose-800 p-6 mb-4">
                                <div className="flex items-start gap-3 mb-4">
                                    <span className="text-2xl">⚠</span>
                                    <div>
                                        <h2 className="text-sm font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                                            {flagged.length} ethics concern{flagged.length === 1 ? '' : 's'} raised
                                        </h2>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            Editor-only view. Notes below are confidential to the editorial team.
                                        </p>
                                    </div>
                                </div>
                                <ul className="space-y-4">
                                    {flagged.map((r) => (
                                        <li
                                            key={r.id}
                                            className="rounded-xl border border-rose-100 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30 p-4"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-semibold text-rose-900 dark:text-rose-200">
                                                    {r.reviewer_label}
                                                </span>
                                                {r.overall_recommendation && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-200 bg-white dark:bg-gray-900 border border-rose-200 dark:border-rose-800 rounded px-2 py-0.5">
                                                        rec: {r.overall_recommendation.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </div>
                                            {r.ethics_note ? (
                                                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                                                    {r.ethics_note}
                                                </pre>
                                            ) : (
                                                <p className="text-xs italic text-gray-500">
                                                    Reviewer flagged an ethics concern but did not attach a note.
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-6 pt-4 border-t border-rose-100 dark:border-rose-900">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                        If the concern is substantive, consider issuing an{' '}
                                        <strong>Expression of Concern</strong> from the Corrections page.
                                    </p>
                                    <Link
                                        to="/editor/corrections"
                                        className="inline-block px-3 py-1.5 text-xs font-semibold text-rose-800 bg-white dark:bg-gray-900 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-50"
                                    >
                                        Open Corrections & Retractions →
                                    </Link>
                                </div>
                            </section>
                        )}

                        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3">
                                All reviewer flags
                            </h3>
                            <Table<ReviewSummary>
                                columns={[
                                    { key: 'reviewer', header: 'Reviewer', render: (r) => r.reviewer_label },
                                    { key: 'ethics',   header: 'Ethics flag', align: 'center', render: (r) => (
                                        r.ethics_flag
                                            ? <span className="text-rose-700 font-bold">⚠ raised</span>
                                            : <span className="text-gray-400">–</span>
                                    ) },
                                    { key: 'coi',      header: 'COI declared', align: 'center', render: (r) => (
                                        r.coi_declared_at
                                            ? <span className="text-amber-800">declared</span>
                                            : <span className="text-gray-400">–</span>
                                    ) },
                                    { key: 'rec',      header: 'Recommendation', render: (r) => (
                                        r.overall_recommendation ? r.overall_recommendation.replace(/_/g, ' ') : '—'
                                    ) },
                                ]}
                                rows={data.reviews}
                                rowKey={(r) => r.id}
                                empty="No reviews submitted yet."
                                dense
                            />
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default EditorEthicsScreeningPage;
