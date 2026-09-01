import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import client from '../api/client';

// Author Revision Response page (spec §17-18).
//
// Reads the aggregated reviewer-comment checklist for the submission
// and lets the author reply to each comment inline. Every save is a
// single POST — no autosave for now — so the reviewer can see exactly
// what they wrote before it lands. Once every comment has a response,
// the author is free to submit the revised manuscript via the
// existing revision-upload workflow.

interface ChecklistItem {
    review_id: string;
    reviewer_display_name: string;
    kind: 'major' | 'minor';
    index: number;
    page: string;
    section: string;
    line: string;
    comment: string;
    author_response: string;
    change_location: string;
    responded_at?: string | null;
}

interface ChecklistResponse {
    submission_id: string;
    round: number;
    total: number;
    responded: number;
    comments: ChecklistItem[];
}

const KIND_LABEL: Record<ChecklistItem['kind'], string> = {
    major: 'Major',
    minor: 'Minor',
};

const KIND_TONE: Record<ChecklistItem['kind'], string> = {
    major: 'border-rose-200 bg-rose-50/40',
    minor: 'border-amber-200 bg-amber-50/40',
};

export default function AuthorRevisionResponsePage() {
    const { submissionId = '' } = useParams();
    const [data, setData] = useState<ChecklistResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    // Local edits keyed by (review_id, kind, index).
    const [drafts, setDrafts] = useState<Record<string, { response_text: string; change_location: string }>>({});

    const keyOf = (c: ChecklistItem) => `${c.review_id}:${c.kind}:${c.index}`;

    useEffect(() => {
        client
            .get<ChecklistResponse>(`/author-revision/submissions/${submissionId}/checklist`)
            .then((r) => {
                setData(r.data);
                const initial: typeof drafts = {};
                for (const c of r.data.comments) {
                    initial[keyOf(c)] = {
                        response_text: c.author_response,
                        change_location: c.change_location,
                    };
                }
                setDrafts(initial);
            })
            .catch((err) => {
                setError(err?.response?.data?.detail || 'Could not load the checklist.');
            })
            .finally(() => setLoading(false));
    }, [submissionId]);

    const groupedByReviewer = useMemo(() => {
        if (!data) return [] as Array<{ reviewer: string; items: ChecklistItem[] }>;
        const map = new Map<string, ChecklistItem[]>();
        for (const c of data.comments) {
            if (!map.has(c.reviewer_display_name)) map.set(c.reviewer_display_name, []);
            map.get(c.reviewer_display_name)!.push(c);
        }
        return Array.from(map.entries()).map(([reviewer, items]) => ({ reviewer, items }));
    }, [data]);

    const patch = (c: ChecklistItem, delta: Partial<{ response_text: string; change_location: string }>) => {
        const k = keyOf(c);
        setDrafts((prev) => ({ ...prev, [k]: { ...prev[k], ...delta } }));
    };

    const save = async (c: ChecklistItem) => {
        const k = keyOf(c);
        const draft = drafts[k] || { response_text: '', change_location: '' };
        setSavingKey(k);
        try {
            await client.post(`/author-revision/submissions/${submissionId}/response`, {
                review_id: c.review_id,
                comment_kind: c.kind,
                comment_index: c.index,
                response_text: draft.response_text,
                change_location: draft.change_location,
            });
            // Reflect the save locally so responded_at + responded count update
            setData((prev) => {
                if (!prev) return prev;
                const next = prev.comments.map((x) =>
                    keyOf(x) === k
                        ? {
                              ...x,
                              author_response: draft.response_text,
                              change_location: draft.change_location,
                              responded_at: new Date().toISOString(),
                          }
                        : x,
                );
                const responded = next.filter((x) => x.author_response.trim().length > 0).length;
                return { ...prev, comments: next, responded };
            });
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Could not save this response.');
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-50"><Header /><Loading /><Footer /></div>;
    if (error || !data) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />
                <main className="flex-1 py-12 max-w-4xl mx-auto w-full px-4">
                    <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error || 'Not found.'}</div>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-8 max-w-4xl mx-auto w-full px-4">
                <div className="mb-4">
                    <Link
                        to={`/author-dashboard/${submissionId}`}
                        className="text-sm text-gray-500 hover:text-blue-700"
                    >
                        ← Back to submission
                    </Link>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                    <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Revision Required</div>
                    <h1 className="text-2xl font-bold text-gray-900 mt-1">Respond to reviewer comments</h1>
                    <p className="text-sm text-gray-600 mt-2">
                        The editor decided <strong>Revision</strong> on your manuscript. Address each
                        reviewer comment below — reply with what you changed and where the change
                        lives in the revised manuscript. This response is sent to the reviewers alongside
                        your revised paper.
                    </p>
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
                            Round {data.round}
                        </span>
                        <span className="text-xs text-gray-600">
                            <strong>{data.responded}</strong> of {data.total} comments answered
                        </span>
                        <div className="flex-1" />
                        <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500"
                                style={{ width: data.total > 0 ? `${(100 * data.responded) / data.total}%` : '0%' }}
                            />
                        </div>
                    </div>
                </div>

                {data.total === 0 && (
                    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500 text-sm">
                        No Major or Minor comments from the reviewers.
                    </div>
                )}

                {groupedByReviewer.map(({ reviewer, items }) => (
                    <div key={reviewer} className="mb-8">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">{reviewer}</h2>
                        <div className="space-y-3">
                            {items.map((c) => {
                                const k = keyOf(c);
                                const draft = drafts[k] || { response_text: '', change_location: '' };
                                const responded = c.author_response.trim().length > 0;
                                return (
                                    <div key={k} className={`rounded-xl border p-5 ${KIND_TONE[c.kind]}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span
                                                className={
                                                    'text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ' +
                                                    (c.kind === 'major'
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-amber-100 text-amber-800')
                                                }
                                            >
                                                {KIND_LABEL[c.kind]} #{c.index + 1}
                                            </span>
                                            {(c.page || c.section || c.line) && (
                                                <span className="text-[11px] font-mono text-gray-500">
                                                    {[c.page && `Page ${c.page}`, c.section, c.line && `line ${c.line}`]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </span>
                                            )}
                                            {responded && (
                                                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">
                                                    Responded
                                                </span>
                                            )}
                                        </div>
                                        <div className="mb-3">
                                            <div className="text-[10px] uppercase text-gray-500 font-semibold">Reviewer comment</div>
                                            <p className="text-sm text-gray-900 whitespace-pre-wrap">{c.comment}</p>
                                        </div>
                                        <label className="block mb-2">
                                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Your response</span>
                                            <textarea
                                                value={draft.response_text}
                                                onChange={(e) => patch(c, { response_text: e.target.value })}
                                                rows={3}
                                                className="mt-0.5 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                placeholder="We have added Section 3.2 describing…"
                                            />
                                        </label>
                                        <label className="block mb-3">
                                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Location of change in revised manuscript</span>
                                            <input
                                                type="text"
                                                value={draft.change_location}
                                                onChange={(e) => patch(c, { change_location: e.target.value })}
                                                className="mt-0.5 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                placeholder="Page 8, paragraph 2"
                                            />
                                        </label>
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => save(c)}
                                                disabled={savingKey === k}
                                                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                                            >
                                                {savingKey === k ? 'Saving…' : 'Save response'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </main>
            <Footer />
        </div>
    );
}
