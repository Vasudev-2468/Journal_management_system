import React, { useEffect, useMemo, useRef, useState } from 'react';
import Loading from '../components/common/Loading';
import BackButton from '../components/common/BackButton';
import {
    EmailTemplate,
    fetchEmailTemplates,
    updateEmailTemplate,
} from '../api/platform';

// ── Template catalog ─────────────────────────────────────
//
// Maps each backend ``slug`` to designer-facing metadata: a human
// name, an emoji glyph, a short "when it fires" line, and a category
// (author-facing / reviewer-facing / editor-facing). Slugs not on this
// list still render — the fallback produces a sensible "prettified"
// title so a template added later on the backend appears without
// requiring a frontend change.

type Category = 'author' | 'reviewer' | 'editor' | 'system';

interface TemplateMeta {
    label: string;
    icon: string;
    category: Category;
    fires: string;
}

const TEMPLATE_CATALOG: Record<string, TemplateMeta> = {
    // ── Author-facing ─────────────────────────────
    submission_confirmation: { label: 'Submission received',        icon: '📥', category: 'author',   fires: 'Immediately after a successful submission' },
    author_acknowledgment:   { label: 'Submission received',        icon: '📥', category: 'author',   fires: 'Immediately after a successful submission' },
    acceptance:              { label: 'Acceptance letter',          icon: '🎉', category: 'author',   fires: 'When the editor accepts the manuscript' },
    rejection:               { label: 'Rejection letter',           icon: '📄', category: 'author',   fires: 'When the editor rejects the manuscript' },
    revision_request:        { label: 'Revision request',           icon: '✏️', category: 'author',   fires: 'When the editor asks for revisions' },
    revision_approved:       { label: 'Revision approved',          icon: '✅', category: 'author',   fires: 'When the revised manuscript is accepted' },
    decision_to_author:      { label: 'Editorial decision',         icon: '⚖️', category: 'author',   fires: 'When the editor finalises any decision' },
    proof_notification:      { label: 'Proof ready',                icon: '📋', category: 'author',   fires: 'When the typeset proof is available' },
    publication_notification:{ label: 'Publication announcement',   icon: '🚀', category: 'author',   fires: 'When the article goes live online' },
    // ── Reviewer-facing ───────────────────────────
    reviewer_invitation:     { label: 'Reviewer invitation',        icon: '📨', category: 'reviewer', fires: 'When the editor invites a reviewer' },
    reviewer_reminder:       { label: 'Reviewer reminder',          icon: '⏰', category: 'reviewer', fires: 'A few days before the review deadline' },
    review_received:         { label: 'Review received (thanks)',   icon: '🙏', category: 'reviewer', fires: 'After a reviewer submits their review' },
    reviewer_thanks:         { label: 'Reviewer thanks',            icon: '🙏', category: 'reviewer', fires: 'After a reviewer completes an assignment' },
    reviewer_welcome:        { label: 'Reviewer welcome',           icon: '✨', category: 'reviewer', fires: 'After a reviewer self-registers' },
    // ── Editor-facing ─────────────────────────────
    editor_assigned:         { label: 'Editor assigned',            icon: '👤', category: 'editor',   fires: 'When the editorial office assigns an editor' },
    editor_new_submission:   { label: 'New submission alert',       icon: '📄', category: 'editor',   fires: 'When a new manuscript arrives' },
    editor_escalation:       { label: 'Escalation alert',           icon: '⚠️', category: 'editor',   fires: 'When AI cannot confidently classify a paper' },
    // ── System-facing ─────────────────────────────
    password_reset_request:  { label: 'Password reset',             icon: '🔑', category: 'system',   fires: 'When a user requests a password reset' },
    editor_mfa_otp_email:    { label: 'Editor sign-in code',        icon: '🔐', category: 'system',   fires: 'Two-factor code for editor login' },
    author_mfa_otp_email:    { label: 'Author sign-in code',        icon: '🔐', category: 'system',   fires: 'Two-factor code for author login' },
};

