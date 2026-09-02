import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    BoardCategory,
    BoardMember,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    createBoardMember,
    CvParseResult,
    deleteBoardMember,
    fetchBoardMembers,
    getBoardInvitationLink,
    inviteBoardMember,
    parseBoardMemberCv,
    resendBoardInvitation,
    revokeBoardInvitation,
    updateBoardMember,
    uploadBoardFileAsEditor,
} from '../api/board';
import Loading from '../components/common/Loading';
import BackButton from '../components/common/BackButton';
import BoardCsvPanel from '../components/board/BoardCsvPanel';

const BLANK: Omit<BoardMember, 'id'> = {
    name: '',
    role: '',
    category: 'board_member',
    affiliation: '',
    department: '',
    country: '',
    email: '',
    orcid: '',
    scholar_url: '',
    scopus_id: '',
    institutional_profile_url: '',
    qualifications: '',
    bio: '',
    expertise: '',
    photo_url: '',
    phone: '',
    keywords: '',
    years_editorial_experience: null,
    max_active_manuscripts: null,
    photo_file_url: null,
    resume_file_url: null,
    certification_files: null,
    sort_order: 100,
    is_active: true,
};

// Grouped field spec — drives the manual-entry form's section headers
// so the shape of "the 15 core fields" is visible at a glance instead of
// being hidden inside one long grid.
type FieldKey = keyof Omit<BoardMember, 'id'>;
type FieldSpec = { key: FieldKey; label: string; placeholder?: string; type?: 'text' | 'email' | 'tel' | 'number' | 'url' };

const IDENTITY_FIELDS: FieldSpec[] = [
    { key: 'name', label: 'Full name *', placeholder: 'Dr. Jane Smith' },
    { key: 'email', label: 'Email *', placeholder: 'jane@university.edu', type: 'email' },
    { key: 'phone', label: 'Phone', placeholder: '+1 415 555 0134', type: 'tel' },
    { key: 'country', label: 'Country', placeholder: 'India' },
];

const INSTITUTION_FIELDS: FieldSpec[] = [
    { key: 'affiliation', label: 'Institution', placeholder: 'ABC University' },
    { key: 'department', label: 'Department', placeholder: 'Computer Science' },
    { key: 'role', label: 'Designation / role *', placeholder: 'Associate Professor' },
    { key: 'institutional_profile_url', label: 'Institutional profile URL', type: 'url' },
];

const ACADEMIC_ID_FIELDS: FieldSpec[] = [
    { key: 'orcid', label: 'ORCID', placeholder: '0000-0000-0000-0000' },
    { key: 'scopus_id', label: 'Scopus Author ID' },
    { key: 'scholar_url', label: 'Google Scholar URL', type: 'url' },
    { key: 'photo_url', label: 'Photo URL', type: 'url' },
];

const ASSIGNMENT_FIELDS: FieldSpec[] = [
    { key: 'years_editorial_experience', label: 'Years of editorial experience', type: 'number', placeholder: '5' },
    { key: 'max_active_manuscripts', label: 'Max active manuscripts', type: 'number', placeholder: '10' },
];

const TEXTAREA_FIELDS: { key: FieldKey; label: string; placeholder?: string; rows?: number }[] = [
    { key: 'expertise', label: 'Primary expertise', placeholder: 'Comma-separated: Machine Learning, NLP, Computer Vision', rows: 2 },
    { key: 'keywords', label: 'Keywords', placeholder: '5–20 comma-separated keywords: Deep Learning, Transformers, Medical Imaging…', rows: 2 },
    { key: 'qualifications', label: 'Academic qualifications', placeholder: 'PhD in CS, Stanford, 2010; MSc, IIT Bombay, 2005', rows: 2 },
    { key: 'bio', label: 'Short bio', rows: 3 },
];

