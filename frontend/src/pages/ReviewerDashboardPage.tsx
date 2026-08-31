import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import {
    fetchMyAssignments,
    logout as reviewerLogout,
    getReviewerToken,
    Assignment,
} from '../api/reviewerAuth';

/**
 * Personal reviewer dashboard.
 *
 * Fetches every review assigned to the signed-in reviewer from
 * /reviewer-auth/my-assignments and groups them into "Pending" and
 * "Completed" sections. Each row hyperlinks to the existing /review/:token
 * flow, which is left untouched.
 */

const statusPillClass = (status: string): string => {
    if (status === 'completed') return 'bg-green-100 text-green-700';
    if (status === 'expired') return 'bg-gray-200 text-gray-700';
    return 'bg-amber-100 text-amber-800';
};

const formatDate = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

interface AssignmentRowProps {
    assignment: Assignment;
    variant: 'pending' | 'completed';
}

const AssignmentRow: React.FC<AssignmentRowProps> = ({ assignment, variant }) => {
    const canOpen = !!assignment.link_token;
    const buttonLabel = variant === 'completed' ? 'View →' : 'Continue →';
    return (
        <li className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start justify-between gap-4 hover:shadow-md transition">
            <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 truncate">
                    {assignment.paper_title || 'Manuscript under review'}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>
                        <strong className="text-gray-600">Assigned:</strong>{' '}
                        {formatDate(assignment.assigned_at)}
                    </span>
                    {variant === 'pending' && assignment.deadline && (
                        <span>
                            <strong className="text-gray-600">Deadline:</strong>{' '}
                            {formatDate(assignment.deadline)}
                        </span>
                    )}
                    {variant === 'completed' && assignment.completed_at && (
                        <span>
                            <strong className="text-gray-600">Submitted:</strong>{' '}
                            {formatDate(assignment.completed_at)}
                        </span>
                    )}
                    {variant === 'pending' && !assignment.link_valid && (
                        <span className="text-red-600 font-semibold">
                            Link expired — contact editor
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusPillClass(
                        assignment.status,
                    )}`}
                >
                    {assignment.status}
                </span>
                {canOpen && (
                    <Link
                        to={`/review/${assignment.link_token}`}
                        className="text-xs px-4 py-1.5 rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-700 no-underline"
                    >
                        {buttonLabel}
                    </Link>
                )}
            </div>
        </li>
    );
};

const ReviewerDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!getReviewerToken()) {
            navigate('/reviewer-login', { replace: true });
            return;
        }
        let mounted = true;
        (async () => {
            try {
                const data = await fetchMyAssignments();
                if (mounted) setAssignments(data);
            } catch (err: any) {
                if (err?.response?.status === 401) {
                    // client.ts already cleared the token on 401.
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                if (mounted) setError('Could not load your assignments. Please try again.');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [navigate]);

    const handleSignOut = () => {
        reviewerLogout();
        navigate('/reviewer-login', { replace: true });
    };

    const pending = assignments.filter((a) => a.status !== 'completed');
    const completed = assignments.filter((a) => a.status === 'completed');

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            <section className="relative py-16 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                </div>
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold text-white tracking-tight">
                            Reviewer Dashboard
                        </h1>
                        <p className="mt-3 text-brand-200 max-w-2xl">
                            Every paper on your desk, at a glance. Reviews save
                            automatically until you submit.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="text-sm bg-white/10 hover:bg-white/20 text-white font-semibold px-4 py-2 rounded-lg border border-white/20"
                    >
                        Sign out
                    </button>
                </div>
            </section>

            <main className="flex-1 py-12">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-8 text-center">
                            <p className="text-red-700 font-semibold">{error}</p>
                        </div>
                    ) : assignments.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                            <span className="text-4xl block mb-3" aria-hidden="true">📬</span>
                            <h2 className="text-lg font-bold text-gray-900">No assignments yet</h2>
                            <p className="mt-2 text-gray-500 max-w-md mx-auto">
                                When an editor invites you to review a manuscript, it will appear here.
                            </p>
                        </div>
                    ) : (
                        <>
                            <section aria-labelledby="pending-heading">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 id="pending-heading" className="text-xl font-bold text-gray-900">
                                        Pending reviews
                                        {pending.length > 0 && (
                                            <span className="ml-2 text-sm font-normal text-gray-500">
                                                ({pending.length})
                                            </span>
                                        )}
                                    </h2>
                                </div>
                                {pending.length === 0 ? (
                                    <p className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500 text-center">
                                        Nothing outstanding.
                                    </p>
                                ) : (
                                    <ul className="grid gap-3">
                                        {pending.map((a) => (
                                            <AssignmentRow
                                                key={a.review_id}
                                                assignment={a}
                                                variant="pending"
                                            />
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section aria-labelledby="completed-heading">
                                <h2 id="completed-heading" className="text-xl font-bold text-gray-900 mb-4">
                                    Completed reviews
                                    {completed.length > 0 && (
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            ({completed.length})
                                        </span>
                                    )}
                                </h2>
                                {completed.length === 0 ? (
                                    <p className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500 text-center">
                                        No completed reviews yet — thanks in advance for your service.
                                    </p>
                                ) : (
                                    <ul className="grid gap-3">
                                        {completed.map((a) => (
                                            <AssignmentRow
                                                key={a.review_id}
                                                assignment={a}
                                                variant="completed"
                                            />
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ReviewerDashboardPage;
