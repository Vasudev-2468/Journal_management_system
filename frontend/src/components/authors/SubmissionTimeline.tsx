import React, { useEffect, useMemo, useState } from 'react';
import { fetchTimeline, TimelineEvent } from '../../api/timeline';

/* ══════════════════════════════════════════════════════
 *   Author-facing submission timeline
 *
 *   Vertical timeline (dot + connector), one row per event. Icon
 *   selected from the event ``kind`` family so a new
 *   ``status_change:...`` or ``production:...`` value renders sensibly
 *   without needing a code change.
 * ══════════════════════════════════════════════════════ */

interface Props {
    submissionId: string;
}

/** Group an event's ``kind`` down to its family (before the colon). */
function eventFamily(kind: string): string {
    const idx = kind.indexOf(':');
    return idx === -1 ? kind : kind.slice(0, idx);
}

/** Icon per event family. Unknown families fall back to a neutral dot. */
function iconFor(kind: string): string {
    switch (eventFamily(kind)) {
        case 'submitted':
            return '📤';
        case 'status_change':
            return '🔄';
        case 'review_assigned':
            return '📬';
        case 'review_completed':
            return '✅';
        case 'decision':
            return '⚖️';
        case 'revision':
            return '✏️';
        case 'production':
            return '🖨️';
        default:
            return '•';
    }
}

/** Accent colour classes per event family. */
function accentFor(kind: string): { dot: string; ring: string } {
    switch (eventFamily(kind)) {
        case 'submitted':
            return { dot: 'bg-green-500', ring: 'ring-green-100' };
        case 'review_assigned':
            return { dot: 'bg-purple-500', ring: 'ring-purple-100' };
        case 'review_completed':
            return { dot: 'bg-emerald-500', ring: 'ring-emerald-100' };
        case 'decision':
            return { dot: 'bg-amber-500', ring: 'ring-amber-100' };
        case 'revision':
            return { dot: 'bg-blue-500', ring: 'ring-blue-100' };
        case 'production':
            return { dot: 'bg-indigo-500', ring: 'ring-indigo-100' };
        case 'status_change':
            return { dot: 'bg-slate-400', ring: 'ring-slate-100' };
        default:
            return { dot: 'bg-gray-400', ring: 'ring-gray-100' };
    }
}

function fmtTs(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const SubmissionTimeline: React.FC<Props> = ({ submissionId }) => {
    const [events, setEvents] = useState<TimelineEvent[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!submissionId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchTimeline(submissionId)
            .then((res) => {
                if (cancelled) return;
                setEvents(Array.isArray(res.events) ? res.events : []);
            })
            .catch(() => {
                if (cancelled) return;
                // Any error collapses the section to the empty state
                // rather than showing a broken widget on the author's
                // submission page.
                setEvents([]);
                setError('Timeline is temporarily unavailable.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [submissionId]);

    /* Header treatment consistent with the other cards on the page. */
    const header = (
        <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
                <span aria-hidden="true" className="text-sm">🧭</span>
            </div>
            <div>
                <p className="text-sm font-bold text-gray-900">Submission Timeline</p>
                <p className="text-xs text-gray-400">
                    Every event we recorded for this manuscript
                </p>
            </div>
        </div>
    );

    const body = useMemo(() => {
        if (loading) {
            // Loading skeleton — three rows of shimmery placeholders,
            // matched vertically to the real timeline layout.
            return (
                <div className="space-y-4" aria-busy="true" aria-live="polite">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 rounded bg-gray-200 animate-pulse w-3/4" />
                                <div className="h-2 rounded bg-gray-100 animate-pulse w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        if (!events || events.length === 0) {
            return (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500">
                        Timeline populates as your manuscript moves through the process.
                    </p>
                    {error && (
                        <p className="mt-2 text-[11px] text-gray-400">{error}</p>
                    )}
                </div>
            );
        }

        return (
            <ol className="relative pl-7">
                {/* Vertical connector — sits behind the dots, drawn a
                    little inset from the left so the dots overlap it. */}
                <span
                    className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-gray-200"
                    aria-hidden="true"
                />
                {events.map((e, i) => {
                    const accent = accentFor(e.kind);
                    const icon = iconFor(e.kind);
                    return (
                        <li
                            key={`${e.at}-${e.kind}-${i}`}
                            className="relative flex items-start gap-3 mb-5 last:mb-0"
                        >
                            <div
                                className={`relative z-10 w-7 h-7 rounded-full ring-4 ${accent.ring} ${accent.dot} text-white text-xs flex items-center justify-center flex-shrink-0 shadow-md`}
                                aria-hidden="true"
                            >
                                <span>{icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800 leading-snug">
                                    {e.label}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-gray-500">
                                    <span className="font-mono">{fmtTs(e.at)}</span>
                                    {e.actor && (
                                        <span className="italic">by {e.actor}</span>
                                    )}
                                    <span className="text-gray-300 font-mono">
                                        {e.kind}
                                    </span>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        );
    }, [events, loading, error]);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            {header}
            {body}
        </div>
    );
};

export default SubmissionTimeline;
