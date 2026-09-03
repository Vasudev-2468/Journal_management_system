import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import { PageHeader, LoadingIndicator, AlertBanner } from '../components/ui';
import { useToast, confirmDialog } from '../components/ui/Toast';
import {
    ScreeningChecklist,
    ScreeningDecision,
    ScreeningDetail,
    fetchScreeningDetail,
    submitScreeningDecision,
} from '../api/editorScreening';

// Editorial Screening — the detail page an editor lands on from
// New Submissions. Renders the manuscript packet, automated checks,
// the editor's own checklist, and the four screening-decision
// buttons. Sending a decision moves the row out of the queue.

const CHECK_META: Record<string, { badge: string; cls: string; label: string }> = {
    passed:  { badge: '✓ PASSED',   cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',    label: 'Passed' },
    warning: { badge: '⚠ WARNING',  cls: 'text-amber-800 bg-amber-50 border-amber-200',           label: 'Warning' },
    flagged: { badge: '⚠ FLAGGED',  cls: 'text-rose-800 bg-rose-50 border-rose-200',              label: 'Flagged' },
    pending: { badge: '… PENDING',  cls: 'text-gray-500 bg-gray-50 border-gray-200',              label: 'Pending' },
};

const DECISIONS: { id: ScreeningDecision; label: string; hint: string; tone: string }[] = [
    { id: 'peer_review',       label: 'Send to peer review',       hint: 'Manuscript progresses to reviewer selection', tone: 'emerald' },
    { id: 'reject',            label: 'Reject without review',     hint: 'Terminates the manuscript without peer review', tone: 'rose' },
    { id: 'author_correction', label: 'Request author correction', hint: 'Returned to author; new version required',    tone: 'amber' },
    { id: 'transfer',          label: 'Transfer to another journal/section', hint: 'Handed off — leaves this queue',   tone: 'blue' },
];

const EditorScreeningPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const toast = useToast();
    const [data, setData] = useState<ScreeningDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checklist, setChecklist] = useState<ScreeningChecklist>({});
    const [decision, setDecision] = useState<ScreeningDecision | null>(null);
    const [comments, setComments] = useState('');
    const [transferTarget, setTransferTarget] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchScreeningDetail(submissionId)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e: any) => {
                if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Could not load submission.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [submissionId]);

    const canSubmit = decision !== null && !busy;

    const handleSubmit = async () => {
        if (!decision) return;
        const meta = DECISIONS.find((d) => d.id === decision)!;
        const ok = await confirmDialog({
            title: `${meta.label}?`,
            message:
                `This will move ${data?.manuscript_id || 'the manuscript'} out of the New Submissions queue. ` +
                `${meta.hint}. This action is auditable and cannot be silently undone.`,
            confirmLabel: 'Submit decision',
            tone: decision === 'reject' ? 'danger' : 'default',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const res = await submitScreeningDecision(submissionId, {
                decision,
                comments: comments.trim() || undefined,
                checklist,
                transfer_target: decision === 'transfer' ? transferTarget.trim() || undefined : undefined,
            });
            toast.success(`Decision recorded. New status: ${res.new_status.replace(/_/g, ' ')}.`);
            navigate('/editor/new-submissions');
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || e?.message || 'Could not submit the decision.');
        } finally {
            setBusy(false);
        }
    };

    const checklistBoxes = useMemo(() => [
        { key: 'scope',        label: 'Within journal scope' },
        { key: 'article_type', label: 'Appropriate article type' },
        { key: 'complete',     label: 'Manuscript is sufficiently complete' },
        { key: 'ethics',       label: 'Ethical requirements satisfied' },
        { key: 'coi',          label: 'No apparent conflict of interest' },
        { key: 'review_ready', label: 'Suitable for peer review' },
    ] as const, []);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <BackButton className="mb-4" onClick={() => navigate('/editor/new-submissions')} />
                <PageHeader
                    icon="🔍"
                    title="Editorial Screening"
                    subtitle={data ? data.title : `Submission ${submissionId.slice(0, 8)}`}
                />

                {error && (
                    <div className="mb-4">
                        <AlertBanner tone="danger">{error}</AlertBanner>
                    </div>
                )}

                {loading ? (
                    <LoadingIndicator label="Loading screening…" fullPage />
                ) : !data ? null : (
                    <>
                        {/* ─── Manuscript header ─── */}
                        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                <Row label="Manuscript ID"><span className="font-mono">{data.manuscript_id}</span></Row>
                                <Row label="Article Type">{data.article_type}</Row>
                                <Row label="Submitted">{new Date(data.submitted_at).toLocaleString()}</Row>
                                <Row label="Corresponding Author">
                                    {data.corresponding_author}
                                    <br />
                                    <span className="text-xs text-gray-500">{data.author_email}</span>
                                </Row>
                                <div className="sm:col-span-2">
                                    <Row label="Title">
                                        <span className="text-base font-semibold">{data.title}</span>
                                    </Row>
                                </div>
                                {data.abstract && (
                                    <div className="sm:col-span-2">
                                        <Row label="Abstract">
                                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                                {data.abstract}
                                            </p>
                                        </Row>
                                    </div>
                                )}
                                {data.keywords.length > 0 && (
                                    <div className="sm:col-span-2">
                                        <Row label="Keywords">
                                            <div className="flex flex-wrap gap-1">
                                                {data.keywords.map((k) => (
                                                    <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                                        {k}
                                                    </span>
                                                ))}
                                            </div>
                                        </Row>
                                    </div>
                                )}
                            </dl>
                        </section>

                        {/* ─── Authors ─── */}
                        {data.authors.length > 0 && (
                            <Section title="Authors">
                                <ol className="text-sm text-gray-800 dark:text-gray-200 space-y-1 list-decimal pl-5">
                                    {data.authors.map((a, i) => (
                                        <li key={i}>
                                            <span className="font-medium">{a.name}</span>
                                            <span className="text-xs text-gray-500 ml-2">{a.email}</span>
                                            {a.corresponding && (
                                                <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                    ✉ CORRESPONDING
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </Section>
                        )}

                        {/* ─── Files ─── */}
                        <Section title="Files">
                            {data.files.length === 0 ? (
                                <p className="text-sm text-gray-500">No files attached to this submission.</p>
                            ) : (
                                <ul className="text-sm space-y-1">
                                    {data.files.map((f) => (
                                        <li key={f.id} className="flex items-center gap-2">
                                            <span>📄</span>
                                            <span className="font-mono text-xs">{f.filename}</span>
                                            {f.url && (
                                                <a
                                                    href={f.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs text-blue-700 hover:underline ml-auto"
                                                >
                                                    Open ↗
                                                </a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Section>

                        {/* ─── Automated screening ─── */}
                        <Section title="Automated screening">
                            <ul className="space-y-1">
                                {data.screening.map((c) => {
                                    const m = CHECK_META[c.state] || CHECK_META.pending;
                                    return (
                                        <li
                                            key={c.key}
                                            className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                                        >
                                            <span className="text-gray-800 dark:text-gray-200">{c.label}</span>
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${m.cls}`}>
                                                {m.badge}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>

                        {/* ─── Editorial check ─── */}
                        <Section title="Editorial check">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {checklistBoxes.map((box) => (
                                    <label key={box.key} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            className="rounded"
                                            checked={!!(checklist as any)[box.key]}
                                            onChange={(e) =>
                                                setChecklist((prev) => ({ ...prev, [box.key]: e.target.checked }))
                                            }
                                        />
                                        <span className="text-gray-800 dark:text-gray-200">{box.label}</span>
                                    </label>
                                ))}
                            </div>
                        </Section>

                        {/* ─── Decision ─── */}
                        <Section title="Editorial decision">
                            <div className="space-y-2 mb-3">
                                {DECISIONS.map((d) => (
                                    <label
                                        key={d.id}
                                        className={
                                            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ' +
                                            (decision === d.id
                                                ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                                                : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50')
                                        }
                                    >
                                        <input
                                            type="radio"
                                            name="screening-decision"
                                            value={d.id}
                                            checked={decision === d.id}
                                            onChange={() => setDecision(d.id)}
                                            className="mt-1"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {d.label}
                                            </p>
                                            <p className="text-xs text-gray-500">{d.hint}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            {decision === 'transfer' && (
                                <div className="mb-3">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                                        Transfer target
                                    </label>
                                    <input
                                        type="text"
                                        value={transferTarget}
                                        onChange={(e) => setTransferTarget(e.target.value)}
                                        placeholder="e.g. JGAIR Applied Track, or partner journal name"
                                        className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm px-3 py-2"
                                    />
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
                                    Comments (visible on the audit trail; a summary is emailed to the author)
                                </label>
                                <textarea
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    rows={4}
                                    placeholder="Explain the decision — reviewer selection focus, correction needs, transfer reason…"
                                    className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 rounded-lg text-sm p-3"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => navigate('/editor/new-submissions')}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    {busy ? 'Submitting…' : 'Submit decision'}
                                </button>
                            </div>
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</dt>
        <dd className="text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3">
            {title}
        </h2>
        {children}
    </section>
);

export default EditorScreeningPage;
