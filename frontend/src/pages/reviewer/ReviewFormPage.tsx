import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import PdfViewerWithSelection from '../../components/reviewer/PdfViewerWithSelection';
import Loading from '../../components/common/Loading';
import {
    AssignmentDetail,
    AssistantHint,
    DraftPayload,
    PageAnnotation,
    PreviewResponse,
    QualityCheckResponse,
    RubricQuestion,
    RubricResponse,
    StructuredComment,
    SubmitResponse,
    emptyDraft,
    emptyStructuredComment,
    fetchAssignment,
    fetchDraft,
    fetchRubric,
    previewReport,
    runAssistant,
    runQualityCheck,
    saveDraft,
    submitReview,
    suggestAnnotation,
} from '../../api/reviewerPortal';

// Structured review form — spec §9-15.
//
// The form is powered by /reviewer-portal/rubric so the sections stay
// server-driven. Three agents assist the reviewer inline:
//
//   * Review Assistant — polled every 4s while the reviewer is
//                        actively editing; renders hints in a sticky
//                        side panel.
//   * Quality Check    — polled every 6s when idle; drives the
//                        Submit button's disabled state.
//   * Editor Summary   — server-side after submit, returned in the
//                        success screen.
//
// A local debounce autosaves the draft every 12 seconds of typing
// activity so a browser crash or accidental refresh doesn't lose
// work. The "Last saved" indicator makes the autosave visible.

const humanTime = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

const Radio: React.FC<{
    name: string;
    value: string;
    checked: boolean;
    onChange: () => void;
    label: string;
}> = ({ name, value, checked, onChange, label }) => (
    <label className="inline-flex items-center gap-2 mr-4 text-sm">
        <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
        <span>{label}</span>
    </label>
);

