import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Shared toast primitive — replaces the 31 native alert() calls in
// author/reviewer/editor pages with a consistent, non-blocking UI.
//
// Usage:
//   const toast = useToast();
//   toast.success('Draft saved');
//   toast.error('Could not save');
//   toast.info('Reviewer 2 is overdue');
//
// The provider mounts a single portal region and manages its own
// timers. Toasts auto-dismiss after `duration` ms (default 4500),
// with an optional Undo action for destructive operations.

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
    duration?: number;
    action?: { label: string; onClick: () => void };
}

interface ToastRow {
    id: number;
    tone: ToastTone;
    message: string;
    action?: { label: string; onClick: () => void };
}

interface ToastAPI {
    success: (message: string, opts?: ToastOptions) => void;
    error: (message: string, opts?: ToastOptions) => void;
    info: (message: string, opts?: ToastOptions) => void;
    warning: (message: string, opts?: ToastOptions) => void;
    dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

// Callers that don't need a provider get a graceful fallback that
// silently no-ops — matches the shape of the API so components
// authored against it still type-check outside the provider.
const NOOP: ToastAPI = {
    success: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warning: () => undefined,
    dismiss: () => undefined,
};

export const useToast = (): ToastAPI => useContext(ToastContext) || NOOP;

const TONE_CLASS: Record<ToastTone, string> = {
    success: 'bg-emerald-600 border-emerald-700 text-white',
    error:   'bg-rose-600 border-rose-700 text-white',
    info:    'bg-blue-600 border-blue-700 text-white',
    warning: 'bg-amber-500 border-amber-600 text-white',
};

const ICON: Record<ToastTone, string> = {
    success: '✓',
    error:   '✕',
    info:    'i',
    warning: '!',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [rows, setRows] = useState<ToastRow[]>([]);

    const dismiss = useCallback((id: number) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    }, []);

    const push = useCallback(
        (tone: ToastTone, message: string, opts?: ToastOptions) => {
            const id = Date.now() + Math.floor(Math.random() * 1000);
            setRows((prev) => [...prev, { id, tone, message, action: opts?.action }]);
            const duration = opts?.duration ?? 4500;
            if (duration > 0) {
                window.setTimeout(() => dismiss(id), duration);
            }
        },
        [dismiss],
    );

    const api = useMemo<ToastAPI>(() => ({
        success: (m, o) => push('success', m, o),
        error:   (m, o) => push('error', m, o),
        info:    (m, o) => push('info', m, o),
        warning: (m, o) => push('warning', m, o),
        dismiss,
    }), [push, dismiss]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
            >
                {rows.map((r) => (
                    <div
                        key={r.id}
                        role={r.tone === 'error' ? 'alert' : 'status'}
                        className={`pointer-events-auto rounded-lg shadow-lg border px-4 py-3 flex items-start gap-3 text-sm ${TONE_CLASS[r.tone]}`}
                    >
                        <span className="font-bold text-base leading-none">{ICON[r.tone]}</span>
                        <span className="flex-1 leading-snug">{r.message}</span>
                        {r.action && (
                            <button
                                type="button"
                                onClick={() => { r.action?.onClick(); dismiss(r.id); }}
                                className="font-bold text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
                            >
                                {r.action.label}
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => dismiss(r.id)}
                            className="text-white/80 hover:text-white leading-none"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

// Confirm — a promise-based replacement for window.confirm.
// Renders a modal that resolves true/false. One instance at a time
// via a lightweight event bus so callers don't have to thread state.

interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
}

let confirmResolver: ((v: boolean) => void) | null = null;
let confirmSetter: ((v: (ConfirmOptions & { open: boolean }) | null) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        if (!confirmSetter) {
            resolve(false);
            return;
        }
        confirmResolver = resolve;
        confirmSetter({ ...opts, open: true });
    });
}

export const ConfirmHost: React.FC = () => {
    const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
    useEffect(() => {
        confirmSetter = setState;
        return () => { confirmSetter = null; };
    }, []);
    if (!state?.open) return null;
    const done = (v: boolean) => {
        setState(null);
        const r = confirmResolver;
        confirmResolver = null;
        r?.(v);
    };
    const danger = state.tone === 'danger';
    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{state.title}</h3>
                {state.message && (
                    <p className="text-sm text-gray-700 mb-4">{state.message}</p>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => done(false)}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                    >
                        {state.cancelLabel || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={() => done(true)}
                        className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${
                            danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-700 hover:bg-blue-800'
                        }`}
                    >
                        {state.confirmLabel || 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};
