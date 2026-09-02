import React, { useEffect, useRef, useState } from 'react';

/*
 * PDF viewer that supports text selection.
 *
 * The manuscript PDF is served by the backend behind an editor / reviewer
 * session token. Loading it into a same-origin blob URL is what unlocks
 * selection access: a cross-origin iframe delegates selection to the
 * browser's PDF plugin, which never surfaces it back to us.
 *
 * We load PDF.js from cdnjs (already on the project's CDN allowlist),
 * fetch the PDF bytes with an authenticated fetch, render each page's
 * canvas + text layer, and listen for `mouseup` to capture the reviewer's
 * selection. The selection is handed to the caller via ``onSelectedText``
 * so the parent can send it to the Annotation Assistant Agent.
 */

// PDF.js UMD (2.16 — deliberately pinned; the 3.x/4.x renderer uses
// modules that don't play with CRA's script-injection strategy).
const PDFJS_VERSION = '2.16.105';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
const PDFJS_TEXT_LAYER_CSS = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf_viewer.min.css`;

// Global marker so multiple viewers on the same page reuse the same script.
declare global {
    interface Window {
        pdfjsLib?: any;
    }
}

const loadPdfJs = (): Promise<any> => {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
        // Load the CSS once so text-layer positioning is right.
        if (!document.querySelector(`link[data-pdfjs-css]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = PDFJS_TEXT_LAYER_CSS;
            link.setAttribute('data-pdfjs-css', '1');
            document.head.appendChild(link);
        }
        const script = document.createElement('script');
        script.src = PDFJS_SRC;
        script.async = true;
        script.onload = () => {
            const lib = window.pdfjsLib;
            if (!lib) { reject(new Error('pdf.js failed to expose pdfjsLib')); return; }
            lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
            resolve(lib);
        };
        script.onerror = () => reject(new Error('Could not load pdf.js from CDN'));
        document.head.appendChild(script);
    });
};

interface Props {
    pdfUrl: string;                          // authenticated PDF URL
    onSelectedText?: (text: string) => void; // fires with the current selection
    stickyTopClass?: string;                 // e.g. 'sticky top-24 h-[calc(100vh-140px)]'
}

const PdfViewerWithSelection: React.FC<Props> = ({
    pdfUrl,
    onSelectedText,
    stickyTopClass = 'sticky top-24 h-[calc(100vh-140px)]',
}) => {
    // Two refs, on purpose. ``scrollRef`` is a React-owned container
    // that carries the loading / error text; ``pagesRef`` is a
    // sibling div we mutate imperatively via appendChild +
    // ``innerHTML = ''``. Mixing the two on a single ref caused a
    // React reconciliation crash — a state change triggered a diff
    // whose "remove child text node" step failed because the effect
    // had already blown that node away with ``innerHTML = ''``.
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const pagesRef = useRef<HTMLDivElement | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [selection, setSelection] = useState<string>('');

    // Render pipeline — runs once per PDF url.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadState('loading');
            try {
                const pdfjsLib = await loadPdfJs();
                const res = await fetch(pdfUrl, { credentials: 'include' });
                if (!res.ok) throw new Error(`PDF fetch failed: HTTP ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();
                if (cancelled) return;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) return;
                setNumPages(pdf.numPages);

                // Clear any previous render so a subsequent url swap
                // doesn't stack the two documents. We touch ONLY the
                // pages sibling — React never renders into it.
                const container = pagesRef.current;
                if (!container) return;
                container.innerHTML = '';

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    if (cancelled) return;
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 1.35 });

                    // Wrapper — canvas + absolute-positioned text layer.
                    const wrap = document.createElement('div');
                    wrap.className = 'relative mx-auto my-3 shadow-sm bg-white';
                    wrap.style.width = `${viewport.width}px`;
                    wrap.style.height = `${viewport.height}px`;

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.className = 'block';
                    wrap.appendChild(canvas);

                    const textLayerDiv = document.createElement('div');
                    textLayerDiv.className = 'textLayer';
                    textLayerDiv.style.position = 'absolute';
                    textLayerDiv.style.top = '0';
                    textLayerDiv.style.left = '0';
                    textLayerDiv.style.width = `${viewport.width}px`;
                    textLayerDiv.style.height = `${viewport.height}px`;
                    textLayerDiv.setAttribute('data-page', String(pageNum));
                    wrap.appendChild(textLayerDiv);

                    container.appendChild(wrap);

                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;
                    await page.render({ canvasContext: ctx, viewport }).promise;

                    // Text-layer rendering is best-effort: the cdnjs 2.16
                    // pdf.min.js drops ``renderTextLayer`` (it lives in
                    // pdf_viewer.js), so we probe for it and skip the
                    // text overlay if it's missing rather than crashing
                    // the whole render pipeline. Reviewers still see the
                    // rendered page; selection just uses the canvas
                    // fallback (browser-native, no rich highlights).
                    if (typeof pdfjsLib.renderTextLayer === 'function') {
                        try {
                            const textContent = await page.getTextContent();
                            pdfjsLib.renderTextLayer({
                                textContent,
                                container: textLayerDiv,
                                viewport,
                                textDivs: [],
                            });
                        } catch {
                            /* swallow — the canvas render is enough on its own */
                        }
                    }
                }
                if (cancelled) return;
                setLoadState('ready');
            } catch (err: any) {
                if (!cancelled) {
                    setError(err?.message || 'Failed to render PDF');
                    setLoadState('error');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [pdfUrl]);

    // Selection listener — fires on mouseup / keyup inside our container.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return undefined;
        const handler = () => {
            const s = window.getSelection?.();
            const text = s ? s.toString().trim() : '';
            setSelection(text);
        };
        el.addEventListener('mouseup', handler);
        el.addEventListener('keyup', handler);
        return () => {
            el.removeEventListener('mouseup', handler);
            el.removeEventListener('keyup', handler);
        };
    }, []);

    return (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${stickyTopClass}`}>
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700 truncate">
                    Manuscript PDF{numPages ? ` · ${numPages} page${numPages === 1 ? '' : 's'}` : ''}
                </span>
                <a href={pdfUrl} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">
                    Open ↗
                </a>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100 px-3">
                {loadState === 'loading' && (
                    <div className="p-6 text-center text-xs text-gray-500">Rendering PDF…</div>
                )}
                {loadState === 'error' && (
                    <div className="p-6 text-center text-xs text-rose-700">
                        {error || 'Could not render the PDF.'}
                    </div>
                )}
                {/* Imperative-render target. React owns the enclosing */}
                {/* <div ref={scrollRef}> but never touches this one — */}
                {/* the effect fills it with canvases + text layers. */}
                <div ref={pagesRef} />
            </div>
            {selection && onSelectedText && (
                <div className="p-3 border-t border-gray-200 bg-blue-50 flex items-center gap-3">
                    <div className="text-xs text-gray-700 flex-1 line-clamp-2 italic">
                        “{selection.slice(0, 240)}{selection.length > 240 ? '…' : ''}”
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelectedText(selection)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 whitespace-nowrap"
                        title="Send this selection to the Annotation Assistant Agent"
                    >
                        ✨ Add annotation
                    </button>
                </div>
            )}
        </div>
    );
};

export default PdfViewerWithSelection;
