import React, { useCallback, useEffect, useState } from 'react';
import {
    ContactMessage,
    deleteContactMessage,
    fetchContactMessages,
    updateContactMessage,
} from '../api/contact';
import Loading from '../components/common/Loading';

const EditorContactInbox: React.FC = () => {
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'unread' | 'unresolved'>('all');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, boolean> = {};
            if (filter === 'unread') params.unread_only = true;
            if (filter === 'unresolved') params.resolved = false;
            const data = await fetchContactMessages(params);
            setMessages(data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load messages.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        load();
    }, [load]);

    const markRead = async (msg: ContactMessage) => {
        try {
            const updated = await updateContactMessage(msg.id, { is_read: !msg.is_read });
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        } catch (err) {
            /* noop UI feedback below */
        }
    };

    const toggleResolved = async (msg: ContactMessage) => {
        try {
            const updated = await updateContactMessage(msg.id, {
                resolved: !msg.resolved,
                is_read: true,
            });
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        } catch (err) {
            /* noop */
        }
    };

    const remove = async (msg: ContactMessage) => {
        if (!window.confirm(`Delete message from ${msg.name}?`)) return;
        try {
            await deleteContactMessage(msg.id);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        } catch (err) {
            /* noop */
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Contact Inbox</h1>
                <div className="flex gap-2 mb-4">
                    {(['all', 'unread', 'unresolved'] as const).map((key) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                                filter === key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 border border-gray-200'
                            }`}
                        >
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <Loading />
                ) : error ? (
                    <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-red-600">
                        {error}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                        No messages match the current filter.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {messages.map((msg) => (
                            <li
                                key={msg.id}
                                className={`bg-white rounded-xl border p-5 ${
                                    msg.is_read ? 'border-gray-200' : 'border-blue-300'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-gray-900">{msg.name}</span>
                                            <a
                                                href={`mailto:${msg.email}`}
                                                className="text-xs text-blue-600 hover:underline"
                                            >
                                                {msg.email}
                                            </a>
                                            {!msg.is_read && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                                                    NEW
                                                </span>
                                            )}
                                            {msg.resolved && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                                                    RESOLVED
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-medium text-gray-800">{msg.subject}</p>
                                        <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">
                                            {msg.message}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-3">
                                            {new Date(msg.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => markRead(msg)}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            {msg.is_read ? 'Mark unread' : 'Mark read'}
                                        </button>
                                        <button
                                            onClick={() => toggleResolved(msg)}
                                            className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            {msg.resolved ? 'Reopen' : 'Resolve'}
                                        </button>
                                        <button
                                            onClick={() => remove(msg)}
                                            className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default EditorContactInbox;