const EditorEditorialBoardAdmin: React.FC = () => {
    const [members, setMembers] = useState<BoardMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<BoardMember | null>(null);
    const [creating, setCreating] = useState<Omit<BoardMember, 'id'> | null>(null);
    const [inviting, setInviting] = useState(false);
    const [inviteNotice, setInviteNotice] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<BoardCategory | ''>('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchBoardMembers(true);
            setMembers(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load members.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(
        () => (filterCategory ? members.filter((m) => m.category === filterCategory) : members),
        [members, filterCategory],
    );

    const save = async () => {
        try {
            if (editing) {
                const updated = await updateBoardMember(editing.id, editing);
                setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
                setEditing(null);
            } else if (creating) {
                const created = await createBoardMember(creating);
                setMembers((prev) => [...prev, created]);
                setCreating(null);
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Save failed.');
        }
    };

    const remove = async (member: BoardMember) => {
        if (!window.confirm(`Remove ${member.name} from the board?`)) return;
        try {
            await deleteBoardMember(member.id);
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
        } catch {
            /* noop */
        }
    };

    const draft = editing ?? creating;
    const setDraftField = (key: keyof Omit<BoardMember, 'id'>, value: any) => {
        if (editing) setEditing({ ...editing, [key]: value } as BoardMember);
        else if (creating) setCreating({ ...creating, [key]: value } as Omit<BoardMember, 'id'>);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <BackButton className="mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900">Editorial Board</h1>
                    <div className="flex items-center gap-2">
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value as BoardCategory | '')}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            <option value="">All categories</option>
                            {CATEGORY_ORDER.map((c) => (
                                <option key={c} value={c}>
                                    {CATEGORY_LABELS[c]}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => setInviting(true)}
                            className="border border-blue-600 text-blue-700 px-4 py-2 rounded-lg font-semibold hover:bg-blue-50"
                        >
                            ✉ Invite via email
                        </button>
                        <button
                            onClick={() => {
                                setCreating({ ...BLANK });
                                setEditing(null);
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                        >
                            + Add Member
                        </button>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                        {error}
                    </div>
                )}

                <BoardCsvPanel onImported={load} />

                {loading ? (
                    <Loading />
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                        No board members
                        {filterCategory ? ` in ${CATEGORY_LABELS[filterCategory]}` : ' yet'}.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filtered.map((m) => (
                            <BoardMemberRow
                                key={m.id}
                                member={m}
                                onEdit={() => {
                                    setEditing({ ...m });
                                    setCreating(null);
                                }}
                                onRemove={() => remove(m)}
                                onInvitationChange={(updated, toast) => {
                                    setMembers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
                                    if (toast) setInviteNotice(toast);
                                }}
                            />
                        ))}
                    </div>
                )}

                {inviting && (
                    <InviteBoardMemberModal
                        onCancel={() => setInviting(false)}
                        onSent={(msg) => {
                            setInviteNotice(msg);
                            setInviting(false);
                            load();
                        }}
                    />
                )}
                {inviteNotice && (
                    <div
                        role="status"
                        className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg"
                        onClick={() => setInviteNotice(null)}
                    >
                        {inviteNotice}
                    </div>
                )}

                {draft && (
                    <BoardMemberModal
                        draft={draft}
                        isEditing={!!editing}
                        onCancel={() => {
                            setEditing(null);
                            setCreating(null);
                        }}
                        onFieldChange={setDraftField}
                        onApplyCvFields={(fields) => {
                            // Merge extracted fields onto the current draft — never overwrite
                            // a field the editor already filled by hand.
                            if (creating) {
                                const next = { ...creating } as Omit<BoardMember, 'id'>;
                                (Object.keys(fields) as FieldKey[]).forEach((k) => {
                                    const v = (fields as any)[k];
                                    if (v == null || v === '') return;
                                    const current = (next as any)[k];
                                    if (current === '' || current == null) {
                                        (next as any)[k] = v;
                                    }
                                });
                                setCreating(next);
                            }
                        }}
                        onSave={save}
                    />
                )}
            </div>
        </div>
    );
};

export default EditorEditorialBoardAdmin;


// ═══════════════════════════════════════════════════════════
//  Add / Edit modal
// ═══════════════════════════════════════════════════════════

interface BoardMemberModalProps {
    draft: Omit<BoardMember, 'id'> | BoardMember;
    isEditing: boolean;
    onCancel: () => void;
    onFieldChange: (key: FieldKey, value: any) => void;
    onApplyCvFields: (fields: Partial<Omit<BoardMember, 'id'>>) => void;
    onSave: () => void;
}

const BoardMemberModal: React.FC<BoardMemberModalProps> = ({
    draft,
    isEditing,
    onCancel,
    onFieldChange,
    onApplyCvFields,
    onSave,
}) => {
    const [mode, setMode] = useState<'upload' | 'manual'>(isEditing ? 'manual' : 'upload');

    const renderInput = (spec: FieldSpec) => {
        const rawValue = (draft as any)[spec.key];
        const value = rawValue == null ? '' : String(rawValue);
        return (
            <label key={spec.key} className="text-sm">
                <span className="block text-gray-600 mb-1">{spec.label}</span>
                <input
                    type={spec.type || 'text'}
                    value={value}
                    placeholder={spec.placeholder || ''}
                    onChange={(e) => {
                        if (spec.type === 'number') {
                            const v = e.target.value;
                            onFieldChange(spec.key, v === '' ? null : Number(v));
                        } else {
                            onFieldChange(spec.key, e.target.value);
                        }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </label>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
                <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">
                            {isEditing ? `Edit ${(draft as any).name || 'member'}` : 'Add board member'}
                        </h2>
                        {!isEditing && (
                            <p className="text-xs text-gray-500 mt-1">
                                Upload a CV to auto-fill the form, or enter details by hand.
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {!isEditing && (
                    <div className="px-6 pt-4">
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'upload'}
                                onClick={() => setMode('upload')}
                                className={`px-3 py-1.5 rounded-md font-medium transition ${
                                    mode === 'upload' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                📄 Upload CV
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'manual'}
                                onClick={() => setMode('manual')}
                                className={`px-3 py-1.5 rounded-md font-medium transition ${
                                    mode === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                ✍️ Manual entry
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {mode === 'upload' && !isEditing ? (
                        <CvUploadPane
                            onExtracted={(fields) => {
                                onApplyCvFields(fields);
                                setMode('manual');
                            }}
                        />
                    ) : (
                        <ManualEntryPane draft={draft} onFieldChange={onFieldChange} renderInput={renderInput} />
                    )}
                </div>

                <div className="border-t border-gray-100 px-6 py-3 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!draft.name?.trim() || !draft.role?.trim()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                    >
                        {isEditing ? 'Save changes' : 'Create board member'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── CV upload pane ──────────────────────────────────────

const CvUploadPane: React.FC<{
    onExtracted: (fields: CvParseResult['fields']) => void;
}> = ({ onExtracted }) => {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = (f: File | null) => {
        setError(null);
        if (!f) return;
        const okTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        const okExt = /\.(pdf|docx|txt)$/i.test(f.name);
        if (!okTypes.includes(f.type) && !okExt) {
            setError('Please upload a PDF, DOCX, or TXT file.');
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setError('CV must be smaller than 5 MB.');
            return;
        }
        setFile(f);
    };

    const runParse = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const result = await parseBoardMemberCv(file);
            if (result.extracted_field_count === 0) {
                setError('The CV was read but no editorial fields could be extracted. Try manual entry.');
                return;
            }
            onExtracted(result.fields);
        } catch (err: any) {
            setError(
                err?.response?.data?.detail ||
                    err?.message ||
                    'Could not read the CV. Try a different file or use manual entry.',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0] || null);
                }}
                className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
                    dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
                }`}
            >
                <div className="text-5xl mb-3" aria-hidden>📄</div>
                <p className="text-sm font-medium text-gray-800">
                    Drop a CV here, or{' '}
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="text-blue-700 underline hover:text-blue-900"
                    >
                        browse
                    </button>
                </p>
                <p className="text-xs text-gray-500 mt-1">PDF, DOCX, or TXT — up to 5 MB</p>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                {file && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm">
                        <span aria-hidden>📎</span>
                        <span className="font-medium">{file.name}</span>
                        <span className="text-gray-500">({Math.round(file.size / 1024)} KB)</span>
                        <button
                            type="button"
                            onClick={() => setFile(null)}
                            className="text-gray-400 hover:text-gray-600 ml-2"
                            aria-label="Remove file"
                        >
                            ×
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div role="alert" className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}

            <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                    Extraction uses AI — <strong>review every field</strong> before saving.
                </p>
                <button
                    type="button"
                    onClick={runParse}
                    disabled={!file || busy}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                    {busy ? 'Reading CV…' : 'Extract & continue'}
                </button>
            </div>
        </div>
    );
};

// ── Manual entry pane ───────────────────────────────────

const ManualEntryPane: React.FC<{
    draft: Omit<BoardMember, 'id'> | BoardMember;
    onFieldChange: (key: FieldKey, value: any) => void;
    renderInput: (spec: FieldSpec) => React.ReactNode;
}> = ({ draft, onFieldChange, renderInput }) => {
    return (
        <div className="space-y-6">
            <Section title="Editorial role">
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Category *</span>
                        <select
                            value={draft.category}
                            onChange={(e) => onFieldChange('category', e.target.value as BoardCategory)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                            {CATEGORY_ORDER.map((c) => (
                                <option key={c} value={c}>
                                    {CATEGORY_LABELS[c]}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </Section>

            <Section title="Personal details">
                <div className="grid grid-cols-2 gap-3">{IDENTITY_FIELDS.map(renderInput)}</div>
            </Section>

            <Section title="Institution">
                <div className="grid grid-cols-2 gap-3">{INSTITUTION_FIELDS.map(renderInput)}</div>
            </Section>

            <Section title="Academic identifiers">
                <div className="grid grid-cols-2 gap-3">{ACADEMIC_ID_FIELDS.map(renderInput)}</div>
            </Section>

            <Section title="Expertise & bio">
                <div className="space-y-3">
                    {TEXTAREA_FIELDS.map((spec) => (
                        <label key={spec.key} className="text-sm block">
                            <span className="block text-gray-600 mb-1">{spec.label}</span>
                            <textarea
                                value={((draft as any)[spec.key] as string) || ''}
                                placeholder={spec.placeholder || ''}
                                onChange={(e) => onFieldChange(spec.key, e.target.value)}
                                rows={spec.rows || 3}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                    ))}
                </div>
            </Section>

            <Section title="Assignment settings">
                <div className="grid grid-cols-2 gap-3">{ASSIGNMENT_FIELDS.map(renderInput)}</div>
            </Section>

            <Section title="Documents">
                <EditorSingleFileRow
                    label="Profile photo (JPEG / PNG / WEBP)"
                    fileUrl={(draft as any).photo_file_url}
                    onChange={(url, name) => {
                        onFieldChange('photo_file_url', url);
                        if (url && name) onFieldChange('photo_url' as any, url);
                    }}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                />
                <EditorSingleFileRow
                    label="Resume / CV (PDF or Word)"
                    fileUrl={(draft as any).resume_file_url}
                    onChange={(url) => onFieldChange('resume_file_url', url)}
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                />
                <EditorMultiFileRow
                    label="Additional certifications (optional)"
                    files={((draft as any).certification_files as Array<{ file_url: string; filename: string }>) || []}
                    onChange={(files) => onFieldChange('certification_files', files.length ? files : null)}
                    accept=".pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                />
            </Section>

            <Section title="Display">
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Sort order</span>
                        <input
                            type="number"
                            value={draft.sort_order}
                            onChange={(e) => onFieldChange('sort_order', Number(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-sm flex items-end gap-2 pb-2">
                        <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(e) => onFieldChange('is_active', e.target.checked)}
                        />
                        Active on public board page
                    </label>
                </div>
            </Section>
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{title}</h3>
        {children}
    </div>
);


// ═══════════════════════════════════════════════════════════
//  Board member row — status pill + per-row action buttons
// ═══════════════════════════════════════════════════════════

type InvitationStatus = 'active' | 'pending' | 'revoked' | 'inactive';

function invitationStatus(m: BoardMember): InvitationStatus {
    if (m.invitation_completed_at) return m.is_active ? 'active' : 'inactive';
    if (m.invitation_revoked_at) return 'revoked';
    if (m.invitation_sent_at) return 'pending';
    return m.is_active ? 'active' : 'inactive';
}

const STATUS_STYLES: Record<InvitationStatus, { pill: string; label: string; dot: string }> = {
    active:   { pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', label: 'Active' },
    pending:  { pill: 'bg-amber-100 text-amber-800 ring-amber-200',       dot: 'bg-amber-500 animate-pulse', label: 'Awaiting profile' },
    revoked:  { pill: 'bg-rose-100 text-rose-800 ring-rose-200',          dot: 'bg-rose-500',    label: 'Revoked' },
    inactive: { pill: 'bg-gray-100 text-gray-600 ring-gray-200',          dot: 'bg-gray-400',    label: 'Inactive' },
};

const BoardMemberRow: React.FC<{
    member: BoardMember;
    onEdit: () => void;
    onRemove: () => void;
    onInvitationChange: (updated: BoardMember, toastMessage?: string) => void;
}> = ({ member, onEdit, onRemove, onInvitationChange }) => {
    const status = invitationStatus(member);
    const spec = STATUS_STYLES[status];
    const [busy, setBusy] = useState<null | 'resend' | 'revoke' | 'copy'>(null);
    const [rowError, setRowError] = useState<string | null>(null);

    const handleResend = async () => {
        setRowError(null);
        setBusy('resend');
        try {
            const res = await resendBoardInvitation(member.id);
            // Locally patch the row so status flips back to "pending" (un-revokes if needed).
            const now = new Date().toISOString();
            onInvitationChange(
                {
                    ...member,
                    invitation_sent_at: now,
                    invitation_revoked_at: null,
                },
                res.email_sent ? 'Invitation resent.' : 'Reminder queued — email delivery failed, check the notification log.',
            );
        } catch (e: any) {
            setRowError(e?.response?.data?.detail || 'Could not resend the invitation.');
        } finally {
            setBusy(null);
        }
    };

    const handleRevoke = async () => {
        if (!window.confirm(`Revoke the invitation for ${member.name}? The activation link will stop working immediately.`)) return;
        setRowError(null);
        setBusy('revoke');
        try {
            await revokeBoardInvitation(member.id);
            onInvitationChange(
                {
                    ...member,
                    invitation_revoked_at: new Date().toISOString(),
                },
                'Invitation revoked.',
            );
        } catch (e: any) {
            setRowError(e?.response?.data?.detail || 'Could not revoke the invitation.');
        } finally {
            setBusy(null);
        }
    };

    const handleCopyLink = async () => {
        setRowError(null);
        setBusy('copy');
        try {
            const { invitation_url } = await getBoardInvitationLink(member.id);
            try {
                await navigator.clipboard.writeText(invitation_url);
                onInvitationChange(member, 'Invitation link copied to clipboard.');
            } catch {
                // Clipboard API blocked (insecure origin, permission denied) — surface the URL inline.
                window.prompt('Copy the invitation link:', invitation_url);
            }
        } catch (e: any) {
            setRowError(e?.response?.data?.detail || 'Could not generate a link.');
        } finally {
            setBusy(null);
        }
    };

    const isPending = status === 'pending';
    const isRevoked = status === 'revoked';

    return (
        <div className={`bg-white border rounded-xl p-5 ${status === 'inactive' ? 'border-gray-100 opacity-70' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{member.name}</span>
                        <span className="text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{member.role}</span>
                        <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                            {CATEGORY_LABELS[member.category] || member.category}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ring-1 ring-inset ${spec.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${spec.dot}`} aria-hidden />
                            {spec.label}
                        </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                        {[member.department, member.affiliation].filter(Boolean).join(' · ')}
                        {member.country ? ` — ${member.country}` : ''}
                    </p>
                    {member.expertise && <p className="text-xs text-gray-500 mt-1">{member.expertise}</p>}
                    {isPending && member.invitation_sent_at && (
                        <p className="text-[11px] text-amber-700 mt-1">
                            Invited {new Date(member.invitation_sent_at).toLocaleString()} — link expires 7 days from the last send.
                        </p>
                    )}
                    {isRevoked && member.invitation_revoked_at && (
                        <p className="text-[11px] text-rose-700 mt-1">
                            Revoked {new Date(member.invitation_revoked_at).toLocaleString()} — resend to mint a fresh link.
                        </p>
                    )}
                    {rowError && (
                        <p role="alert" className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mt-2 inline-block">
                            {rowError}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-1.5 flex-none">
                    {/* Invitation-lifecycle actions come first on pending/revoked rows,
                        so the editor sees them at a glance without having to hunt. */}
                    {(isPending || isRevoked) && (
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={busy !== null}
                            className="text-xs px-3 py-1 rounded border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                        >
                            {busy === 'resend' ? 'Resending…' : isRevoked ? 'Re-invite' : 'Resend link'}
                        </button>
                    )}
                    {isPending && (
                        <>
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                disabled={busy !== null}
                                className="text-xs px-3 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                                {busy === 'copy' ? 'Copying…' : 'Copy link'}
                            </button>
                            <button
                                type="button"
                                onClick={handleRevoke}
                                disabled={busy !== null}
                                className="text-xs px-3 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                                {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onEdit}
                        className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
};


// ═══════════════════════════════════════════════════════════
//  Editor-authenticated file upload rows (Documents section)
// ═══════════════════════════════════════════════════════════

const EditorSingleFileRow: React.FC<{
    label: string;
    fileUrl: string | null | undefined;
    onChange: (url: string | null, filename?: string) => void;
    accept: string;
}> = ({ label, fileUrl, onChange, accept }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = async (f: File) => {
        setErr(null);
        setBusy(true);
        try {
            const res = await uploadBoardFileAsEditor(f);
            onChange(res.file_url, res.filename);
        } catch (ex: any) {
            setErr(ex?.response?.data?.detail || 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-3">
            <p className="text-sm text-gray-600 mb-1">{label}</p>
            <div className="border border-dashed border-gray-300 rounded-lg p-3 flex items-center gap-3">
                {fileUrl ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span aria-hidden>📎</span>
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 truncate hover:underline">
                            {fileUrl.split('/').pop()}
                        </a>
                        <button type="button" onClick={() => onChange(null)} className="text-xs text-rose-600 hover:underline ml-auto">
                            Remove
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-sm text-blue-700 hover:underline">
                        {busy ? 'Uploading…' : 'Choose file'}
                    </button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    hidden
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                    }}
                />
            </div>
            {err && <p role="alert" className="text-xs text-rose-600 mt-1">{err}</p>}
        </div>
    );
};

const EditorMultiFileRow: React.FC<{
    label: string;
    files: Array<{ file_url: string; filename: string }>;
    onChange: (files: Array<{ file_url: string; filename: string }>) => void;
    accept: string;
}> = ({ label, files, onChange, accept }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = async (list: FileList) => {
        setErr(null);
        setBusy(true);
        try {
            const results: Array<{ file_url: string; filename: string }> = [];
            for (const f of Array.from(list)) {
                const res = await uploadBoardFileAsEditor(f);
                results.push({ file_url: res.file_url, filename: res.filename });
            }
            onChange([...files, ...results]);
        } catch (ex: any) {
            setErr(ex?.response?.data?.detail || 'One or more uploads failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-3">
            <p className="text-sm text-gray-600 mb-1">{label}</p>
            <div className="border border-dashed border-gray-300 rounded-lg p-3">
                {files.length > 0 && (
                    <ul className="space-y-1 mb-2">
                        {files.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                                <span aria-hidden>📎</span>
                                <a href={f.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-blue-700 hover:underline">
                                    {f.filename}
                                </a>
                                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-xs text-rose-600 hover:underline">
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-sm text-blue-700 hover:underline">
                    {busy ? 'Uploading…' : '+ Add certification'}
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple
                    hidden
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            upload(e.target.files);
                            e.target.value = '';
                        }
                    }}
                />
            </div>
            {err && <p role="alert" className="text-xs text-rose-600 mt-1">{err}</p>}
        </div>
    );
};


// ═══════════════════════════════════════════════════════════
//  Invite-via-email modal
// ═══════════════════════════════════════════════════════════

const InviteBoardMemberModal: React.FC<{
    onCancel: () => void;
    onSent: (message: string) => void;
}> = ({ onCancel, onSent }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [category, setCategory] = useState<BoardCategory>('board_member');
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const canSend =
        name.trim().length >= 2 &&
        /.+@.+\..+/.test(email.trim()) &&
        role.trim().length >= 2 &&
        !submitting;

    const send = async () => {
        setErr(null);
        setSubmitting(true);
        try {
            const result = await inviteBoardMember({
                name: name.trim(),
                email: email.trim(),
                category,
                role: role.trim(),
            });
            onSent(result.message || 'Invitation sent.');
        } catch (ex: any) {
            setErr(ex?.response?.data?.detail || ex?.message || 'Could not send invitation.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Invite editorial board member</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            A signed activation link (valid 7 days) is emailed to the invitee. They complete
                            their own profile.
                        </p>
                    </div>
                    <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">×</button>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm">
                        <span className="block text-gray-600 mb-1">Full name *</span>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Dr. Jane Smith" required autoFocus />
                    </label>
                    <label className="block text-sm">
                        <span className="block text-gray-600 mb-1">Email *</span>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="jane@university.edu" required />
                    </label>
                    <label className="block text-sm">
                        <span className="block text-gray-600 mb-1">Editorial position *</span>
                        <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Associate Editor — Machine Learning" required />
                    </label>
                    <label className="block text-sm">
                        <span className="block text-gray-600 mb-1">Category</span>
                        <select value={category} onChange={(e) => setCategory(e.target.value as BoardCategory)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                            {CATEGORY_ORDER.map((c) => (
                                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                            ))}
                        </select>
                    </label>
                    {err && <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
                    <button
                        onClick={send}
                        disabled={!canSend}
                        className="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:bg-gray-300 text-sm"
                    >
                        {submitting ? 'Sending…' : 'Send invitation'}
                    </button>
                </div>
            </div>
        </div>
    );
};
