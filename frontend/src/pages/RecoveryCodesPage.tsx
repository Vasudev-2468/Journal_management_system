import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import ProtectedAuthorRoute from '../components/common/ProtectedAuthorRoute';
import { generateCodes, getCount } from '../api/recoveryCodes';

/**
 * Recovery-codes management page.
 *
 * Shows the current remaining count and lets the user mint 8 fresh
 * backup codes. Regeneration voids every previous code, so we surface
 * a warning banner both before and after the operation.
 *
 * The full list of plaintext codes is ONLY available in the response
 * to /recovery-codes/generate — never fetch-again-able. We keep it in
 * component state and offer Copy / Download so the user can stash it
 * before navigating away.
 */
const TOTAL_CODES = 8;

const RecoveryCodesInner: React.FC = () => {
    const [remaining, setRemaining] = useState<number | null>(null);
    const [loadingCount, setLoadingCount] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [codes, setCodes] = useState<string[] | null>(null);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
        'idle',
    );
    const [error, setError] = useState<string | null>(null);

    const errorFrom = (err: any, fallback: string): string => {
        const detail = err?.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        return fallback;
    };

    const refreshCount = async () => {
        setLoadingCount(true);
        try {
            const res = await getCount();
            setRemaining(res.remaining);
        } catch (err) {
            setError(errorFrom(err, 'Could not load your recovery-code count.'));
        } finally {
            setLoadingCount(false);
        }
    };

    useEffect(() => {
        refreshCount();
        // refreshCount reads state via closures each call — safe to omit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGenerate = async () => {
        setError(null);
        setCopyState('idle');
        const proceed = window.confirm(
            codes || (remaining !== null && remaining < TOTAL_CODES)
                ? 'Generating new codes will void every existing recovery code, including any you have already used. Continue?'
                : 'Generate 8 fresh recovery codes now?',
        );
        if (!proceed) return;

        setGenerating(true);
        try {
            const res = await generateCodes();
            setCodes(res.codes);
            setGeneratedAt(res.generated_at);
            setRemaining(res.codes.length);
        } catch (err) {
            setError(errorFrom(err, 'Could not generate new recovery codes.'));
        } finally {
            setGenerating(false);
        }
    };

    const handleCopyAll = async () => {
        if (!codes) return;
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopyState('copied');
            window.setTimeout(() => setCopyState('idle'), 2000);
        } catch {
            setCopyState('failed');
        }
    };

    const handleDownload = () => {
        if (!codes) return;
        const header =
            '# JGAIR recovery codes\n' +
            `# Generated: ${generatedAt || new Date().toISOString()}\n` +
            '# Each code can only be used once. Store this file somewhere safe.\n\n';
        const blob = new Blob([header + codes.join('\n') + '\n'], {
            type: 'text/plain;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'jgair-recovery-codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-16">
                <div className="mx-auto max-w-2xl px-4">
                    <div className="mb-8">
                        <p className="text-xs uppercase tracking-widest text-brand-600 font-bold">
                            Two-factor authentication
                        </p>
                        <h1 className="mt-1 text-3xl font-extrabold text-gray-900">
                            Recovery codes
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">
                            Use a recovery code any time you can't reach your
                            authenticator app — for example on a new device or
                            when your phone is unavailable. Each code works
                            once and then expires.
                        </p>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                        >
                            {error}
                        </div>
                    )}

                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm text-gray-500">
                                    Codes remaining
                                </p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">
                                    {loadingCount
                                        ? '…'
                                        : `${remaining ?? 0} of ${TOTAL_CODES}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={generating}
                                className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-5 py-3 transition shadow"
                            >
                                {generating ? 'Generating…' : 'Generate new codes'}
                            </button>
                        </div>
                        {remaining !== null && remaining <= 2 && !codes && (
                            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                                You're running low — generate a fresh batch soon.
                            </p>
                        )}
                    </section>

                    {codes && (
                        <section className="bg-white rounded-2xl border border-brand-100 shadow-sm p-6 mb-6">
                            <div
                                role="alert"
                                className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 font-semibold"
                            >
                                Store these somewhere safe. They will not be
                                shown again — closing this page loses them for
                                good.
                            </div>
                            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-sm text-gray-800 mb-4 print:grid-cols-1">
                                {codes.map((code, idx) => (
                                    <li
                                        key={code + idx}
                                        className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 tracking-wider"
                                    >
                                        <span className="text-gray-400 mr-2">
                                            {String(idx + 1).padStart(2, '0')}.
                                        </span>
                                        {code}
                                    </li>
                                ))}
                            </ol>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopyAll}
                                    className="rounded-lg bg-gray-900 hover:bg-black text-white text-sm font-semibold px-4 py-2"
                                >
                                    {copyState === 'copied'
                                        ? 'Copied ✓'
                                        : copyState === 'failed'
                                          ? 'Copy failed — select the codes manually'
                                          : 'Copy all'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    className="rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 text-sm font-semibold px-4 py-2"
                                >
                                    Download .txt
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 text-sm font-semibold px-4 py-2"
                                >
                                    Print
                                </button>
                            </div>
                            {generatedAt && (
                                <p className="mt-3 text-xs text-gray-500">
                                    Generated{' '}
                                    {new Date(generatedAt).toLocaleString()}
                                </p>
                            )}
                        </section>
                    )}

                    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                            Good to know
                        </h2>
                        <ul className="mt-3 space-y-2 text-sm text-gray-600 list-disc pl-5">
                            <li>
                                Each code is one-time. After you spend one at
                                sign-in it stops working.
                            </li>
                            <li>
                                Generating a new set voids every previous code,
                                even the ones you haven't used yet.
                            </li>
                            <li>
                                Never share a code by email or messaging app —
                                anyone with a code can sign in as you.
                            </li>
                            <li>
                                Ran out?{' '}
                                <Link
                                    to="/recovery-codes"
                                    className="text-brand-600 hover:underline font-semibold"
                                >
                                    Regenerate here
                                </Link>{' '}
                                while you still have session access.
                            </li>
                        </ul>
                    </section>
                </div>
            </main>
            <Footer />
        </div>
    );
};

const RecoveryCodesPage: React.FC = () => (
    <ProtectedAuthorRoute>
        <RecoveryCodesInner />
    </ProtectedAuthorRoute>
);

export default RecoveryCodesPage;