const CATEGORY_STYLES: Record<Category, { pill: string; chip: string; icon: string; label: string; order: number }> = {
    author:   { pill: 'bg-blue-100 text-blue-800',       chip: 'bg-blue-50 text-blue-700 border-blue-200',       icon: 'bg-blue-100 text-blue-700',       label: 'Author',   order: 0 },
    reviewer: { pill: 'bg-emerald-100 text-emerald-800', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', label: 'Reviewer', order: 1 },
    editor:   { pill: 'bg-purple-100 text-purple-800',   chip: 'bg-purple-50 text-purple-700 border-purple-200', icon: 'bg-purple-100 text-purple-700',   label: 'Editor',   order: 2 },
    system:   { pill: 'bg-slate-100 text-slate-800',     chip: 'bg-slate-50 text-slate-700 border-slate-200',     icon: 'bg-slate-100 text-slate-700',     label: 'System',   order: 3 },
};

function describe(slug: string): TemplateMeta {
    if (TEMPLATE_CATALOG[slug]) return TEMPLATE_CATALOG[slug];
    const pretty = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ');
    return { label: pretty, icon: '✉️', category: 'system', fires: '' };
}

// ── Preview substitution ────────────────────────────────
//
// Sample values used to render a "what the recipient would actually
// see" preview. Every placeholder the current form references gets a
// realistic-looking substitution so the editor can spot rough spots
// (double spaces, missing punctuation) before hitting Save.

const PREVIEW_SAMPLES: Record<string, string> = {
    paper_id_code: 'JGAIR-2026-0042',
    submission_id: 'JGAIR-2026-0042',
    paper_title: 'Deep Multimodal Fusion for Weakly-Supervised Medical Imaging',
    author_name: 'Dr. Priya Ramanathan',
    reviewer_name: 'Prof. Chen Wei',
    editor_name: 'Dr. Michael Ross',
    classified_field: 'Machine Learning',
    confidence: '92%',
    reason: 'Confidence below 60% threshold',
    editor_comments: 'The revisions address the reviewers\' concerns cleanly. Thank you.',
    review_link: 'https://jgair.example.com/review/eyJhbGciOiJIUzI1NiIs',
    dashboard_url: 'https://jgair.example.com/editor',
    deadline_date: 'September 30, 2026',
    revision_deadline: 'October 15, 2026',
    days_remaining: '3',
    decision: 'Accepted',
    action_link: 'https://jgair.example.com/action/eyJhbGciOiJIUzI1NiIs',
    otp: '482913',
    verification_code: '482913',
};

function renderPreview(text: string): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name) => {
        return PREVIEW_SAMPLES[name] ?? match;
    });
}

// ── Page ────────────────────────────────────────────────

