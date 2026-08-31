import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import { FileKind } from '../../api/platform';

/**
 * FileDropzone — HTML5 drag-drop + <input type="file"> combo, no external
 * deps. Each selected file is POSTed straight to /uploads/manuscript-file
 * via the shared axios ``client`` and reported back through ``onUploaded``
 * once the whole list has stabilised.
 *
 * The component is framework-free on purpose — we intentionally avoid
 * react-dropzone here so this widget stays a small, obvious primitive that
 * can be reused across the revision UI, the initial-submission wizard, and
 * anywhere else authors need to attach files.
 */

export interface UploadedFile {
    original_filename: string;
    stored_url: string;
    mime_type: string;
    size_bytes: number;
    kind: FileKind;
}

interface FileDropzoneProps {
    /** Kinds the caller wants surfaced in the per-row dropdown. */
    kinds: FileKind[];
    /** Fires whenever the successful-upload set changes. */
    onUploaded: (files: UploadedFile[]) => void;
    /** Client-side size cap in MB; server enforces its own cap independently. */
    maxSizeMB?: number;
    /** Optional wrapper label above the drop area. */
    label?: string;
}

interface RowState {
    id: string;                    // stable per-row key
    file: File;
    kind: FileKind;
    progress: number;              // 0..100
    status: 'uploading' | 'done' | 'error';
    error?: string;
    uploaded?: UploadedFile;
}

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

const nextId = (() => {
    let n = 0;
    return () => `f-${Date.now().toString(36)}-${(n++).toString(36)}`;
})();

const formatBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const FileDropzone: React.FC<FileDropzoneProps> = ({
    kinds,
    onUploaded,
    maxSizeMB = 25,
    label,
}) => {
    const [rows, setRows] = useState<RowState[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [pickerError, setPickerError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const defaultKind: FileKind = kinds[0] || 'other';
    const maxBytes = useMemo(() => maxSizeMB * 1024 * 1024, [maxSizeMB]);

    // Emit the *successful* uploads whenever the row set changes. Doing
    // this in an effect (rather than from inside setRows) keeps state
    // updaters pure and avoids scheduling parent re-renders during our
    // own reconciliation pass.
    useEffect(() => {
        const done = rows
            .filter((r) => r.status === 'done' && r.uploaded)
            .map((r) => ({ ...(r.uploaded as UploadedFile), kind: r.kind }));
        onUploaded(done);
        // ``onUploaded`` intentionally excluded — callers pass a fresh
        // arrow function on every render, which would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows]);

    const patchRow = useCallback((id: string, patch: Partial<RowState>) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }, []);

    const removeRow = (id: string) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const uploadOne = useCallback(
        async (row: RowState) => {
            const fd = new FormData();
            fd.append('file', row.file, row.file.name);
            try {
                const { data } = await client.post('/uploads/manuscript-file', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 120000,
                    onUploadProgress: (evt: any) => {
                        if (!evt || !evt.total) return;
                        const pct = Math.round((evt.loaded * 100) / evt.total);
                        patchRow(row.id, { progress: pct });
                    },
                });
                patchRow(row.id, {
                    status: 'done',
                    progress: 100,
                    uploaded: {
                        original_filename: data.original_filename,
                        stored_url: data.stored_url,
                        mime_type: data.mime_type,
                        size_bytes: data.size_bytes,
                        kind: row.kind,
                    },
                });
            } catch (err: any) {
                const msg =
                    err?.response?.data?.detail ||
                    err?.message ||
                    'Upload failed. Please try again.';
                patchRow(row.id, { status: 'error', error: String(msg) });
            }
        },
        [patchRow],
    );

    const enqueue = useCallback(
        (files: FileList | File[]) => {
            setPickerError(null);
            const accepted: RowState[] = [];
            const rejected: string[] = [];

            Array.from(files).forEach((file) => {
                if (file.size > maxBytes) {
                    rejected.push(
                        `${file.name} — exceeds ${maxSizeMB} MB limit (${formatBytes(file.size)}).`,
                    );
                    return;
                }
                accepted.push({
                    id: nextId(),
                    file,
                    kind: defaultKind,
                    progress: 0,
                    status: 'uploading',
                });
            });

            if (rejected.length) {
                setPickerError(rejected.join(' '));
            }
            if (!accepted.length) return;

            setRows((prev) => [...prev, ...accepted]);
            // Kick off each upload independently. State mutation happens
            // through patchRow; the useEffect above re-emits the aggregate
            // list to the parent whenever rows change.
            accepted.forEach((r) => {
                uploadOne(r);
            });
        },
        [defaultKind, maxBytes, maxSizeMB, uploadOne],
    );

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer?.files?.length) {
            enqueue(e.dataTransfer.files);
        }
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragActive) setDragActive(true);
    };

    const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            enqueue(e.target.files);
        }
        // Allow re-selecting the same filename by resetting the input.
        e.target.value = '';
    };

    const changeKind = (id: string, kind: FileKind) => patchRow(id, { kind });

    const retry = (row: RowState) => {
        patchRow(row.id, { status: 'uploading', progress: 0, error: undefined });
        uploadOne({ ...row, status: 'uploading', progress: 0, error: undefined });
    };

    return (
        <div className="space-y-3">
            {label && (
                <div className="text-sm font-semibold text-gray-700">{label}</div>
            )}

            <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors hover:bg-brand-50 ${
                    dragActive
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-300 bg-white'
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    onChange={onPick}
                    className="hidden"
                    aria-label="Choose files to upload"
                />
                <div className="flex flex-col items-center gap-2">
                    <div className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.75}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                        </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                        {dragActive ? 'Drop files to upload…' : 'Drag & drop files here'}
                    </p>
                    <p className="text-xs text-gray-500">
                        or <span className="text-brand-700 font-semibold">click to browse</span>{' '}
                        · up to {maxSizeMB} MB each
                    </p>
                </div>
            </div>

            {pickerError && (
                <p role="alert" className="text-xs text-red-600">
                    {pickerError}
                </p>
            )}

            {rows.length > 0 && (
                <ul className="space-y-2">
                    {rows.map((r) => (
                        <li
                            key={r.id}
                            className="rounded-xl border border-gray-200 bg-white p-3"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        r.status === 'done'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : r.status === 'error'
                                              ? 'bg-red-100 text-red-700'
                                              : 'bg-brand-100 text-brand-700'
                                    }`}
                                    aria-hidden="true"
                                >
                                    {r.status === 'done' ? (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={3}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    ) : r.status === 'error' ? (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    ) : (
                                        <div className="w-3.5 h-3.5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 truncate">
                                        {r.file.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {formatBytes(r.file.size)}
                                        {r.status === 'uploading' && ` · ${r.progress}%`}
                                        {r.status === 'done' && ' · Uploaded'}
                                    </p>
                                </div>
                                <select
                                    value={r.kind}
                                    onChange={(e) =>
                                        changeKind(r.id, e.target.value as FileKind)
                                    }
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                                    aria-label={`File kind for ${r.file.name}`}
                                >
                                    {kinds.map((k) => (
                                        <option key={k} value={k}>
                                            {KIND_LABEL[k]}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => removeRow(r.id)}
                                    className="text-xs text-gray-400 hover:text-red-600 px-1"
                                    aria-label={`Remove ${r.file.name}`}
                                >
                                    ×
                                </button>
                            </div>

                            {r.status === 'uploading' && (
                                <div
                                    className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={r.progress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                >
                                    <div
                                        className="h-full bg-brand-500 transition-all"
                                        style={{ width: `${Math.max(4, r.progress)}%` }}
                                    />
                                </div>
                            )}

                            {r.status === 'error' && (
                                <div className="mt-2 flex items-start justify-between gap-2">
                                    <p className="text-xs text-red-600" role="alert">
                                        {r.error}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => retry(r)}
                                        className="text-xs text-brand-700 font-semibold hover:underline shrink-0"
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default FileDropzone;
