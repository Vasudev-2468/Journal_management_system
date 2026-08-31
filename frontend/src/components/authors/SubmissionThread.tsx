import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchMessages,
    sendMessage,
    SubmissionMessage,
} from '../../api/messages';

interface Props {
    submissionId: string;
    /** Viewer perspective. Defaults to 'author'. */
    viewerRole?: 'author' | 'editor';
}

const POLL_MS = 30_000;

function relativeTime(iso: string): string {
    const when = new Date(iso).getTime();
    if (Number.isNaN(when)) return '';
    const delta = Math.max(0, Date.now() - when);
    const s = Math.floor(delta / 1000);
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * SubmissionThread — chat-style author ↔ editor messages for one submission.
 * Polls every 30 seconds, appends optimistically on send.
 */
export default function SubmissionThread({
    submissionId,
    viewerRole = 'author',
}: Props): JSX.Element {
    const [messages, setMessages] = useState<SubmissionMessage[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [sending, setSending] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const mountedRef = useRef<boolean>(true);

    const load = useCallback(async (): Promise<void> => {
        try {
            const rows = await fetchMessages(submissionId);
            if (!mountedRef.current) return;
            setMessages(rows);
            setError(null);
        } catch (e: any) {
            if (!mountedRef.current) return;
            if (e?.response?.status === 403) {
                setError('You do not have access to this thread.');
            } else if (e?.response?.status !== 404) {
                setError('Could not load the message thread.');
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => {
        mountedRef.current = true;
        load();
        const t = window.setInterval(load, POLL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(t);
        };
    }, [load]);

    // Scroll to bottom whenever the message list grows.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length]);

    const handleSend = async (): Promise<void> => {
        const body = draft.trim();
        if (!body || sending) return;
        setSending(true);
        setError(null);

        // Optimistic append with a negative-id temp row.
        const tempId = -Date.now();
        const optimistic: SubmissionMessage = {
            id: tempId,
            submission_id: submissionId,
            sender_role: viewerRole,
            sender_email: null,
            body,
            is_from_editor: viewerRole === 'editor',
            read_by_author_at: null,
            read_by_editor_at: null,
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);
        setDraft('');

        try {
            const saved = await sendMessage(submissionId, body);
            if (!mountedRef.current) return;
            setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? saved : m)),
            );
        } catch (e: any) {
            if (!mountedRef.current) return;
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setDraft(body);
            setError(
                e?.response?.status === 403
                    ? 'You are not allowed to post to this thread.'
                    : 'Could not send your message. Please try again.',
            );
        } finally {
            if (mountedRef.current) setSending(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSend();
        }
    };

    return (
        <section
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
            aria-label="Author to editor message thread"
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-sm font-bold text-gray-900">
                        Message the editorial office
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Private conversation about this submission
                    </p>
                </div>
                <span className="text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                    {messages.length} message{messages.length === 1 ? '' : 's'}
                </span>
            </div>

            <div
                ref={scrollRef}
                className="border border-gray-100 rounded-xl bg-gray-50 h-64 overflow-y-auto p-3 space-y-2"
            >
                {loading ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                        Loading messages…
                    </p>
                ) : messages.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                        No messages yet — start the conversation below.
                    </p>
                ) : (
                    messages.map((m) => {
                        const isViewer = viewerRole === 'author'
                            ? m.sender_role === 'author'
                            : m.sender_role === 'editor';
                        return (
                            <div
                                key={m.id}
                                className={`flex ${isViewer ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                        isViewer
                                            ? 'bg-green-700 text-white rounded-br-sm'
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap break-words leading-snug">
                                        {m.body}
                                    </p>
                                    <p
                                        className={`text-xs mt-1 ${
                                            isViewer ? 'text-green-100/80' : 'text-gray-400'
                                        }`}
                                    >
                                        {m.sender_role === 'editor'
                                            ? 'Editor'
                                            : m.sender_role === 'system'
                                                ? 'System'
                                                : 'You'}
                                        {' · '}
                                        {relativeTime(m.created_at)}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {error && (
                <p className="text-xs text-red-600 mt-2" role="alert">
                    {error}
                </p>
            )}

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={2}
                    maxLength={10000}
                    placeholder="Write a message to the editorial office…"
                    className="flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition-all"
                    aria-label="Message body"
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {sending ? 'Sending…' : 'Send'}
                </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
                Tip: press ⌘/Ctrl + Enter to send.
            </p>
        </section>
    );
}
