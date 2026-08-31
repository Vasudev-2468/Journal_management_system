import React, { useCallback, useMemo, useState } from 'react';
import FilePreviewModal from '../components/common/FilePreviewModal';

/*
 * useFilePreview — small hook that wires up an inline file-preview
 * modal without every caller having to manage its own open/closed
 * state.
 *
 *   const { open, close, PreviewNode } = useFilePreview();
 *   <a href={f.url} onClick={(e) => open({
 *       url: f.url,
 *       filename: f.name,
 *       mimeType: f.mime,
 *       event: e,      // optional — passing it lets the hook
 *   })}>{f.name}</a>   //   preventDefault() the click so the
 *                      //   fallback link doesn't also fire.
 *   {PreviewNode}
 *
 * The hook is intentionally rendered by the caller — inserting the
 * modal into JSX (rather than returning a portal-installer) keeps
 * SSR happy and lets callers control the mount point when they need
 * to.
 *
 * If a caller doesn't supply an `event`, the click's default action
 * still runs — so an `<a href="...">` still works as a fallback for
 * anyone who prefers the new-tab flow.
 */

export interface OpenPreviewArgs {
    url: string;
    filename: string;
    mimeType?: string;
    /**
     * Optional originating click event. When passed, the hook calls
     * `preventDefault()` so the underlying link doesn't navigate.
     */
    event?: React.SyntheticEvent;
}

interface PreviewState {
    url: string;
    filename: string;
    mimeType?: string;
}

export interface UseFilePreviewResult {
    open: (args: OpenPreviewArgs) => void;
    close: () => void;
    isOpen: boolean;
    PreviewNode: React.ReactNode;
}

export function useFilePreview(): UseFilePreviewResult {
    const [state, setState] = useState<PreviewState | null>(null);

    const open = useCallback((args: OpenPreviewArgs) => {
        if (!args || !args.url) return;
        // Suppress the fallback link navigation only when the caller
        // handed us the event to guard against.
        if (args.event && typeof args.event.preventDefault === 'function') {
            args.event.preventDefault();
        }
        setState({
            url: args.url,
            filename: args.filename,
            mimeType: args.mimeType,
        });
    }, []);

    const close = useCallback(() => setState(null), []);

    const PreviewNode = useMemo(() => {
        if (!state) return null;
        return React.createElement(FilePreviewModal, {
            url: state.url,
            filename: state.filename,
            mimeType: state.mimeType,
            onClose: close,
        });
    }, [state, close]);

    return {
        open,
        close,
        isOpen: state !== null,
        PreviewNode,
    };
}

export default useFilePreview;
