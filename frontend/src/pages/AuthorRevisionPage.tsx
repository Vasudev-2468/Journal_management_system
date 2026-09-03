import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Loading from '../components/common/Loading';
import AuthorSidebar from '../components/authors/AuthorSidebar';
import client from '../api/client';
import useFilePreview from '../hooks/useFilePreview';
import {
    FileKind,
    ManuscriptVersion,
    fetchVersionsForSubmission,
    submitRevision,
} from '../api/platform';

/** Shape returned by /uploads/manuscript-file (same as FileDropzone). */
interface UploadedFile {
    kind: FileKind;
    original_filename: string;
    stored_url: string;
    mime_type?: string | null;
    size_bytes?: number | null;
}

// The three fixed slots the author fills for a revision submission.
const SLOTS: { key: FileKind; label: string; hint: string; icon: string; accept: string }[] = [
    {
        key: 'response',
        label: 'Reviewer comments with Q & A',
        hint: 'The point-by-point response to every reviewer comment.',
        icon: '💬',
        accept: '.pdf,.doc,.docx',
    },
    {
        key: 'figure',
        label: 'Updated Figures & Tables',
        hint: 'A single file containing every updated figure and table.',
        icon: '📊',
        accept: '.pdf,.pptx,.zip,.png,.jpg,.jpeg',
    },
    {
        key: 'manuscript',
        label: 'Updated Manuscript',
        hint: 'The revised manuscript file.',
        icon: '📄',
        accept: '.pdf,.doc,.docx',
    },
];

const KIND_LABEL: Record<FileKind, string> = {
    manuscript: 'Revised manuscript',
    figure: 'Figure',
    supplementary: 'Supplementary file',
    response: 'Response to reviewers',
    cover_letter: 'Cover letter',
    dataset: 'Dataset',
    video: 'Video',
    revised: 'Revised source',
    other: 'Other',
};

const KIND_ACCENT: Record<FileKind, string> = {
    manuscript: 'bg-brand-50 text-brand-700 border-brand-200',
    figure: 'bg-purple-50 text-purple-700 border-purple-200',
    supplementary: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    response: 'bg-amber-50 text-amber-700 border-amber-200',
    cover_letter: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dataset: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    video: 'bg-pink-50 text-pink-700 border-pink-200',
    revised: 'bg-gray-100 text-gray-700 border-gray-200',
    other: 'bg-gray-100 text-gray-700 border-gray-200',
};

interface UploadSlotProps {
    slot: { key: FileKind; label: string; hint: string; icon: string; accept: string };
    uploaded: UploadedFile | null;
    uploading: boolean;
    onFile: (file: File) => void;
    onClear: () => void;
}

