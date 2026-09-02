import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { AlertBanner, LoadingIndicator, PageHeader } from '../components/ui';
import {
    assignDoi,
    DoiAuditEntry,
    DoiEligibility,
    fetchDoiAudit,
    fetchDoiEligibility,
    registerDoi,
} from '../api/doi';

/**
 * DOI Management — the editor's authoritative view for a single
 * article's DOI lifecycle.
 *
 * Route: /editor/doi/:articleId?submission_id=…
 *
 * Enforces the business rule the user pinned in spec §14:
 *   * DOI cannot be assigned unless the manuscript's editorial decision
 *     is ACCEPTED (checked server-side; UI just reflects the answer).
 *   * DOI cannot be assigned by anyone lacking DOI_ASSIGN permission
 *     (checked server-side; the button is hidden here as a courtesy).
 *   * A DOI already in the ``registered`` or ``active`` state is frozen —
 *     Assign and Register are both refused.
 *
 * The confirmation dialog on Assign matches spec §16 — no accidental
 * mints.
 */
const EditorDoiManagementPage: React.FC = () => {
    const { articleId = '' } = useParams<{ articleId: string }>();
    const [params] = useSearchParams();
    const submissionId = params.get('submission_id') || undefined;
    const numericId = Number(articleId);

    const [eligibility, setEligibility] = useState<DoiEligibility | null>(null);
    const [audit, setAudit] = useState<DoiAuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<null | 'assign' | 'register'>(null);
    const [confirmOpen, setConfirmOpen] = useState<null | 'assign' | 'register'>(null);
    const [toast, setToast] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [elig, log] = await Promise.all([
                fetchDoiEligibility(numericId, submissionId),
                fetchDoiAudit(numericId),
            ]);
            setEligibility(elig);
            setAudit(log);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Failed to load DOI state.');
        } finally {
            setLoading(false);
        }
    }, [numericId, submissionId]);

    useEffect(() => {
        if (numericId > 0) reload();
    }, [numericId, reload]);

    const doAssign = async () => {
        setBusy('assign');
        setError(null);
        try {
            await assignDoi(numericId, submissionId);
            setToast('DOI assigned.');
            setConfirmOpen(null);
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Assignment failed.');
        } finally {
            setBusy(null);
        }
    };

    const doRegister = async () => {
        setBusy('register');
        setError(null);
        try {
            const r = await registerDoi(numericId);
            setToast(r.ok ? 'DOI registered.' : `Registrar refused: ${r.detail || 'unknown error'}`);
            setConfirmOpen(null);
            reload();
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Registration failed.');
        } finally {
            setBusy(null);
        }
    };

    const statusMeta = useMemo(() => statusStyle(eligibility?.current_status), [eligibility]);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <BackButton className="mb-4" />
                <PageHeader
                    icon="🔖"
                    title="DOI Management"
                    subtitle={
                        <>
                            Article <span className="font-mono">#{articleId}</span>
                            {submissionId && (
                                <> · Submission <span className="font-mono">{submissionId}</span></>
                            )}
                        </>
                    }
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}
                {toast && (
                    <div className="mb-4">
                        <AlertBanner tone="success" onDismiss={() => setToast(null)}>
                            {toast}
                        </AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading DOI state…" fullPage />
                ) : eligibility ? (
                    <>
                        {/* ── State card ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-gray-900">DOI status</h2>
                                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusMeta.pill}`}>
                                    {statusMeta.label}
                                </span>
                            </div>
                            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <div>
                                    <dt className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Current DOI</dt>
                                    <dd className="font-mono text-gray-900">
                                        {eligibility.current_doi || <span className="text-gray-400">Not assigned</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Proposed DOI</dt>
                                    <dd className="font-mono text-gray-900">
                                        {eligibility.proposed_doi || <span className="text-gray-400">—</span>}
                                    </dd>
                                </div>
                                <div className="md:col-span-2">
                                    <dt className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Eligibility</dt>
                                    <dd className={`text-sm ${eligibility.eligible ? 'text-emerald-800' : 'text-rose-700'}`}>
                                        {eligibility.eligible ? '✓ ' : '✗ '}
                                        {eligibility.reason}
                                    </dd>
                                    {eligibility.missing_checks.length > 0 && (
                                        <ul className="list-disc list-inside text-xs text-rose-700 mt-1">
                                            {eligibility.missing_checks.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                    )}
                                </div>
                                {!eligibility.can_assign && (
                                    <div className="md:col-span-2">
                                        <dd className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                                            🔒 Your role lacks <code className="font-mono">DOI_ASSIGN</code> permission.
                                            Only the managing editor / editor-in-chief / admin roles may authorise a DOI.
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </section>

                        {/* ── Action bar ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Actions</h2>
                            {isFrozen(eligibility.current_status) ? (
                                <p className="text-sm text-gray-700">
                                    This DOI is registered and frozen — no further changes are permitted.
                                </p>
                            ) : (
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmOpen('assign')}
                                        disabled={
                                            busy !== null ||
                                            !eligibility.eligible ||
                                            !eligibility.can_assign ||
                                            eligibility.current_status === 'assigned'
                                        }
                                        className="px-5 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        {busy === 'assign' ? 'Assigning…' : eligibility.current_status === 'assigned' ? 'DOI assigned' : 'Assign DOI'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmOpen('register')}
                                        disabled={
                                            busy !== null ||
                                            !eligibility.can_assign ||
                                            !eligibility.current_doi ||
                                            eligibility.current_status !== 'assigned'
                                        }
                                        className="px-5 py-2 rounded-lg border border-blue-700 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {busy === 'register' ? 'Registering…' : 'Register with Crossref'}
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 mt-3">
                                The eligibility gate, permission check, and audit trail all run server-side. Nothing here bypasses them.
                            </p>
                        </section>

                        {/* ── Post-publication notices link ── */}
                        {isFrozen(eligibility.current_status) && (
                            <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-4">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                                    Post-publication
                                </h2>
                                <a
                                    href={`/editor/articles/${articleId}/corrections`}
                                    className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
                                >
                                    <span aria-hidden>📝</span>
                                    Publish a correction or retraction on this article →
                                </a>
                                <p className="text-xs text-gray-500 mt-1">
                                    Corrections and retractions are permitted after registration. Retractions
                                    do not delete the original — the notice is shown alongside it.
                                </p>
                            </section>
                        )}

                        {/* ── Audit trail ── */}
                        <section className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Audit trail</h2>
                            {audit.length === 0 ? (
                                <p className="text-sm text-gray-500">No DOI events recorded for this article yet.</p>
                            ) : (
                                <ol className="space-y-2">
                                    {audit.map((e) => (
                                        <li key={e.id} className="flex items-start gap-3 border-l-2 border-gray-200 pl-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap text-sm">
                                                    <span className="font-mono text-xs text-gray-500">{e.action}</span>
                                                    {e.previous_status && e.new_status && e.previous_status !== e.new_status && (
                                                        <span className="text-xs text-gray-500">
                                                            {e.previous_status} <span aria-hidden>→</span> {e.new_status}
                                                        </span>
                                                    )}
                                                </div>
                                                {e.proposed_doi && (
                                                    <p className="text-xs font-mono text-gray-700 mt-0.5">{e.proposed_doi}</p>
                                                )}
                                                {e.reason && (
                                                    <p className="text-xs text-gray-600 mt-0.5">{e.reason}</p>
                                                )}
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {new Date(e.performed_at).toLocaleString()}
                                                    {e.performed_by_email && ` · ${e.performed_by_email}`}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </>
                ) : null}
            </div>

            {/* ── Confirmation dialog (spec §16) ── */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {confirmOpen === 'assign' ? 'Confirm DOI assignment' : 'Confirm Crossref registration'}
                        </h3>
                        <p className="text-sm text-gray-700 mb-3">
                            Article <span className="font-mono">#{articleId}</span>
                            {submissionId && <> · <span className="font-mono">{submissionId}</span></>}
                        </p>
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
                            <div className="text-xs text-gray-500 mb-0.5">
                                {confirmOpen === 'assign' ? 'Proposed DOI' : 'DOI to register'}
                            </div>
                            <div className="font-mono">
                                {confirmOpen === 'assign' ? eligibility?.proposed_doi : eligibility?.current_doi}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                            {confirmOpen === 'assign'
                                ? 'This DOI will permanently identify this article after registration.'
                                : 'The DOI metadata will be posted to Crossref. Registration failures are recoverable — the DOI value is preserved.'}
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmOpen(null)}
                                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmOpen === 'assign' ? doAssign : doRegister}
                                disabled={busy !== null}
                                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:bg-gray-300"
                            >
                                {busy ? 'Working…' : confirmOpen === 'assign' ? 'Confirm DOI assignment' : 'Confirm registration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Status styling ─────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; pill: string }> = {
    not_eligible:          { label: 'Not eligible',        pill: 'bg-gray-200 text-gray-800' },
    eligible:              { label: 'Eligible',            pill: 'bg-blue-100 text-blue-800' },
    pending_approval:      { label: 'Pending approval',    pill: 'bg-amber-100 text-amber-900' },
    assigned:              { label: 'Assigned',            pill: 'bg-indigo-100 text-indigo-900' },
    registration_pending:  { label: 'Registration pending',pill: 'bg-amber-100 text-amber-900' },
    registered:            { label: 'Registered',          pill: 'bg-emerald-100 text-emerald-800' },
    registration_failed:   { label: 'Registration failed', pill: 'bg-rose-100 text-rose-800' },
    active:                { label: 'Active',              pill: 'bg-emerald-100 text-emerald-800' },
    deactivated:           { label: 'Deactivated',         pill: 'bg-gray-300 text-gray-800' },
};

function statusStyle(status: string | undefined) {
    return STATUS_STYLES[status || ''] || { label: status || 'unknown', pill: 'bg-gray-100 text-gray-700' };
}

function isFrozen(status: string): boolean {
    return status === 'registered' || status === 'active';
}

export default EditorDoiManagementPage;
