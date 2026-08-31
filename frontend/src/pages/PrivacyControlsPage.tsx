import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import ProtectedAuthorRoute from '../components/common/ProtectedAuthorRoute';
import { getAuthorProfile, authorLogout } from '../api/authorAuth';
import { deleteMyAccount, exportMyData } from '../api/gdpr';

/**
 * Privacy controls page — GDPR self-serve for authenticated authors.
 *
 * Two cards:
 *   1. Download your data — hits ``/gdpr/my-data-export`` and streams
 *      the JSON bundle into the browser's download tray.
 *   2. Delete your account — opens a modal with an email confirmation
 *      input. The button only enables when the input exactly matches
 *      the user's own email; on submit, we call the anonymisation
 *      endpoint, wipe the local session, and send the user home.
 *
 * We deliberately avoid changing App.tsx / Header / Footer — the caller
 * mounts this at ``/privacy-controls`` themselves. The self-guard below
 * makes the component usable in isolation nonetheless.
 */

const errorFrom = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return fallback;
};

const PrivacyControlsInner: React.FC = () => {
    const navigate = useNavigate();

    const [userEmail, setUserEmail] = useState<string>('');
    const [profileError, setProfileError] = useState<string | null>(null);

    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportOk, setExportOk] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [typedEmail, setTypedEmail] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const profile = await getAuthorProfile();
                if (cancelled) return;
                if (profile?.email) setUserEmail(profile.email);
                else setProfileError('Could not load your profile.');
            } catch {
                if (!cancelled) setProfileError('Could not load your profile.');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Export handler ──────────────────────────────────

    const handleExport = async () => {
        setExportError(null);
        setExportOk(false);
        setExporting(true);
        try {
            await exportMyData();
            setExportOk(true);
        } catch (err) {
            setExportError(
                errorFrom(err, 'Could not prepare your data export. Try again.'),
            );
        } finally {
            setExporting(false);
        }
    };

    // ── Delete handler ──────────────────────────────────

    const openDeleteModal = () => {
        setDeleteError(null);
        setTypedEmail('');
        setModalOpen(true);
    };

    const closeDeleteModal = () => {
        if (deleting) return;
        setModalOpen(false);
    };

    const emailMatches = Boolean(
        userEmail && typedEmail.trim().toLowerCase() === userEmail.trim().toLowerCase(),
    );

    const handleDelete = async () => {
        if (!emailMatches) return;
        setDeleteError(null);
        setDeleting(true);
        try {
            const res = await deleteMyAccount(typedEmail.trim());
            setDeleteSuccess(res.message);
            // Give the user a moment to read the confirmation, then
            // wipe local session and bounce home. Editorial records
            // survive server-side; the client just needs to forget the
            // JWT — otherwise ProtectedAuthorRoute would spin.
            window.setTimeout(() => {
                authorLogout();
                navigate('/', { replace: true });
            }, 2500);
        } catch (err) {
            setDeleteError(
                errorFrom(
                    err,
                    'Could not delete your account. Please try again or contact support.',
                ),
            );
            setDeleting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-16">
                <div className="mx-auto max-w-3xl px-4">
                    <div className="mb-8">
                        <p className="text-xs uppercase tracking-widest text-brand-600 font-bold">
                            Your data
                        </p>
                        <h1 className="mt-1 text-3xl font-extrabold text-gray-900">
                            Privacy controls
                        </h1>
                        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                            Under the GDPR you have the right to a copy of every
                            record we hold about you and the right to have your
                            personal information anonymised. Both are self-serve
                            here — no support ticket required. See the full{' '}
                            <Link
                                to="/privacy-policy"
                                className="text-brand-600 hover:underline font-semibold"
                            >
                                Privacy Policy
                            </Link>{' '}
                            for what is kept and for how long.
                        </p>
                    </div>

                    {profileError && (
                        <div
                            role="alert"
                            className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                        >
                            {profileError}
                        </div>
                    )}

                    {/* ── Card 1 — Download your data ─────────── */}
                    <section
                        aria-labelledby="download-heading"
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6"
                    >
                        <h2
                            id="download-heading"
                            className="text-xl font-bold text-gray-900"
                        >
                            Download your data
                        </h2>
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                            Get a single JSON file containing your profile,
                            every submission and article you've authored,
                            reviews you've written, messages you've exchanged
                            with editors, and your account's session history.
                            Passwords, one-time codes, and file-storage URLs
                            are never included.
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={exporting}
                                className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-6 py-3 transition shadow"
                            >
                                {exporting ? 'Preparing…' : 'Download JSON'}
                            </button>
                            {exportOk && (
                                <span className="text-sm text-emerald-700 font-semibold">
                                    Download started — check your browser's
                                    download tray.
                                </span>
                            )}
                        </div>
                        {exportError && (
                            <p
                                role="alert"
                                className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                            >
                                {exportError}
                            </p>
                        )}
                    </section>

                    {/* ── Card 2 — Delete your account ────────── */}
                    <section
                        aria-labelledby="delete-heading"
                        className="bg-white rounded-2xl border border-red-100 shadow-sm p-6"
                    >
                        <h2
                            id="delete-heading"
                            className="text-xl font-bold text-red-900"
                        >
                            Delete your account
                        </h2>
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                            Anonymise your account and revoke every active
                            session. Your personal information — name, email,
                            profile fields, WhatsApp number, ORCID, avatar —
                            is cleared. The editorial record itself
                            (submissions, published articles, peer-review
                            history) is retained for research integrity as
                            described in the Privacy Policy. This action is
                            irreversible.
                        </p>
                        <div className="mt-5">
                            <button
                                type="button"
                                onClick={openDeleteModal}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 transition shadow"
                            >
                                Delete my account
                            </button>
                        </div>
                    </section>
                </div>
            </main>
            <Footer />

            {/* ── Confirmation modal ────────────────────────── */}
            {modalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-modal-title"
                    className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60"
                    onClick={closeDeleteModal}
                >
                    <div
                        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {deleteSuccess ? (
                            <>
                                <h3
                                    id="delete-modal-title"
                                    className="text-lg font-bold text-emerald-800"
                                >
                                    Account anonymised
                                </h3>
                                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                                    {deleteSuccess}
                                </p>
                                <p className="mt-3 text-xs text-gray-500">
                                    Signing you out…
                                </p>
                            </>
                        ) : (
                            <>
                                <h3
                                    id="delete-modal-title"
                                    className="text-lg font-bold text-red-800"
                                >
                                    Confirm deletion
                                </h3>
                                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                                    Type your account email to confirm. This
                                    cannot be undone.
                                </p>
                                <p className="mt-3 text-xs text-gray-500 font-mono break-all">
                                    {userEmail || 'loading…'}
                                </p>
                                <label className="block mt-4 text-xs font-bold uppercase tracking-wide text-gray-700">
                                    Confirm email
                                    <input
                                        type="email"
                                        value={typedEmail}
                                        onChange={(e) =>
                                            setTypedEmail(e.target.value)
                                        }
                                        disabled={deleting}
                                        autoComplete="off"
                                        autoFocus
                                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                        placeholder="you@example.com"
                                    />
                                </label>
                                {deleteError && (
                                    <p
                                        role="alert"
                                        className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
                                    >
                                        {deleteError}
                                    </p>
                                )}
                                <div className="mt-5 flex flex-wrap gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={closeDeleteModal}
                                        disabled={deleting}
                                        className="rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 text-sm font-semibold px-4 py-2 disabled:opacity-60"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={!emailMatches || deleting}
                                        className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2"
                                    >
                                        {deleting
                                            ? 'Deleting…'
                                            : 'Permanently delete'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const PrivacyControlsPage: React.FC = () => (
    <ProtectedAuthorRoute>
        <PrivacyControlsInner />
    </ProtectedAuthorRoute>
);

export default PrivacyControlsPage;