// Structured comment list. Each entry has Page / Section / Line +
// the comment textarea, per spec §3-4. The location fields are
// optional strings — the reviewer fills what they have.
const StructuredCommentList: React.FC<{
    label: string;
    tone: 'rose' | 'amber';
    values: StructuredComment[];
    onChange: (v: StructuredComment[]) => void;
    helpText?: string;
}> = ({ label, tone, values, onChange, helpText }) => {
    const barTone = tone === 'rose' ? 'border-rose-200' : 'border-amber-200';
    const chipTone = tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800';
    const populatedCount = values.filter((v) => v.comment.trim()).length;
    const list = values.length ? values : [emptyStructuredComment()];
    const patch = (idx: number, delta: Partial<StructuredComment>) =>
        onChange(list.map((v, i) => (i === idx ? { ...v, ...delta } : v)));
    return (
        <div className={`bg-white rounded-xl border ${barTone} p-5 mb-4`}>
            <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{label}</h2>
                <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${chipTone}`}>
                    {populatedCount}
                </span>
            </div>
            {helpText && <p className="text-xs text-gray-500 mb-3">{helpText}</p>}
            <ul className="space-y-4">
                {list.map((v, idx) => (
                    <li key={idx} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-gray-400">
                                {label.replace(/s$/, '')} #{idx + 1}
                            </span>
                            {list.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => onChange(list.filter((_, i) => i !== idx))}
                                    className="text-gray-400 hover:text-rose-600"
                                    aria-label={`Remove ${label} #${idx + 1}`}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Page</span>
                                <input
                                    type="text" value={v.page}
                                    onChange={(e) => patch(idx, { page: e.target.value })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                                    placeholder="7"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Section</span>
                                <input
                                    type="text" value={v.section}
                                    onChange={(e) => patch(idx, { section: e.target.value })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                                    placeholder="3.2 Methodology"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Line / Para</span>
                                <input
                                    type="text" value={v.line}
                                    onChange={(e) => patch(idx, { line: e.target.value })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                                    placeholder="214–218 / para 3"
                                />
                            </label>
                        </div>
                        <label className="block">
                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Comment</span>
                            <textarea
                                value={v.comment}
                                onChange={(e) => patch(idx, { comment: e.target.value })}
                                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                                rows={3}
                                placeholder={
                                    tone === 'rose'
                                        ? 'Describe the substantive problem that must be addressed…'
                                        : 'Describe the correction that should be made…'
                                }
                            />
                        </label>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={() => onChange([...list, emptyStructuredComment()])}
                className="mt-3 text-xs font-semibold text-blue-700 hover:underline"
            >
                + Add another {label.toLowerCase().replace(/s$/, '')}
            </button>
        </div>
    );
};

// Repeating one-liner list — Suggestions. Each entry is a simple
// string; empty entries are trimmed on submit.
const SuggestionsList: React.FC<{
    values: string[];
    onChange: (v: string[]) => void;
}> = ({ values, onChange }) => {
    const list = values.length ? values : [''];
    return (
        <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Suggestions to Authors</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-blue-100 text-blue-700">
                    {values.filter((v) => v.trim()).length}
                </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
                Ideas for improvement — separate from required corrections.
            </p>
            <ol className="space-y-2 list-decimal pl-6">
                {list.map((v, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                        <input
                            type="text" value={v}
                            onChange={(e) => onChange(list.map((s, i) => (i === idx ? e.target.value : s)))}
                            className="flex-1 border border-gray-300 rounded-lg text-sm p-2"
                            placeholder="Consider adding a comparison with Random Forest…"
                        />
                        {list.length > 1 && (
                            <button
                                type="button"
                                onClick={() => onChange(list.filter((_, i) => i !== idx))}
                                className="w-8 h-8 text-gray-400 hover:text-rose-600"
                                aria-label={`Remove suggestion #${idx + 1}`}
                            >
                                ✕
                            </button>
                        )}
                    </li>
                ))}
            </ol>
            <button
                type="button"
                onClick={() => onChange([...list, ''])}
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
            >
                + Add another suggestion
            </button>
        </div>
    );
};

// Page/line-anchored PDF comment list.
const AnnotationList: React.FC<{
    reviewId: string;
    values: PageAnnotation[];
    onChange: (v: PageAnnotation[]) => void;
}> = ({ reviewId, values, onChange }) => {
    const add = () =>
        onChange([...values, { page: 1, lines: '', type: 'suggestion', text: '' }]);
    const patch = (idx: number, delta: Partial<PageAnnotation>) => {
        const next = values.map((a, i) => (i === idx ? { ...a, ...delta } : a));
        onChange(next);
    };
    // Annotation Assistant Agent — reviewer pastes a PDF selection,
    // agent suggests type + starter prompt. The starter text always
    // appears in the annotation textarea so the reviewer can edit it
    // before saving.
    const [pasteBusy, setPasteBusy] = useState(false);
    const pasteFromPdf = async () => {
        setPasteBusy(true);
        try {
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) return;
            const res = await suggestAnnotation(reviewId, text);
            onChange([...values, {
                page: 1,
                lines: '',
                type: (res.suggested_type as PageAnnotation['type']),
                text: res.suggested_prompt || text.trim(),
            }]);
        } catch (err: any) {
            alert(err?.message || 'Could not read from clipboard.');
        } finally {
            setPasteBusy(false);
        }
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    Page-Anchored Comments
                </h2>
                <div className="flex gap-2">
                    <button
                        type="button" onClick={pasteFromPdf} disabled={pasteBusy}
                        className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
                        title="Copy text from the PDF viewer, then click this — the Annotation Assistant Agent classifies the paste and drafts a starter comment."
                    >
                        {pasteBusy ? 'Reading clipboard…' : '📋 Paste from PDF (assistant)'}
                    </button>
                    <button
                        type="button" onClick={add}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                    >
                        + Anchor a comment to a page
                    </button>
                </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
                Point to a specific page + line range while you read the PDF —
                the editor sees exactly where each issue occurs. Or copy text from the PDF viewer and click <em>Paste from PDF</em> to let the assistant classify it and pre-fill a comment for you to edit.
            </p>
            {values.length === 0 ? (
                <p className="text-xs text-gray-400">No page-anchored comments yet.</p>
            ) : (
                <ul className="space-y-3">
                    {values.map((a, idx) => (
                        <li key={idx} className="grid grid-cols-[80px_1fr_120px_1fr_32px] gap-2 items-start">
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Page</span>
                                <input
                                    type="number" min={1}
                                    value={a.page}
                                    onChange={(e) => patch(idx, { page: Math.max(1, Number(e.target.value) || 1) })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Lines</span>
                                <input
                                    type="text" value={a.lines}
                                    onChange={(e) => patch(idx, { lines: e.target.value })}
                                    placeholder="214–218 / para 3"
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Type</span>
                                <select
                                    value={a.type}
                                    onChange={(e) => patch(idx, { type: e.target.value as PageAnnotation['type'] })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                                >
                                    <option value="major">Major</option>
                                    <option value="minor">Minor</option>
                                    <option value="suggestion">Suggestion</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-[10px] uppercase text-gray-500 font-semibold">Comment</span>
                                <textarea
                                    value={a.text}
                                    onChange={(e) => patch(idx, { text: e.target.value })}
                                    className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                    rows={2}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => onChange(values.filter((_, i) => i !== idx))}
                                className="mt-4 w-8 h-8 text-gray-400 hover:text-rose-600"
                                aria-label="Remove annotation"
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// Side-by-side PDF panel. Shows the first attached PDF (any file
// whose content_type is application/pdf) inside a scrollable frame.
// Falls back to a link if the file lookup returns nothing.
const buildPdfUrl = (fileId: string): string => {
    const base =
        (process.env.REACT_APP_API_URL as string | undefined) || 'http://localhost:8000';
    const token = localStorage.getItem('reviewer_token') || '';
    return `${base.replace(/\/$/, '')}/reviewer-portal/files/${fileId}/pdf?token=${encodeURIComponent(token)}`;
};

const PdfPanel: React.FC<{
    assignment: AssignmentDetail | null;
    onSelectedText?: (t: string) => void;
}> = ({ assignment, onSelectedText }) => {
    const pdf = assignment?.files.find(
        (f) => (f.content_type || '').toLowerCase().includes('pdf'),
    );
    if (!pdf) {
        return (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 sticky top-24">
                No PDF attached to this manuscript.
            </div>
        );
    }
    const url = buildPdfUrl(pdf.id);
    return (
        <PdfViewerWithSelection pdfUrl={url} onSelectedText={onSelectedText} />
    );
};

const RubricRow: React.FC<{
    q: RubricQuestion;
    value: string;
    onChange: (v: string) => void;
}> = ({ q, value, onChange }) => (
    <div className="py-3 border-b border-gray-100 last:border-b-0">
        <div className="text-sm font-medium text-gray-900 mb-1">
            {q.prompt} {q.mandatory && <span className="text-rose-600">*</span>}
        </div>
        <div className="flex flex-wrap">
            {q.options.map((opt) => (
                <Radio
                    key={opt.value}
                    name={q.key}
                    value={opt.value}
                    checked={value === opt.value}
                    onChange={() => onChange(opt.value)}
                    label={opt.label}
                />
            ))}
        </div>
    </div>
);

// Assistant panel — collapsible, tucked into the form column so it
// never squeezes the PDF/form workspace. Reviewers see hints when
// they choose to look, and the panel stays out of the way otherwise.
const AssistantPanel: React.FC<{
    hints: AssistantHint[];
    busy: boolean;
    open: boolean;
    onToggle: () => void;
}> = ({ hints, busy, open, onToggle }) => {
    const critical = hints.filter((h) => h.severity === 'warning').length;
    return (
        <div className="bg-white rounded-xl border border-gray-200">
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-xl"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">🤖 Review Assistant</span>
                    {critical > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            {critical} to consider
                        </span>
                    )}
                    {!busy && critical === 0 && hints.length === 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            all clear
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
            </button>
            {open && (
                <div className="px-4 pb-4">
                    <p className="text-[11px] text-gray-500 mb-3">
                        Hints only. Your judgement stays yours.
                    </p>
                    {busy ? (
                        <p className="text-xs text-gray-400 animate-pulse">Analyzing your draft…</p>
                    ) : hints.length === 0 ? (
                        <p className="text-xs text-emerald-700">Nothing to flag right now.</p>
                    ) : (
                        <ul className="space-y-2">
                            {hints.map((h) => (
                                <li
                                    key={h.code}
                                    className={
                                        'text-xs rounded-lg p-2.5 border ' +
                                        (h.severity === 'warning'
                                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                                            : 'bg-blue-50 border-blue-200 text-blue-900')
                                    }
                                >
                                    <span className="font-semibold uppercase tracking-wide text-[10px] block mb-0.5">
                                        {h.severity === 'warning' ? 'Consider' : 'Tip'}
                                    </span>
                                    {h.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

// Compact validation summary — one line beside the Submit button.
// The full list opens in a popover only if the reviewer clicks it,
// so the reviewer sees a calm progress signal instead of a wall of
// "Answer required" bullets.
const ValidationSummary: React.FC<{
    report: QualityCheckResponse | null;
    onOpen: () => void;
}> = ({ report, onOpen }) => {
    if (!report) return (
        <span className="text-xs text-gray-400">Checking…</span>
    );
    if (report.ok && report.warnings.length === 0) return (
        <span className="text-xs font-medium text-emerald-700">✓ Ready to submit</span>
    );
    const blockers = report.blockers.length;
    const warnings = report.warnings.length;
    return (
        <button
            type="button"
            onClick={onOpen}
            className={
                'text-xs font-medium underline underline-offset-2 ' +
                (blockers > 0 ? 'text-rose-700' : 'text-amber-800')
            }
        >
            {blockers > 0
                ? `${blockers} to fix before submit`
                : `${warnings} suggestion${warnings === 1 ? '' : 's'}`}
        </button>
    );
};

// Full validation panel — shown when the reviewer expands it or
// hits Submit with blockers. Kept out of the top of the form.
const ValidationPanel: React.FC<{
    report: QualityCheckResponse | null;
    onClose: () => void;
}> = ({ report, onClose }) => {
    if (!report) return null;
    if (report.ok && report.warnings.length === 0) return null;
    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
                <div className="font-semibold uppercase tracking-wider text-[11px] text-amber-900 flex items-center gap-2">
                    Review Validation <span className="text-[10px] bg-amber-200 rounded px-1.5 py-0.5">Agent</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-amber-800 hover:text-amber-900"
                    aria-label="Hide validation panel"
                >
                    ✕
                </button>
            </div>
            {report.blockers.length > 0 && (
                <>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-900 mb-1">
                        Blockers ({report.blockers.length})
                    </p>
                    <ul className="list-disc pl-4 mb-2 text-xs text-rose-900">
                        {report.blockers.map((b, i) => <li key={`b${i}`}>{b}</li>)}
                    </ul>
                </>
            )}
            {report.warnings.length > 0 && (
                <>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 mb-1">
                        Suggestions ({report.warnings.length})
                    </p>
                    <ul className="list-disc pl-4 text-xs text-amber-800">
                        {report.warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}
                    </ul>
                </>
            )}
        </div>
    );
};

export default function ReviewFormPage() {
    const { reviewId = '' } = useParams();
    const navigate = useNavigate();

    const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
    const [rubric, setRubric] = useState<RubricResponse | null>(null);
    const [draft, setDraft] = useState<DraftPayload>(emptyDraft());
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [submitBusy, setSubmitBusy] = useState(false);
    const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);

    // Agent state
    const [hints, setHints] = useState<AssistantHint[]>([]);
    const [assistantBusy, setAssistantBusy] = useState(false);
    const [quality, setQuality] = useState<QualityCheckResponse | null>(null);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [validationOpen, setValidationOpen] = useState(false);

    const draftRef = useRef(draft);
    const dirtyRef = useRef(false);

    // ── initial load ──
    useEffect(() => {
        if (!reviewId) return;
        setLoading(true);
        Promise.all([
            fetchAssignment(reviewId),
            fetchRubric(),
            fetchDraft(reviewId),
        ])
            .then(([a, r, d]) => {
                setAssignment(a);
                setRubric(r);
                setDraft(d.payload);
                setSavedAt(d.saved_at || null);
                if (a.state === 'submitted') {
                    // Synthesise a minimal SubmitResponse so the success
                    // screen renders on re-visit. Counts default to 0 —
                    // the reviewer can still read their submitted report
                    // by clicking the link to the assignment detail.
                    setSubmitResult({
                        ok: true,
                        review_id: a.review_id,
                        editor_summary: '(review already submitted — see editor summary on the paper detail)',
                        completed_at: a.completed_at || '',
                        manuscript_id: a.manuscript_id,
                        recommendation: a.recommendation,
                        confidence: null,
                        round_number: 1,
                        major_count: 0, minor_count: 0,
                        suggestions_count: 0, annotations_count: 0,
                    });
                }
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError(err?.response?.data?.detail || 'Could not open the review form.');
            })
            .finally(() => setLoading(false));
    }, [reviewId, navigate]);

    // Keep the ref in sync so autosave/quality polling uses fresh data.
    useEffect(() => { draftRef.current = draft; }, [draft]);

    // ── autosave every 12s while dirty ──
    useEffect(() => {
        if (!reviewId || submitResult) return undefined;
        const id = window.setInterval(async () => {
            if (!dirtyRef.current) return;
            try {
                const res = await saveDraft(reviewId, draftRef.current);
                setSavedAt(res.saved_at || null);
                dirtyRef.current = false;
            } catch {
                // Silent — the reviewer sees "Last saved" not moving; they
                // can hit the manual Save Draft button and see the error.
            }
        }, 12_000);
        return () => window.clearInterval(id);
    }, [reviewId, submitResult]);

    // ── assistant every 4s + quality every 6s ──
    useEffect(() => {
        if (!reviewId || submitResult) return undefined;
        let alive = true;
        const runAll = async () => {
            try {
                setAssistantBusy(true);
                const [a, q] = await Promise.all([
                    runAssistant(reviewId, draftRef.current),
                    runQualityCheck(reviewId, draftRef.current),
                ]);
                if (!alive) return;
                setHints(a.hints);
                setQuality(q);
            } catch {
                /* ignore transient agent errors */
            } finally {
                if (alive) setAssistantBusy(false);
            }
        };
        runAll();
        const id = window.setInterval(runAll, 6_000);
        return () => { alive = false; window.clearInterval(id); };
    }, [reviewId, submitResult]);

    const setField = <K extends keyof DraftPayload>(k: K, v: DraftPayload[K]) => {
        dirtyRef.current = true;
        setDraft((prev) => ({ ...prev, [k]: v }));
    };
    const setRubricAnswer = (key: string, value: string) => {
        dirtyRef.current = true;
        setDraft((prev) => ({ ...prev, rubric_answers: { ...prev.rubric_answers, [key]: value } }));
    };

    const manualSave = async () => {
        if (!reviewId) return;
        try {
            const res = await saveDraft(reviewId, draftRef.current);
            setSavedAt(res.saved_at || null);
            dirtyRef.current = false;
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not save the draft.');
        }
    };

    const handlePreview = async () => {
        if (!reviewId) return;
        setPreviewBusy(true);
        try {
            const res = await previewReport(reviewId, draftRef.current);
            setPreview(res);
            setShowPreview(true);
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not preview the report.');
        } finally {
            setPreviewBusy(false);
        }
    };

    const handleSubmit = async () => {
        if (!reviewId) return;
        setSubmitBusy(true);
        try {
            const res = await submitReview(reviewId, draftRef.current);
            setSubmitResult(res);
            setShowConfirm(false);
            setShowPreview(false);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === 'object' && Array.isArray(detail.blockers)) {
                alert('Cannot submit yet:\n\n' + detail.blockers.join('\n'));
            } else {
                alert(detail || 'Could not submit the review.');
            }
        } finally {
            setSubmitBusy(false);
        }
    };

    // ── rubric progress ──
    // Reviewers get anxious about validation walls. A single "X of N
    // answered" bar frames the same info as a calm progress signal.
    const rubricProgress = useMemo(() => {
        if (!rubric) return { answered: 0, total: 0, pct: 0 };
        const total = rubric.questions.length;
        const answered = rubric.questions.filter(
            (q) => (draft.rubric_answers[q.key] || '').length > 0,
        ).length;
        return {
            answered, total,
            pct: total === 0 ? 100 : Math.round((answered / total) * 100),
        };
    }, [rubric, draft.rubric_answers]);

    // ── grouped rubric ──
    const sections = useMemo(() => {
        if (!rubric) return [] as Array<{ title: string; qs: RubricQuestion[] }>;
        const map = new Map<string, RubricQuestion[]>();
        for (const q of rubric.questions) {
            if (!map.has(q.section)) map.set(q.section, []);
            map.get(q.section)!.push(q);
        }
        const humanTitle = (s: string) => ({
            general: 'Section A — General Evaluation',
            scientific: 'Scientific Quality',
            methodology: 'Methodology',
            results: 'Results',
            novelty: 'Novelty',
        } as Record<string, string>)[s] || s;
        return Array.from(map.entries()).map(([k, qs]) => ({ title: humanTitle(k), qs }));
    }, [rubric]);

    return (
        <ReviewerPortalLayout active="assignments">
            {loading ? (
                <Loading />
            ) : error ? (
                <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error}</div>
            ) : !assignment || !rubric ? null : submitResult ? (
                <div className="bg-white rounded-xl border border-emerald-200 p-8">
                    <div className="text-4xl mb-2">✅</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Review submitted successfully</h1>
                    <p className="text-sm text-gray-600 mb-4">
                        Thank you for reviewing <strong>{assignment.paper_title}</strong>.
                        The editor has been notified.
                    </p>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                            <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Manuscript</dt>
                            <dd className="mt-0.5 font-mono text-xs text-gray-800">{submitResult.manuscript_id}</dd>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Recommendation</dt>
                            <dd className="mt-0.5 text-sm font-bold text-gray-900">
                                {(submitResult.recommendation || 'unspecified').replace('_', ' ').toUpperCase()}
                            </dd>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Round</dt>
                            <dd className="mt-0.5 text-sm font-bold text-gray-900">{submitResult.round_number}</dd>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Submitted</dt>
                            <dd className="mt-0.5 text-xs text-gray-800">{humanTime(submitResult.completed_at)}</dd>
                        </div>
                    </dl>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="bg-rose-50 rounded-lg p-3 text-center">
                            <dt className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold">Major</dt>
                            <dd className="mt-0.5 text-2xl font-bold text-rose-700">{submitResult.major_count}</dd>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3 text-center">
                            <dt className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">Minor</dt>
                            <dd className="mt-0.5 text-2xl font-bold text-amber-800">{submitResult.minor_count}</dd>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                            <dt className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">Suggestions</dt>
                            <dd className="mt-0.5 text-2xl font-bold text-blue-700">{submitResult.suggestions_count}</dd>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 text-center">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-700 font-semibold">Annotations</dt>
                            <dd className="mt-0.5 text-2xl font-bold text-slate-700">{submitResult.annotations_count}</dd>
                        </div>
                    </dl>
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-2">
                            Editor Summary <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agent</span>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap text-gray-800 font-sans">{submitResult.editor_summary}</pre>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/reviewer-dashboard" className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800">
                            Back to dashboard
                        </Link>
                        <Link to="/reviewer/history" className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">
                            View review history
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="-mx-4 sm:-mx-6 lg:-mx-8">
                    {/* ─── Sticky top bar — one row, everything the reviewer needs ─── */}
                    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
                        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4 flex-wrap">
                            <Link
                                to={`/reviewer/assignment/${assignment.review_id}`}
                                className="text-xs text-gray-500 hover:text-blue-700 whitespace-nowrap"
                            >
                                ← Back
                            </Link>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-sm font-bold text-gray-900 truncate">
                                    {assignment.paper_title}
                                </h1>
                                <p className="text-[11px] text-gray-500 font-mono truncate">
                                    {assignment.manuscript_id} · Due {humanTime(assignment.deadline)}
                                </p>
                            </div>
                            <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-500">
                                <span className="inline-flex items-center gap-1">
                                    <span
                                        className={
                                            'inline-block h-1.5 w-1.5 rounded-full ' +
                                            (dirtyRef.current ? 'bg-amber-400' : 'bg-emerald-500')
                                        }
                                    />
                                    {savedAt ? `Saved ${humanTime(savedAt)}` : 'Not saved yet'}
                                </span>
                            </div>
                            <ValidationSummary
                                report={quality}
                                onOpen={() => setValidationOpen((v) => !v)}
                            />
                            <button
                                type="button"
                                onClick={manualSave}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                onClick={handlePreview}
                                disabled={previewBusy}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 border border-blue-300 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                            >
                                {previewBusy ? 'Preview…' : 'Preview'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowConfirm(true)}
                                disabled={!!quality && !quality.ok}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                title={quality && !quality.ok ? 'Fix the blockers listed above first.' : ''}
                            >
                                Submit Review
                            </button>
                        </div>
                    </div>

                    {/* ─── Two-column workspace: PDF sticky left, form scrolls right ─── */}
                    <div className="px-4 sm:px-6 lg:px-8 pt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)] gap-6">

                        {/* ── PDF (sticky) ── */}
                        <div className="hidden lg:block">
                            <div className="sticky top-16">
                                <PdfPanel
                                    assignment={assignment}
                                    onSelectedText={async (selected) => {
                                        try {
                                            const res = await suggestAnnotation(reviewId, selected);
                                            dirtyRef.current = true;
                                            setDraft((prev) => ({
                                                ...prev,
                                                page_annotations: [
                                                    ...prev.page_annotations,
                                                    {
                                                        page: 1,
                                                        lines: '',
                                                        type: (res.suggested_type as any),
                                                        text: res.suggested_prompt || selected.trim(),
                                                    },
                                                ],
                                            }));
                                        } catch (err: any) {
                                            alert(err?.response?.data?.detail || 'Could not add annotation.');
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* ── Form column ── */}
                        <div className="min-w-0 pb-8">

                            {/* Rubric progress meter — calm, not shouty. */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                        Rubric Progress
                                    </span>
                                    <span className="text-xs font-mono text-gray-500">
                                        {rubricProgress.answered} / {rubricProgress.total} answered
                                    </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className={
                                            'h-full transition-all duration-300 ' +
                                            (rubricProgress.pct === 100
                                                ? 'bg-emerald-500'
                                                : rubricProgress.pct > 50
                                                ? 'bg-blue-500'
                                                : 'bg-amber-400')
                                        }
                                        style={{ width: `${rubricProgress.pct}%` }}
                                    />
                                </div>
                            </div>

                            {/* Validation panel — collapsed unless the reviewer opens it. */}
                            {validationOpen && (
                                <ValidationPanel
                                    report={quality}
                                    onClose={() => setValidationOpen(false)}
                                />
                            )}

                            {/* Assistant — collapsible, sits inside the form column. */}
                            <div className="mb-4">
                                <AssistantPanel
                                    hints={hints}
                                    busy={assistantBusy}
                                    open={assistantOpen}
                                    onToggle={() => setAssistantOpen((v) => !v)}
                                />
                            </div>

                        {/* Overall assessment (spec §2A) */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                                Overall Assessment
                            </h2>
                            <p className="text-xs text-gray-500 mb-2">
                                A brief summary of your read of the paper before the itemised comments.
                                One or two paragraphs is enough.
                            </p>
                            <textarea
                                value={draft.overall_assessment}
                                onChange={(e) => setField('overall_assessment', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg text-sm p-3 font-mono"
                                rows={4}
                                placeholder="This manuscript investigates…"
                            />
                        </div>

                        {/* Rubric sections */}
                        {sections.map((s) => (
                            <div key={s.title} className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                                    {s.title}
                                </h2>
                                <div>
                                    {s.qs.map((q) => (
                                        <RubricRow
                                            key={q.key} q={q}
                                            value={draft.rubric_answers[q.key] || ''}
                                            onChange={(v) => setRubricAnswer(q.key, v)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Major comments — structured repeating list */}
                        <StructuredCommentList
                            label="Major Comments"
                            tone="rose"
                            values={draft.major_comments}
                            onChange={(v) => setField('major_comments', v)}
                            helpText="Substantive problems that must be addressed. Anchor each to a page / section / line so the authors know where."
                        />

                        {/* Minor comments — structured repeating list */}
                        <StructuredCommentList
                            label="Minor Comments"
                            tone="amber"
                            values={draft.minor_comments}
                            onChange={(v) => setField('minor_comments', v)}
                            helpText="Corrections that don't invalidate the research. Grammar, figures, tables, references."
                        />

                        {/* Suggestions to authors — repeating one-liners */}
                        <SuggestionsList
                            values={draft.suggestions}
                            onChange={(v) => setField('suggestions', v)}
                        />

                        {/* Comments to authors — free text (kept as a catch-all) */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                                Comments to Authors <span className="text-xs text-gray-400 font-normal">(overall)</span>
                            </h2>
                            <p className="text-xs text-gray-500 mb-2">
                                An overall paragraph summarising your read of the paper.
                                Item-level details belong in the Major / Minor / Suggestions
                                sections above.
                            </p>
                            <textarea
                                value={draft.comments_to_authors}
                                onChange={(e) => setField('comments_to_authors', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg text-sm p-3 font-mono"
                                rows={5}
                                placeholder="The manuscript addresses… Overall the paper…"
                            />
                        </div>

                        {/* Ethical concerns — separate flag */}
                        <div className={
                            'rounded-xl border p-5 mb-4 ' +
                            (draft.ethics_flag ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white')
                        }>
                            <label className="flex items-start gap-2 text-sm font-semibold text-gray-900 mb-1">
                                <input
                                    type="checkbox"
                                    checked={draft.ethics_flag}
                                    onChange={(e) => setField('ethics_flag', e.target.checked)}
                                />
                                <span>⚠ Flag an ethical concern for the editor</span>
                            </label>
                            <p className="text-xs text-gray-600 mb-2 pl-6">
                                Confidential — only the editorial team sees this. Use this for
                                data-integrity concerns, prior-publication overlap, missing
                                consent, or authorship issues.
                            </p>
                            {draft.ethics_flag && (
                                <textarea
                                    value={draft.ethics_note}
                                    onChange={(e) => setField('ethics_note', e.target.value)}
                                    className="w-full border border-rose-300 rounded-lg text-sm p-3 bg-white"
                                    rows={4}
                                    placeholder="Describe the concern for the editor…"
                                />
                            )}
                        </div>

                        {/* Page-anchored comments */}
                        <AnnotationList
                            reviewId={reviewId}
                            values={draft.page_annotations}
                            onChange={(v) => {
                                dirtyRef.current = true;
                                setDraft((prev) => ({ ...prev, page_annotations: v }));
                            }}
                        />

                        {/* Comments to editor */}
                        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/40 p-5 mb-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                                Confidential Comments to Editor
                            </h2>
                            <p className="text-xs text-amber-800 mb-2">
                                This section will not be shared with the authors.
                            </p>
                            <textarea
                                value={draft.comments_to_editor}
                                onChange={(e) => setField('comments_to_editor', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg text-sm p-3 font-mono bg-white"
                                rows={5}
                                placeholder="Information intended only for the editor."
                            />
                        </div>

                        {/* Recommendation + confidence */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                                Recommendation <span className="text-rose-600">*</span>
                            </h2>
                            <div className="mb-3">
                                {rubric.recommendations.map((r) => (
                                    <Radio
                                        key={r.value} name="recommendation" value={r.value}
                                        checked={draft.recommendation === r.value}
                                        onChange={() => setField('recommendation', r.value)}
                                        label={r.label}
                                    />
                                ))}
                            </div>
                            <div className="text-sm font-semibold text-gray-800 mb-1">Overall Confidence</div>
                            <div className="mb-3">
                                {rubric.confidences.map((c) => (
                                    <Radio
                                        key={c.value} name="confidence" value={c.value}
                                        checked={draft.confidence === c.value}
                                        onChange={() => setField('confidence', c.value)}
                                        label={c.label}
                                    />
                                ))}
                            </div>
                            <div className="text-sm font-semibold text-gray-800 mb-1">
                                Willing to review a revised version?
                            </div>
                            <div>
                                <Radio
                                    name="willing" value="yes"
                                    checked={draft.willing_to_review_revision === true}
                                    onChange={() => setField('willing_to_review_revision', true)}
                                    label="Yes"
                                />
                                <Radio
                                    name="willing" value="no"
                                    checked={draft.willing_to_review_revision === false}
                                    onChange={() => setField('willing_to_review_revision', false)}
                                    label="No"
                                />
                            </div>
                        </div>

                        {/* COI confirm gate for submit */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                            <label className="flex items-start gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={draft.coi_declared === true}
                                    onChange={(e) => setField('coi_declared', e.target.checked || null)}
                                />
                                <span>
                                    I confirm the COI declaration recorded during acceptance
                                    is still accurate.
                                </span>
                            </label>
                        </div>

                            {/* Bottom action bar — sticky-top has the primary buttons, this is a mirror for reach on long pages. */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-2 items-center mt-4">
                                <span className="text-xs text-gray-500">
                                    Autosaves every 12 seconds while you type.
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button
                                        type="button" onClick={manualSave}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
                                    >
                                        Save Draft
                                    </button>
                                    <button
                                        type="button" onClick={handlePreview} disabled={previewBusy}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-blue-700 border border-blue-300 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                                    >
                                        {previewBusy ? 'Loading preview…' : 'Preview Review'}
                                    </button>
                                    <button
                                        type="button" onClick={() => setShowConfirm(true)}
                                        disabled={!!quality && !quality.ok}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                        title={quality && !quality.ok ? 'Fix the blockers listed above first.' : ''}
                                    >
                                        Submit Review
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preview Review modal */}
                    {showPreview && preview && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                            role="dialog" aria-modal="true"
                        >
                            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Reviewer Report — Preview</h3>
                                        <p className="text-xs text-gray-500">
                                            This is exactly what the editor will see once you submit.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPreview(false)}
                                        className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                                        aria-label="Close preview"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="p-6 overflow-y-auto text-sm">
                                    <div className="mb-4">
                                        <div className="font-mono text-xs text-gray-500">{preview.report.manuscript_id} · {preview.report.reviewer_display_name}</div>
                                        <h4 className="text-lg font-bold text-gray-900">{preview.report.paper_title}</h4>
                                        <div className="mt-1 text-xs text-gray-600">
                                            Recommendation:{' '}
                                            <strong className="text-gray-900">
                                                {(preview.report.recommendation || 'unspecified').replace('_', ' ').toUpperCase()}
                                            </strong>
                                            {' · '}Confidence:{' '}
                                            <strong className="text-gray-900">{preview.report.confidence || '—'}</strong>
                                            {' · '}Round {preview.report.round_number}
                                        </div>
                                    </div>

                                    {preview.report.ethics_flag && (
                                        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 mb-4 text-xs text-rose-900">
                                            <strong>⚠ Ethics concern flagged.</strong>
                                            {preview.report.ethics_note ? <> {preview.report.ethics_note}</> : null}
                                        </div>
                                    )}

                                    {preview.report.overall_assessment && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Overall Assessment</h5>
                                            <p className="whitespace-pre-wrap text-gray-800">{preview.report.overall_assessment}</p>
                                        </section>
                                    )}
                                    {preview.report.major_comments.length > 0 && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1">Major Comments ({preview.counts.major})</h5>
                                            <ol className="list-decimal pl-5 space-y-2">
                                                {preview.report.major_comments.map((c, i) => (
                                                    <li key={i}>
                                                        {(c.page || c.section || c.line) && (
                                                            <div className="text-[11px] text-gray-500">
                                                                {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                    {preview.report.minor_comments.length > 0 && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">Minor Comments ({preview.counts.minor})</h5>
                                            <ol className="list-decimal pl-5 space-y-2">
                                                {preview.report.minor_comments.map((c, i) => (
                                                    <li key={i}>
                                                        {(c.page || c.section || c.line) && (
                                                            <div className="text-[11px] text-gray-500">
                                                                {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`].filter(Boolean).join(', ')}
                                                            </div>
                                                        )}
                                                        <div className="text-gray-800 whitespace-pre-wrap">{c.comment}</div>
                                                    </li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                    {preview.report.suggestions.length > 0 && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">Suggestions ({preview.counts.suggestions})</h5>
                                            <ol className="list-decimal pl-5 space-y-1">
                                                {preview.report.suggestions.map((s, i) => (
                                                    <li key={i} className="text-gray-800">{s}</li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                    {preview.report.comments_to_authors && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Comments to Authors</h5>
                                            <p className="whitespace-pre-wrap text-gray-800">{preview.report.comments_to_authors}</p>
                                        </section>
                                    )}
                                    {preview.report.comments_to_editor && (
                                        <section className="mb-4 border border-amber-200 bg-amber-50 rounded p-3">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">Confidential Comments to Editor</h5>
                                            <p className="whitespace-pre-wrap text-gray-800">{preview.report.comments_to_editor}</p>
                                        </section>
                                    )}
                                    {preview.report.page_annotations.length > 0 && (
                                        <section className="mb-4">
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Page-anchored comments ({preview.counts.annotations})</h5>
                                            <ul className="space-y-1 text-gray-800">
                                                {preview.report.page_annotations.map((a, i) => (
                                                    <li key={i}>
                                                        <span className="font-mono text-[11px] text-gray-500">Page {a.page}{a.lines ? `, ${a.lines}` : ''} · {a.type}</span> — {a.text}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {!preview.validation_ok && (
                                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                                            <strong>Cannot submit yet:</strong>
                                            <ul className="list-disc pl-4 mt-1">
                                                {preview.validation_blockers.map((b, i) => <li key={i}>{b}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowPreview(false)}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                    >
                                        Keep editing
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowPreview(false); setShowConfirm(true); }}
                                        disabled={!preview.validation_ok}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Continue to Submit
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Submit confirmation modal (spec §9) */}
                    {showConfirm && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                            role="dialog" aria-modal="true"
                        >
                            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Review Submission</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    You are about to submit your review for{' '}
                                    <strong>{assignment.manuscript_id}</strong>.
                                    After submission your review will be <strong>locked</strong> and sent to the editorial team.
                                </p>
                                <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Recommendation</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">
                                            {(draft.recommendation || 'unspecified').replace('_', ' ').toUpperCase()}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Confidence</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">
                                            {(draft.confidence || 'unspecified').toUpperCase()}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Major Comments</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">{draft.major_comments.filter((c) => c.comment.trim()).length}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Minor Comments</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">{draft.minor_comments.filter((c) => c.comment.trim()).length}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Suggestions</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">{draft.suggestions.filter((s) => s.trim()).length}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Annotations</dt>
                                        <dd className="mt-0.5 font-bold text-gray-900">{draft.page_annotations.length}</dd>
                                    </div>
                                </dl>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button" onClick={() => setShowConfirm(false)} disabled={submitBusy}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button" onClick={handleSubmit} disabled={submitBusy}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                                    >
                                        {submitBusy ? 'Submitting…' : 'Confirm & Submit'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </ReviewerPortalLayout>
    );
}
