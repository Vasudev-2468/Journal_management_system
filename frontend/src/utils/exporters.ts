import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn<T> {
    header: string;
    accessor: (row: T) => string | number | null | undefined;
}

function stamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function safeFilename(base: string): string {
    return base.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'export';
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toRowRecords<T>(rows: T[], columns: ExportColumn<T>[]): Record<string, string | number>[] {
    return rows.map((row) => {
        const record: Record<string, string | number> = {};
        for (const col of columns) {
            const raw = col.accessor(row);
            record[col.header] = raw === null || raw === undefined ? '' : raw;
        }
        return record;
    });
}

export function exportToCsv<T>(filenameBase: string, rows: T[], columns: ExportColumn<T>[]): void {
    const records = toRowRecords(rows, columns);
    const worksheet = XLSX.utils.json_to_sheet(records, {
        header: columns.map((c) => c.header),
    });
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    // BOM so Excel opens UTF-8 without mojibake.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${safeFilename(filenameBase)}-${stamp()}.csv`);
}

export function exportToExcel<T>(filenameBase: string, rows: T[], columns: ExportColumn<T>[]): void {
    const records = toRowRecords(rows, columns);
    const worksheet = XLSX.utils.json_to_sheet(records, {
        header: columns.map((c) => c.header),
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerDownload(blob, `${safeFilename(filenameBase)}-${stamp()}.xlsx`);
}

export function exportToPdf<T>(
    filenameBase: string,
    rows: T[],
    columns: ExportColumn<T>[],
    title?: string,
): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
    if (title) {
        doc.setFontSize(14);
        doc.text(title, 40, 40);
    }
    autoTable(doc, {
        head: [columns.map((c) => c.header)],
        body: rows.map((row) => columns.map((c) => {
            const raw = c.accessor(row);
            return raw === null || raw === undefined ? '' : String(raw);
        })),
        startY: title ? 60 : 40,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 64, 175] },
        margin: { left: 40, right: 40 },
    });
    doc.save(`${safeFilename(filenameBase)}-${stamp()}.pdf`);
}

export async function copyLinkToClipboard(url: string = window.location.href): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch {
        // Fallback for insecure contexts / older browsers.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    }
}

export function openEmailShare(subject: string, url: string = window.location.href): void {
    const body = encodeURIComponent(`Take a look: ${url}`);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
}
