import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { generateCodes, getCount } from '../api/recoveryCodes';

/*
 * Editor Recovery Codes admin.
 *
 * Same underlying /recovery-codes/* endpoints authors use, but wrapped
 * in the editor chrome. Adds a small deterministic "Recovery Codes
 * Health Agent" — if fewer than 3 codes remain, the page renders a
 * banner urging the editor to regenerate. Codes are only readable
 * once: the plaintext appears exactly in the /generate response and is
 * never fetchable again.
 */

const TOTAL_CODES = 8;

/** Recovery Codes Health Agent — deterministic. */
function assessCodesHealth(remaining: number | null, generatedAt: string | null) {
    if (remaining === null) return { severity: 'clear' as const, message: '' };
    if (remaining === 0) {
        return {
            severity: 'critical' as const,
            message: 'You have no recovery codes left. If you lose your authenticator you cannot sign in without editor intervention.',
        };
    }
    if (remaining <= 2) {
        return {
            severity: 'warning' as const,
            message: `Only ${remaining} recovery code${remaining === 1 ? '' : 's'} remaining — regenerate before you run out.`,
        };
    }
    if (generatedAt) {
        const days = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000);
        if (days > 365) {
            return {
                severity: 'info' as const,
                message: `Your codes were generated ${days} days ago — consider rotating.`,
            };
        }
    }
    return { severity: 'clear' as const, message: '' };
}

export default function EditorRecoveryCodesPage() {
    const [remaining, setRemaining] = useState<number | null>(null);
    const [loadingCount, setLoadingCount] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);
    const [ack, setAck] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshCount = async () => {
        setLoadingCount(true);
        try {
            const res = await getCount();
            setRemaining(res.remaining);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not load recovery-code count.');
        } finally {
            setLoadingCount(false);
        }
    };
    useEffect(() => { refreshCount(); }, []);

    const health = assessCodesHealth(remaining, generatedAt);

    const doGenerate = async () => {
        if (!window.confirm(
            'Regenerating will void every existing recovery code, including any you have written down. Continue?',
        )) return;
        setGenerating(true); setError(null);
        try {
            const res = await generateCodes();
            setCodes(res.codes);
            setGeneratedAt(res.generated_at);
            setRemaining(TOTAL_CODES);
            setAck(false);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Could not generate codes.');
        } finally {
            setGenerating(false);
        }
    };

    const copyAll = async () => {
        if (!codes) return;
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
        } catch { /* ignore */ }
    };

    const downloadTxt = () => {
        if (!codes) return;
        const blob = new Blob(
            [
                'JGAIR Editor Portal — recovery codes\n',
                generatedAt ? `Generated at ${generatedAt}\n\n` : '\n',
                codes.map((c) => `${c}\n`).join(''),
                '\nEach code can be used ONCE to complete the MFA challenge.\n',
            ],
            { type: 'text/plain' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'jgair-editor-recovery-codes.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="mb-4">
                    <Link to="/editor" className="text-sm text-gray-500 hover:text-blue-700">← Back to dashboard</Link>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">Account Security</div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">Recovery Codes</h1>
                    <p className="text-sm text-gray-600 mt-2">
                        Backup codes let you complete the MFA challenge when your authenticator is unavailable.
                        Each code works once. Keep them somewhere safe — a password manager or printed and locked away.
                    </p>
                </div>

                {/* Recovery Codes Agent — health verdict */}
                {health.severity !== 'clear' && (
                    <div className={
                        'rounded-2xl border p-4 mb-4 flex items-start gap-3 ' +
                        (health.severity === 'critical'
                            ? 'border-rose-300 bg-rose-50'
                            : health.severity === 'warning'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-blue-200 bg-blue-50')
                    }>
                        <span aria-hidden className="text-xl leading-none">
                            {health.severity === 'critical' ? '⚠' : health.severity === 'warning' ? '⚠' : 'ℹ'}
                        </span>
                        <div className="flex-1">
                            <div className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-2">
                                Recovery Codes Health
                                <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Agent</span>
                            </div>
                            <div className="text-sm text-gray-800 mt-1">{health.message}</div>
                        </div>
                    </div>
                )}

                {/* Status card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Codes remaining</div>
                            <div className="text-3xl font-black text-gray-900 mt-1">
                                {loadingCount ? '…' : `${remaining ?? '—'}`}
                                <span className="text-sm font-normal text-gray-500 ml-1">of {TOTAL_CODES}</span>
                            </div>
                        </div>
                        <button
                            type="button" onClick={doGenerate} disabled={generating}
                            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                        >
                            {generating ? 'Generating…' : 'Regenerate all codes'}
                        </button>
                    </div>
                    {error && (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
                    )}
                </div>

                {/* Codes display (only visible once after generate) */}
                {codes && (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-5">
                        <div className="text-sm font-bold text-emerald-800 uppercase tracking-widest mb-2">
                            ✓ New codes generated
                        </div>
                        <p className="text-xs text-gray-600 mb-3">
                            Store these somewhere safe. They will not be shown again.
                        </p>
                        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                            {codes.map((c) => (
                                <div key={c} className="tracking-wide text-gray-800">{c}</div>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={copyAll} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold">
                                Copy to clipboard
                            </button>
                            <button type="button" onClick={downloadTxt} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold">
                                Download .txt
                            </button>
                        </div>
                        <label className="mt-4 flex items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                            <span>I've saved these codes somewhere safe.</span>
                        </label>
                        {ack && (
                            <button
                                type="button" onClick={() => { setCodes(null); }}
                                className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 font-semibold"
                            >
                                Done
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
