import React, { useEffect, useRef, useState } from 'react';

/*
 * FilePreviewModal — a full-viewport overlay that previews a manuscript
 * file in place instead of navigating away.
 *
 *   - PDFs (mimeType application/pdf or `.pdf` URLs) render in an
 *     `<iframe>`, which the browser hands off to its native viewer.
 *   - Images (image/*) render in an `<img>`.
 *   - Small text formats (text/*, csv, json) are fetched and shown
 *     in a scrollable `<pre>`.
 *   - Anything else falls back to a "download instead" link so the
 *     user is never stuck.
 *
 * Accessibility: role=dialog + aria-modal=true, Esc closes, click on
 * the backdrop closes, focus is restored to the previously focused
 * element on unmount. Focus trapping intentionally omitted to keep the
 * component small — the caller's context stays in the DOM behind it.
 */

export interface FilePreviewModalProps {
    url: string;
    filename: string;
    mimeType?: string;
    onClose: () => void;
}

function isPdf(url: string, mime?: string): boolean {
    if (mime && mime.toLowerCase() === 'application/pdf') return true;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.pdf');
}

function isImage(url: string, mime?: string): boolean {
    if (mime && mime.toLowerCase().startsWith('image/')) return true;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(clean);
}

function isTextish(url: string, mime?: string): boolean {
    const m = (mime || '').toLowerCase();
    if (m.startsWith('text/')) return true;
    if (m === 'application/json' || m === 'application/csv') return true;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return /\.(txt|csv|tsv|json|md|log|xml|yaml|yml)$/.test(clean);
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
    url,
    filename,
    mimeType,
    onClose,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    // Text-preview state (only used for text-ish files).
    const [textBody, setTextBody] = useState<string | null>(null);
    const [textError, setTextError] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);

    // Esc-to-close, focus save/restore, and body scroll lock.
    useEffect(() => {
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = originalOverflow;
            previouslyFocused.current?.focus?.();
        };
    }, [onClose]);

    // Fetch text bodies lazily so we don't hit the network for previews
    // the user never opens.
    useEffect(() => {
        if (!isTextish(url, mimeType)) return;
        let cancelled = false;
        setTextLoading(true);
        setTextError(null);
        fetch(url)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            })
            .then((body) => {
                if (!cancelled) setTextBody(body);
            })
            .catch((err) => {
                if (!cancelled) setTextError(err?.message || 'Failed to load preview.');
            })
            .finally(() => {
                if (!cancelled) setTextLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [url, mimeType]);

    const renderBody = () => {
        if (isPdf(url, mimeType)) {
            return (
                <iframe
                    title={filename}
                    src={url}
                    className="w-full h-full border-0 bg-white"
                />
            );
        }
        if (isImage(url, mimeType)) {
            return (
                <div className="w-full h-full flex items-center justify-center overflow-auto bg-black/70 p-4">
                    <img
                        src={url}
                        alt={filename}
                        className="max-w-full max-h-full object-contain"
                    />
                </div>
            );
        }
        if (isTextish(url, mimeType)) {
            if (textLoading) {
                return (
                    <div className="p-6 text-sm text-gray-500">Loading preview…</div>
                );
            }
            if (textError) {
                return (
                    <div className="p-6 text-sm text-red-600">
                        Could not load preview: {textError}{' '}
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-700 underline"
                        >
                            Download instead
                        </a>
                    </div>
                );
            }
            return (
                <pre className="w-full h-full overflow-auto bg-gray-50 text-xs font-mono p-4 whitespace-pre-wrap break-words">
                    {textBody}
                </pre>
            );
        }
        return (
            <div className="p-8 text-center text-sm text-gray-600">
                Preview not available for this file type.
                <div className="mt-3">
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-4 py-2 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700 no-underline"
                        download={filename}
                    >
                        Download {filename}
                    </a>
                </div>
            </div>
        );
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-preview-title"
            data-no-print
        >
            {/* Backdrop — click to close */}
            <div
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="relative z-10 bg-white rounded-2xl shadow-2xl w-[95vw] h-[92vh] max-w-6xl flex flex-col overflow-hidden outline-none"
            >
                <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <h2
                        id="file-preview-title"
                        className="text-sm font-bold text-gray-900 truncate"
                        title={filename}
                    >
                        {filename}
                    </h2>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand-700 hover:underline"
                        >
                            Open in new tab
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 font-semibold text-gray-800"
                            aria-label="Close preview"
                        >
                            Close
                        </button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 bg-white">{renderBody()}</div>
            </div>
        </div>
    );
};

export default FilePreviewModal;
