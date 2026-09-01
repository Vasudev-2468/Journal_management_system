import React, { useEffect, useRef, useState } from 'react';
import {
    ExportColumn,
    exportToCsv,
    exportToExcel,
    exportToPdf,
    copyLinkToClipboard,
    openEmailShare,
} from '../../utils/exporters';

export type DownloadFormat = 'csv' | 'xlsx' | 'pdf';

interface DownloadConfig<T> {
    filenameBase: string;
    rows: T[];
    columns: ExportColumn<T>[];
    pdfTitle?: string;
    // Optional escape hatch: when supplied for a given format, PageActionBar
    // calls this instead of running the client-side exporter. Used by
    // pages that already have a server-side CSV endpoint they want to keep.
    override?: Partial<Record<DownloadFormat, () => void | Promise<void>>>;
    formats?: DownloadFormat[]; // defaults to all three
}

interface ShareConfig {
    subject: string; // used as the email subject and the "shared" label
    url?: string; // defaults to window.location.href
}

interface Props<T> {
    title?: string;
    download?: DownloadConfig<T>;
    share?: ShareConfig;
    filters?: React.ReactNode;
    className?: string;
}

function useDismissable(onDismiss: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onDismiss();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [onDismiss]);
    return ref;
}

const triggerClasses =
    'inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';

const menuClasses =
    'absolute right-0 z-20 mt-1 w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg';

const itemClasses =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

function Caret() {
    return (
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
    );
}

function DownloadMenu<T>({ config }: { config: DownloadConfig<T> }) {
    const [open, setOpen] = useState(false);
    const ref = useDismissable(() => setOpen(false));

    const formats = config.formats ?? ['csv', 'xlsx', 'pdf'];
    const run = (format: DownloadFormat) => {
        setOpen(false);
        const override = config.override?.[format];
        if (override) {
            void override();
            return;
        }
        if (format === 'csv') {
            exportToCsv(config.filenameBase, config.rows, config.columns);
        } else if (format === 'xlsx') {
            exportToExcel(config.filenameBase, config.rows, config.columns);
        } else {
            exportToPdf(config.filenameBase, config.rows, config.columns, config.pdfTitle);
        }
    };

    const disabled = config.rows.length === 0;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className={triggerClasses}
                onClick={() => setOpen((v) => !v)}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                title={disabled ? 'Nothing to export yet' : 'Download this list'}
            >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10 3a.75.75 0 01.75.75v7.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3.75A.75.75 0 0110 3zM4 14.75a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 14.75z" />
                </svg>
                Download
                <Caret />
            </button>
            {open && (
                <div role="menu" className={menuClasses}>
                    {formats.includes('csv') && (
                        <button type="button" className={itemClasses} onClick={() => run('csv')} role="menuitem">
                            CSV (.csv)
                        </button>
                    )}
                    {formats.includes('xlsx') && (
                        <button type="button" className={itemClasses} onClick={() => run('xlsx')} role="menuitem">
                            Excel (.xlsx)
                        </button>
                    )}
                    {formats.includes('pdf') && (
                        <button type="button" className={itemClasses} onClick={() => run('pdf')} role="menuitem">
                            PDF (.pdf)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function ShareMenu({ config }: { config: ShareConfig }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const ref = useDismissable(() => setOpen(false));

    const doCopy = async () => {
        const ok = await copyLinkToClipboard(config.url);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
        setOpen(false);
    };
    const doEmail = () => {
        openEmailShare(config.subject, config.url);
        setOpen(false);
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className={triggerClasses}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                title="Share this page"
            >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.788l-4.94-2.47a3.006 3.006 0 000-.744l4.94-2.47c.53.62 1.316 1.017 2.186 1.017z" />
                </svg>
                {copied ? 'Copied!' : 'Share'}
                <Caret />
            </button>
            {open && (
                <div role="menu" className={menuClasses}>
                    <button type="button" className={itemClasses} onClick={doCopy} role="menuitem">
                        Copy link
                    </button>
                    <button type="button" className={itemClasses} onClick={doEmail} role="menuitem">
                        Email link
                    </button>
                </div>
            )}
        </div>
    );
}

function FiltersMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const ref = useDismissable(() => setOpen(false));

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className={triggerClasses}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                title="Filter this list"
            >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M3 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm2 5a1 1 0 011-1h8a1 1 0 010 2H6a1 1 0 01-1-1zm3 5a1 1 0 011-1h2a1 1 0 010 2H9a1 1 0 01-1-1z" />
                </svg>
                Filters
                <Caret />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label="Filters"
                    className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-gray-200 bg-white p-4 shadow-lg"
                >
                    {children}
                </div>
            )}
        </div>
    );
}

function PageActionBar<T>({ title, download, share, filters, className = '' }: Props<T>) {
    if (!download && !share && !filters && !title) return null;
    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
            <div className="min-w-0">
                {title && <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>}
            </div>
            <div className="flex items-center gap-2">
                {filters && <FiltersMenu>{filters}</FiltersMenu>}
                {share && <ShareMenu config={share} />}
                {download && <DownloadMenu config={download} />}
            </div>
        </div>
    );
}

export default PageActionBar;