const UploadSlot: React.FC<UploadSlotProps> = ({ slot, uploaded, uploading, onFile, onClear }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const done = uploaded !== null;

    const openPicker = () => inputRef.current?.click();
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
    };
    const onDragOver = (e: React.DragEvent) => e.preventDefault();

    return (
        <div
            className={
                'rounded-2xl border-2 border-dashed p-4 transition-colors ' +
                (done
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : uploading
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-gray-300 bg-white hover:bg-gray-50')
            }
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            <div className="flex items-start gap-3">
                <span aria-hidden className="text-2xl mt-0.5">{slot.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{slot.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{slot.hint}</div>

                    {done ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
                            <span aria-hidden className="text-emerald-700">✓</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                    {uploaded!.original_filename}
                                </div>
                                {typeof uploaded!.size_bytes === 'number' && (
                                    <div className="text-[11px] text-gray-500">
                                        {(uploaded!.size_bytes / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                )}
                            </div>
                            <button
                                type="button" onClick={onClear}
                                className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                            >
                                Replace
                            </button>
                        </div>
                    ) : (
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={openPicker}
                                disabled={uploading}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                            >
                                {uploading ? 'Uploading…' : 'Choose file'}
                            </button>
                            <span className="text-[11px] text-gray-400">
                                or drag &amp; drop here · {slot.accept.replace(/,/g, ', ')}
                            </span>
                        </div>
                    )}

                    <input
                        ref={inputRef}
                        type="file"
                        accept={slot.accept}
                        onChange={onChange}
                        className="hidden"
                    />
                </div>
            </div>
        </div>
    );
};

const AuthorRevisionPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [versions, setVersions] = useState<ManuscriptVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Exactly three slots — a revision submission is Reviewer-Q&A +
    // Updated Figures & Tables + Updated Manuscript. Keyed by FileKind
    // so the payload maps cleanly onto submitRevision().
    const [slotFiles, setSlotFiles] = useState<Record<FileKind, UploadedFile | null>>({
        response: null,
        figure: null,
        manuscript: null,
    } as Record<FileKind, UploadedFile | null>);
    // Per-slot upload progress state.
    const [uploading, setUploading] = useState<Record<string, boolean>>({});

    // Inline preview for prior-version files — click a filename to view
    // it in a modal without leaving the revision workflow.
    const { open: openPreview, PreviewNode } = useFilePreview();

    const load = () => {
        setLoading(true);
        fetchVersionsForSubmission(submissionId)
            .then((data) => setVersions(data))
            .catch((err) => setError(err?.response?.data?.detail || err?.message || 'Failed to load history.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (submissionId) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId]);

    const allSlotsFilled = SLOTS.every((s) => slotFiles[s.key] !== null);
    const canSubmit = allSlotsFilled;

    const uploadToSlot = async (kind: FileKind, file: File) => {
        setUploading((u) => ({ ...u, [kind]: true }));
        setError(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('kind', kind);
            const { data } = await client.post('/uploads/manuscript-file', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const uploaded: UploadedFile = {
                kind,
                original_filename: data.original_filename || file.name,
                stored_url: data.stored_url,
                mime_type: data.mime_type || file.type || null,
                size_bytes: data.size_bytes ?? file.size ?? null,
            };
            setSlotFiles((s) => ({ ...s, [kind]: uploaded }));
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Upload failed.');
        } finally {
            setUploading((u) => ({ ...u, [kind]: false }));
        }
    };

    const clearSlot = (kind: FileKind) => {
        setSlotFiles((s) => ({ ...s, [kind]: null }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        if (!canSubmit) {
            setError('Please upload all three files before submitting the revision.');
            return;
        }
        setSubmitting(true);
        try {
            const files: UploadedFile[] = SLOTS
                .map((s) => slotFiles[s.key])
                .filter((f): f is UploadedFile => f !== null);
            await submitRevision(submissionId, {
                files: files.map((f) => ({
                    kind: f.kind,
                    original_filename: f.original_filename,
                    stored_url: f.stored_url,
                    // ``submitRevision`` expects string | undefined, not null.
                    mime_type: f.mime_type ?? undefined,
                    size_bytes: f.size_bytes ?? undefined,
                })),
            });
            setSuccess(true);
            setSlotFiles({ response: null, figure: null, manuscript: null } as Record<FileKind, UploadedFile | null>);
            load();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Could not submit revision.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-[#f0f7f0]">
            <AuthorSidebar />

            <main className="flex-1 min-w-0 py-8 px-4 lg:px-8">
                <div className="max-w-5xl mx-auto">
                    <nav className="text-xs text-gray-500 mb-4">
                        <Link to="/author-dashboard" className="hover:underline">Dashboard</Link>
                        <span className="mx-1">›</span>
                        <Link to="/author/revisions" className="hover:underline">Revisions</Link>
                        <span className="mx-1">›</span>
                        <span className="text-gray-700 font-semibold">Submit</span>
                    </nav>

                    <div className="mb-6">
                        <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Author Portal</div>
                        <h1 className="text-2xl font-black text-gray-900 mt-1">Submit a revision</h1>
                        <p className="text-sm text-gray-600 mt-2 max-w-2xl">
                            Upload three files: your reviewer Q&amp;A, the updated figures and tables, and the
                            revised manuscript. Previous versions are preserved — nothing is ever overwritten.
                        </p>
                    </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
                        <h2 className="text-xl font-bold text-gray-900">Revision files</h2>

                        {error && (
                            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                                Revision submitted. Your submission is back with the editorial team.
                            </div>
                        )}

                        <div className="space-y-4">
                            {SLOTS.map((slot) => (
                                <UploadSlot
                                    key={slot.key}
                                    slot={slot}
                                    uploaded={slotFiles[slot.key]}
                                    uploading={!!uploading[slot.key]}
                                    onFile={(f) => uploadToSlot(slot.key, f)}
                                    onClear={() => clearSlot(slot.key)}
                                />
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !canSubmit}
                            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:bg-gray-300 transition shadow-lg"
                        >
                            {submitting ? 'Submitting…' : canSubmit ? 'Submit revision' : `Upload all three files to continue`}
                        </button>
                    </form>

                    {/* History */}
                    <aside className="space-y-4">
                        <h2 className="text-lg font-bold text-gray-900">Version history</h2>
                        {loading ? (
                            <Loading />
                        ) : versions.length === 0 ? (
                            <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-4">
                                No prior versions on record.
                            </p>
                        ) : (
                            <ol className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                                {[...versions].reverse().map((v) => (
                                    <li key={v.id} className="ml-6">
                                        <span
                                            className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white shadow ${
                                                v.is_current ? 'bg-emerald-500' : 'bg-gray-300'
                                            }`}
                                        />
                                        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-900">
                                                    v{v.version_number} — {v.label}
                                                </h3>
                                                {v.is_current && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                                                        CURRENT
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(v.created_at).toLocaleString()}
                                            </p>
                                            {v.change_summary && (
                                                <p className="text-xs text-gray-700 mt-2 italic">
                                                    {v.change_summary}
                                                </p>
                                            )}
                                            {v.files.length > 0 && (
                                                <ul className="mt-3 text-xs space-y-1">
                                                    {v.files.map((f) => (
                                                        <li key={f.id} className="flex items-center gap-2 min-w-0">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${KIND_ACCENT[f.kind as FileKind] || KIND_ACCENT.other}`}>
                                                                {KIND_LABEL[f.kind as FileKind] || f.kind}
                                                            </span>
                                                            <a
                                                                href={f.stored_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) =>
                                                                    openPreview({
                                                                        url: f.stored_url,
                                                                        filename: f.original_filename,
                                                                        mimeType: f.mime_type || undefined,
                                                                        event: e,
                                                                    })
                                                                }
                                                                className="text-brand-700 truncate hover:underline"
                                                            >
                                                                {f.original_filename}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </aside>
                </div>
                </div>
            </main>

            {PreviewNode}
        </div>
    );
};

export default AuthorRevisionPage;
