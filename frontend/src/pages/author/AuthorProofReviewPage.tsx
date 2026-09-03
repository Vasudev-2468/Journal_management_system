import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackButton from '../../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../../components/ui';
import { useToast, confirmDialog } from '../../components/ui/Toast';
import {
    ProofView,
    approveProof,
    fetchAuthorProof,
    requestProofCorrection,
} from '../../api/authorProof';

// Author Proof review page — the missing production-flow step.
//
// Author sees the current production stage + the proof PDF, and can
// either APPROVE (production advances to final_pdf) or REQUEST
// CORRECTIONS (a text note reopens the pending stage and pings the
// editorial inbox).

const humanStage = (stage: string): string => {
    switch (stage) {
        case 'copy_editing':          return 'Copy editing in progress';
        case 'typesetting':           return 'Typesetting in progress';
        case 'proof':                 return 'Proof being prepared';
        case 'author_proof_pending':  return 'Awaiting your review';
        case 'author_proof_approved': return 'You approved the proof';
        case 'final_pdf':             return 'Final PDF being generated';
        case 'doi_assigned':          return 'DOI assigned — awaiting publish';
        case 'published':             return 'Published';
        default:                      return stage.replace(/_/g, ' ');
    }
};

const AuthorProofReviewPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const toast = useToast();
    const [data, setData] = useState<ProofView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [corrections, setCorrections] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = async () => {
        setLoading(true);
        setError(null);
        try {
            const d = await fetchAuthorProof(submissionId);
            setData(d);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Could not load proof.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (submissionId) reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId]);

    const handleApprove = async () => {
        const ok = await confirmDialog({
            title: 'Approve this proof?',
            message:
                'Once approved, production will finalise the PDF and assign a DOI. ' +
                'You can still request corrections if you spot an issue later, ' +
                'but late changes may delay publication.',
            confirmLabel: 'Approve proof',
        });
        if (!ok) return;
        setBusy(true);
        try {
            await approveProof(submissionId);
            toast.success('Proof approved — production will finalise the PDF.');
            reload();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Could not approve the proof.');
        } finally {
            setBusy(false);
        }
    };

    const handleRequest = async () => {
        if (corrections.trim().length < 4) {
            toast.warning('Please describe the correction you need.');
            return;
        }
        setBusy(true);
        try {
            await requestProofCorrection(submissionId, corrections.trim());
            toast.success('Correction request sent to the editorial team.');
            setCorrections('');
            reload();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Could not send the correction request.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <BackButton className="mb-4" onClick={() => navigate('/author-dashboard')} />
                <PageHeader
                    icon="🖨"
                    title="Proof review"
                    subtitle={
                        data ? (
                            <>
                                <span className="font-mono">{data.manuscript_id}</span>{' '}
                                · {data.paper_title}
                            </>
                        ) : (
                            `Submission ${submissionId}`
                        )
                    }
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading proof…" fullPage />
                ) : !data ? null : (
                    <>
                        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
                            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                    Production stage
                                </h2>
                                <span className={
                                    'text-xs font-bold px-3 py-1 rounded-full ' +
                                    (data.stage === 'author_proof_approved'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : data.stage === 'author_proof_pending'
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-gray-100 text-gray-800')
                                }>
                                    {humanStage(data.stage)}
                                </span>
                            </div>
                            {data.proof_pdf_url ? (
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                        <span>📄 Proof PDF</span>
                                        <a
                                            href={data.proof_pdf_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-700 hover:underline"
                                        >
                                            Open in new tab ↗
                                        </a>
                                    </div>
                                    <iframe
                                        title="Proof PDF"
                                        src={data.proof_pdf_url}
                                        className="w-full h-[70vh] bg-gray-100"
                                    />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Production hasn't uploaded a proof yet. You'll be notified by email
                                    when it's ready.
                                </p>
                            )}
                        </section>

                        {data.author_corrections && (
                            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
                                    Previous correction requests
                                </h2>
                                <pre className="text-xs whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-950 p-4 rounded-lg">
                                    {data.author_corrections}
                                </pre>
                            </section>
                        )}

                        {(data.stage === 'author_proof_pending' || data.stage === 'author_proof_approved') && (
                            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
                                    Your action
                                </h2>
                                <p className="text-xs text-gray-500 mb-3">
                                    Approve the proof if it's ready to publish, or list any corrections
                                    that production should apply.
                                </p>
                                <textarea
                                    value={corrections}
                                    onChange={(e) => setCorrections(e.target.value)}
                                    rows={5}
                                    placeholder="e.g. Page 3, Figure 2 caption typo: 'temeprature' → 'temperature'"
                                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg text-sm p-3 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
                                />
                                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={handleRequest}
                                        disabled={busy || corrections.trim().length < 4}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
                                    >
                                        {busy ? 'Sending…' : '📝 Request corrections'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApprove}
                                        disabled={busy}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300"
                                    >
                                        {busy ? 'Working…' : '✓ Approve proof'}
                                    </button>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthorProofReviewPage;
