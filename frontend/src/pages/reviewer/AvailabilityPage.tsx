import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { AvailabilityResponse, fetchAvailability, saveAvailability } from '../../api/reviewerPortal';

const toInput = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '');
const toIso = (val: string): string | null => (val ? new Date(val).toISOString() : null);

export default function AvailabilityPage() {
    const navigate = useNavigate();
    const [state, setState] = useState<AvailabilityResponse | null>(null);
    const [maxAssignments, setMaxAssignments] = useState<number>(5);
    const [from, setFrom] = useState('');
    const [until, setUntil] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        fetchAvailability()
            .then((a) => {
                setState(a);
                setMaxAssignments(a.max_assignments);
                setFrom(toInput(a.unavailable_from));
                setUntil(toInput(a.unavailable_until));
            })
            .catch((err) => {
                if (err?.response?.status === 401) navigate('/reviewer-login', { replace: true });
            })
            .finally(() => setLoading(false));
    };
    useEffect(load, [navigate]);

    if (loading || !state) return <ReviewerPortalLayout active="availability"><Loading /></ReviewerPortalLayout>;

    const inWindow = state.unavailable_from && state.unavailable_until;

    const save = async (opts: { clear?: boolean } = {}) => {
        setSaving(true); setFlash(null);
        try {
            const body: any = { max_assignments: maxAssignments };
            if (opts.clear) {
                body.clear_unavailable = true;
            } else {
                body.unavailable_from = toIso(from);
                body.unavailable_until = toIso(until);
            }
            const next = await saveAvailability(body);
            setState(next);
            setMaxAssignments(next.max_assignments);
            setFrom(toInput(next.unavailable_from));
            setUntil(toInput(next.unavailable_until));
            setFlash('Availability updated.');
            setTimeout(() => setFlash(null), 2400);
        } catch (err: any) {
            setFlash(err?.response?.data?.detail || 'Could not update availability.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ReviewerPortalLayout active="availability">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Review Availability</h1>
            {flash && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{flash}</div>}

            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <div className="flex items-center gap-3">
                    <span className={
                        'inline-flex items-center gap-1.5 text-sm font-semibold ' +
                        (state.available ? 'text-emerald-700' : 'text-rose-700')
                    }>
                        <span className={'w-2 h-2 rounded-full ' + (state.available ? 'bg-emerald-500' : 'bg-rose-500')} />
                        {state.available ? 'Available for reviews' : 'Temporarily unavailable'}
                    </span>
                    <span className="text-sm text-gray-500 ml-auto">
                        Current active reviews: <strong>{state.current_load}</strong> of {state.max_assignments}
                    </span>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Maximum active reviews
                </h2>
                <input
                    type="number" min={1} max={50}
                    value={maxAssignments}
                    onChange={(e) => setMaxAssignments(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Set an unavailable window
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                    Editors will not send you new review invitations during this window.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <label className="block">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</span>
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Until</span>
                        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </label>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button" onClick={() => save()} disabled={saving}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save availability'}
                    </button>
                    {inWindow && (
                        <button
                            type="button" onClick={() => save({ clear: true })} disabled={saving}
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Clear unavailable window
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">
                    Preferred areas
                </h2>
                <div className="flex flex-wrap gap-1">
                    {state.preferred_areas.length === 0 ? (
                        <span className="text-sm text-gray-500">
                            No expertise tags set — add them in your Profile.
                        </span>
                    ) : (
                        state.preferred_areas.map((a) => (
                            <span key={a} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a}</span>
                        ))
                    )}
                </div>
            </div>
        </ReviewerPortalLayout>
    );
}
