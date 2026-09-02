import React, { useRef, useState } from 'react';
import {
    BoardImportReport,
    exportBoardCsv,
    importBoardCsv,
} from '../../api/board';

/*
 * Editorial board CSV import / export panel.
 *
 * Runs the Board Import Validation Agent (backend/app/agents/board_import_agent.py)
 * on the uploaded file first — the editor sees a per-row dry-run report,
 * then confirms to persist. Rows with errors are skipped even on apply.
 */

interface Props {
    onImported?: () => void;
}

const BoardCsvPanel: React.FC<Props> = ({ onImported }) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [report, setReport] = useState<BoardImportReport | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [busy, setBusy] = useState<'export' | 'dry-run' | 'apply' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const doExport = async () => {
        setBusy('export'); setError(null); setNotice(null);
        try {
            const blob = await exportBoardCsv();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'editorial-board.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Export failed.');
        } finally {
            setBusy(null);
        }
    };

    const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        e.target.value = '';
        setPendingFile(file); setReport(null); setError(null); setNotice(null);
        setBusy('dry-run');
        try {
            const rep = await importBoardCsv(file, true);
            setReport(rep);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not parse CSV.');
            setPendingFile(null);
        } finally {
            setBusy(null);
        }
    };

    const doApply = async () => {
        if (!pendingFile || !report) return;
        if (report.will_create + report.will_update === 0) {
            setError('Nothing to import — every row had errors.');
            return;
        }
        if (!window.confirm(
            `Apply this import? ${report.will_create} to create, ${report.will_update} to update.`,
        )) return;
        setBusy('apply'); setError(null);
        try {
            const rep = await importBoardCsv(pendingFile, false);
            setReport(rep);
            const created = rep.applied?.created ?? 0;
            const updated = rep.applied?.updated ?? 0;
            setNotice(`Imported ${created} new member${created === 1 ? '' : 's'} and updated ${updated}.`);
            setPendingFile(null);
            if (onImported) onImported();
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Import failed.');
        } finally {
            setBusy(null);
        }
    };

    const clearReport = () => {
        setReport(null); setPendingFile(null); setError(null); setNotice(null);
    };

    const actionPill = (a: string) => {
        const cls =
            a === 'create' ? 'bg-emerald-100 text-emerald-800'
                : a === 'update' ? 'bg-blue-100 text-blue-800'
                    : 'bg-rose-100 text-rose-800';
        return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase ${cls}`}>{a}</span>;
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                <div>
                    <div className="text-sm font-bold text-gray-900">Bulk CSV</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Import a spreadsheet of members, or export the current roster.
                        Import runs a validation dry-run before anything is saved.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button" onClick={doExport} disabled={busy !== null}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {busy === 'export' ? 'Exporting…' : '↓ Export CSV'}
                    </button>
                    <button
                        type="button" onClick={() => fileInputRef.current?.click()} disabled={busy !== null}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                    >
                        {busy === 'dry-run' ? 'Validating…' : '↑ Import CSV'}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFilePicked} className="hidden" />
                </div>
            </div>

            {error && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 mb-3">
                    {error}
                </div>
            )}
            {notice && (
                <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 mb-3">
                    {notice}
                </div>
            )}

            {report && (
                <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-bold uppercase">
                                Board Import Agent
                            </span>
                            <span className="text-gray-700">{report.summary}</span>
                        </div>
                        <button type="button" onClick={clearReport} className="text-xs text-gray-500 hover:text-gray-800">
                            Dismiss
                        </button>
                    </div>

                    {report.unrecognised_headers.length > 0 && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                            Ignored columns not recognised as board fields:{' '}
                            <span className="font-mono">{report.unrecognised_headers.join(', ')}</span>
                        </div>
                    )}

                    <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="text-left px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase">Row</th>
                                    <th className="text-left px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase">Action</th>
                                    <th className="text-left px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase">Name</th>
                                    <th className="text-left px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase">Email</th>
                                    <th className="text-left px-2 py-1.5 text-[11px] font-bold text-gray-500 uppercase">Errors</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {report.rows.map((r) => (
                                    <tr key={r.row_number} className={r.errors.length ? 'bg-rose-50/40' : ''}>
                                        <td className="px-2 py-1 text-gray-500 text-xs">{r.row_number}</td>
                                        <td className="px-2 py-1">{actionPill(r.action)}</td>
                                        <td className="px-2 py-1">{r.name || <span className="text-gray-400">—</span>}</td>
                                        <td className="px-2 py-1 text-gray-600">{r.email || <span className="text-gray-400">—</span>}</td>
                                        <td className="px-2 py-1 text-xs text-rose-800">
                                            {r.errors.length ? r.errors.join('; ') : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {report.dry_run && pendingFile && (
                        <div className="mt-3 flex justify-end gap-2">
                            <button type="button" onClick={clearReport}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
                                Cancel
                            </button>
                            <button
                                type="button" onClick={doApply}
                                disabled={busy !== null || (report.will_create + report.will_update === 0)}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {busy === 'apply' ? 'Importing…' : `Apply — ${report.will_create + report.will_update} row${report.will_create + report.will_update === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BoardCsvPanel;