const EditorEmailTemplatesPage: React.FC = () => {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<EmailTemplate> | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
    const [search, setSearch] = useState('');
    const [showPreview, setShowPreview] = useState(true);

    const subjectRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    // ``lastFocused`` remembers which of subject/body the editor was
    // touching when they clicked a placeholder chip so we know where to
    // splice the placeholder into.
    const lastFocused = useRef<'subject' | 'body'>('body');

    const load = () => {
        setLoading(true);
        fetchEmailTemplates()
            .then((data) => {
                setTemplates(data);
                if (data.length > 0 && !activeSlug) setActiveSlug(data[0].slug);
            })
            .catch((err) => setError(err?.message || 'Failed to load templates.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, []); // eslint-disable-line

    const active = useMemo(
        () => templates.find((t) => t.slug === activeSlug) || null,
        [templates, activeSlug],
    );

    useEffect(() => {
        setDraft(active ? { ...active } : null);
        setSavedAt(null);
    }, [active]);

    const isDirty = useMemo(() => {
        if (!draft || !active) return false;
        return (
            (draft.subject || '') !== (active.subject || '') ||
            (draft.body || '') !== (active.body || '') ||
            (draft.description || '') !== (active.description || '') ||
            !!draft.is_active !== !!active.is_active
        );
    }, [draft, active]);

    const save = async () => {
        if (!draft || !active) return;
        setSaving(true);
        setError(null);
        try {
            const updated = await updateEmailTemplate(active.slug, {
                subject: draft.subject,
                body: draft.body,
                description: draft.description,
                placeholders: draft.placeholders,
                is_active: draft.is_active,
            });
            setTemplates((prev) => prev.map((t) => (t.slug === updated.slug ? updated : t)));
            setSavedAt(Date.now());
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    // ── Placeholder insertion ──
    //
    // Splice ``{{name}}`` into whichever field the editor last touched
    // at the current caret position. Falls back to appending when we
    // have no selection reference.
    const insertPlaceholder = (name: string) => {
        if (!draft) return;
        const token = `{{${name}}}`;
        if (lastFocused.current === 'subject' && subjectRef.current) {
            const el = subjectRef.current;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            const next = el.value.slice(0, start) + token + el.value.slice(end);
            setDraft({ ...draft, subject: next });
            setTimeout(() => {
                el.focus();
                el.setSelectionRange(start + token.length, start + token.length);
            }, 0);
        } else if (bodyRef.current) {
            const el = bodyRef.current;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            const next = el.value.slice(0, start) + token + el.value.slice(end);
            setDraft({ ...draft, body: next });
            setTimeout(() => {
                el.focus();
                el.setSelectionRange(start + token.length, start + token.length);
            }, 0);
        } else {
            setDraft({ ...draft, body: (draft.body || '') + token });
        }
    };

    const activeMeta = active ? describe(active.slug) : null;

    // The paper-ID placeholder is treated specially because the user
    // asked that every template surface it — the banner nudges towards
    // adding it if missing, and the chip is highlighted.
    const currentText = `${draft?.subject || ''}\n${draft?.body || ''}`;
    const hasPaperId = /\{\{\s*paper_id_code\s*\}\}/.test(currentText);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return templates.filter((t) => {
            const meta = describe(t.slug);
            if (categoryFilter !== 'all' && meta.category !== categoryFilter) return false;
            if (!q) return true;
            return (
                t.slug.toLowerCase().includes(q) ||
                meta.label.toLowerCase().includes(q) ||
                meta.fires.toLowerCase().includes(q)
            );
        });
    }, [templates, categoryFilter, search]);

    const grouped = useMemo(() => {
        const buckets: Record<Category, EmailTemplate[]> = { author: [], reviewer: [], editor: [], system: [] };
        for (const t of filtered) buckets[describe(t.slug).category].push(t);
        return buckets;
    }, [filtered]);

    // Placeholders shown as chips — union of the template's declared
    // placeholders and a few defaults that every template should know about.
    const chipPlaceholders = useMemo(() => {
        const declared = (active?.placeholders || '')
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        const always = ['paper_id_code'];
        const seen = new Set<string>();
        return [...always, ...declared].filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
    }, [active]);

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <BackButton className="mb-4" />

                {/* ── Header ─────────────────────────────────── */}
                <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span aria-hidden>📧</span> Email templates
                        </h1>
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                            Customise the transactional emails sent by JGAIR. Every template
                            substitutes <code className="text-xs bg-gray-100 px-1 rounded font-mono">{'{{placeholder}}'}</code>{' '}
                            tokens at send time.
                        </p>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                {loading ? (
                    <Loading />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* ── Sidebar ────────────────────────── */}
                        <aside className="lg:col-span-1 space-y-3">
                            <div className="bg-white rounded-2xl border border-gray-200 p-3 sticky top-6">
                                <div className="relative mb-2">
                                    <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search templates…"
                                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        aria-label="Search templates"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {(['all', 'author', 'reviewer', 'editor', 'system'] as const).map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setCategoryFilter(c)}
                                            className={`text-[11px] font-medium px-2 py-1 rounded-full transition ${
                                                categoryFilter === c
                                                    ? 'bg-gray-900 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {c === 'all' ? 'All' : CATEGORY_STYLES[c as Category].label}
                                        </button>
                                    ))}
                                </div>

                                {(['author', 'reviewer', 'editor', 'system'] as Category[]).map((cat) => {
                                    const rows = grouped[cat];
                                    if (rows.length === 0) return null;
                                    return (
                                        <div key={cat} className="mb-4 last:mb-0">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-2 mb-1">
                                                {CATEGORY_STYLES[cat].label} <span className="text-gray-400">· {rows.length}</span>
                                            </div>
                                            <ul className="space-y-0.5">
                                                {rows.map((t) => {
                                                    const meta = describe(t.slug);
                                                    const styles = CATEGORY_STYLES[meta.category];
                                                    return (
                                                        <li key={t.slug}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveSlug(t.slug)}
                                                                className={`w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-lg transition ${
                                                                    activeSlug === t.slug
                                                                        ? 'bg-blue-50 ring-1 ring-blue-200'
                                                                        : 'hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <div className={`flex-none w-8 h-8 rounded-lg flex items-center justify-center text-sm ${styles.icon}`} aria-hidden>
                                                                    {meta.icon}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                                                                        <span className="truncate">{meta.label}</span>
                                                                        {!t.is_active && (
                                                                            <span className="flex-none text-[9px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">off</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[10px] font-mono text-gray-400 truncate">
                                                                        /{t.slug}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })}

                                {filtered.length === 0 && (
                                    <div className="text-center text-xs text-gray-400 py-4">
                                        No templates match.
                                    </div>
                                )}
                            </div>
                        </aside>

                        {/* ── Editor pane ────────────────────── */}
                        <main className="lg:col-span-3">
                            {!draft || !active || !activeMeta ? (
                                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
                                    Select a template to edit.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Card header */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className={`flex-none w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${CATEGORY_STYLES[activeMeta.category].icon}`} aria-hidden>
                                                    {activeMeta.icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h2 className="text-lg font-bold text-gray-900">{activeMeta.label}</h2>
                                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_STYLES[activeMeta.category].pill}`}>
                                                            {CATEGORY_STYLES[activeMeta.category].label}
                                                        </span>
                                                    </div>
                                                    {activeMeta.fires && (
                                                        <p className="text-sm text-gray-500 mt-0.5">{activeMeta.fires}</p>
                                                    )}
                                                    <p className="text-[10px] font-mono text-gray-400 mt-1">/{active.slug}</p>
                                                </div>
                                            </div>
                                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 flex-none">
                                                <input
                                                    type="checkbox"
                                                    checked={!!draft.is_active}
                                                    onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                                                    className="w-4 h-4 accent-emerald-600"
                                                />
                                                Active
                                            </label>
                                        </div>
                                    </div>

                                    {/* Paper-ID reminder banner — visible when the paper_id_code
                                        token is missing from the template. Not a hard block since
                                        a few templates (password_reset, mfa OTP) genuinely have no
                                        paper reference — but every editorial email should carry it. */}
                                    {!hasPaperId && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                                            <span className="text-lg" aria-hidden>🔖</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-amber-900">Missing paper ID</p>
                                                <p className="text-xs text-amber-800 mt-0.5">
                                                    Recipients quote <code className="font-mono bg-white/60 px-1 rounded">{'{{paper_id_code}}'}</code>{' '}
                                                    when they reply about a submission. Every editorial template should reference it somewhere in the subject or body.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => insertPlaceholder('paper_id_code')}
                                                className="flex-none text-xs font-semibold text-amber-900 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100"
                                            >
                                                Insert paper ID
                                            </button>
                                        </div>
                                    )}

                                    {/* Placeholder chips */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Placeholders — click to insert</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {chipPlaceholders.map((p) => {
                                                const isPaperId = p === 'paper_id_code';
                                                const present = new RegExp(`\\{\\{\\s*${p}\\s*\\}\\}`).test(currentText);
                                                return (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => insertPlaceholder(p)}
                                                        title={`Insert {{${p}}}`}
                                                        className={`text-xs font-mono px-2.5 py-1 rounded-full border transition ${
                                                            isPaperId
                                                                ? present
                                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                                                                    : 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100 ring-1 ring-amber-200'
                                                                : present
                                                                ? 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {present && !isPaperId ? '✓ ' : '+ '}
                                                        {`{{${p}}}`}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Subject */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                                        <label className="block">
                                            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Subject line</span>
                                            <input
                                                ref={subjectRef}
                                                value={draft.subject || ''}
                                                onFocus={() => (lastFocused.current = 'subject')}
                                                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </label>
                                    </div>

                                    {/* Body */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                                        <label className="block">
                                            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Body</span>
                                            <textarea
                                                ref={bodyRef}
                                                value={draft.body || ''}
                                                onFocus={() => (lastFocused.current = 'body')}
                                                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                                                rows={14}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </label>
                                    </div>

                                    {/* Live preview */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Preview (sample values)</p>
                                            <button
                                                type="button"
                                                onClick={() => setShowPreview((v) => !v)}
                                                className="text-xs text-blue-700 hover:underline"
                                            >
                                                {showPreview ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                        {showPreview && (
                                            <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                                                <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Subject</span>
                                                    <span className="text-sm font-medium text-gray-900 truncate">
                                                        {renderPreview(draft.subject || '')}
                                                    </span>
                                                </div>
                                                <div className="px-4 py-3 whitespace-pre-wrap text-sm text-gray-800 leading-relaxed max-h-[360px] overflow-y-auto">
                                                    {renderPreview(draft.body || '')}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5">
                                        <label className="block">
                                            <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                                Editor note (not sent to recipients)
                                            </span>
                                            <input
                                                value={draft.description || ''}
                                                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                                placeholder="Anything future editors should know about this template."
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </label>
                                    </div>

                                    {/* Save bar — sticky at the bottom of the pane */}
                                    <div className="sticky bottom-4 z-10 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
                                        <div className="text-xs text-gray-500">
                                            {saving ? (
                                                'Saving…'
                                            ) : isDirty ? (
                                                <span className="text-amber-700 font-medium">Unsaved changes</span>
                                            ) : savedAt ? (
                                                <span className="text-emerald-700 font-medium">✓ Saved just now</span>
                                            ) : (
                                                'No unsaved changes'
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDraft({ ...active })}
                                                disabled={!isDirty || saving}
                                                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Reset
                                            </button>
                                            <button
                                                type="button"
                                                onClick={save}
                                                disabled={!isDirty || saving}
                                                className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                            >
                                                {saving ? 'Saving…' : 'Save changes'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorEmailTemplatesPage;
