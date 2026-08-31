import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import {
    AuthorProfile,
    getProfile,
    removePicture,
    uploadPicture,
} from '../api/authorProfile';

// Public /author-profile page — mounted behind ProtectedAuthorRoute by App.tsx.
// The route wrapper already verifies the author_token before rendering, so the
// page can assume it holds a valid session and simply call the /author-auth/me
// endpoint to fetch the current user's profile.

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const initialsOf = (name: string | null | undefined, fallback: string): string => {
    const src = (name || fallback || '').trim();
    if (!src) return 'AU';
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const errorMessage = (err: unknown, fallback: string): string => {
    const anyErr = err as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = anyErr?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    if (anyErr?.message) return anyErr.message;
    return fallback;
};

const AuthorProfileEditPage: React.FC = () => {
    const [profile, setProfile] = useState<AuthorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async () => {
        const data = await getProfile();
        setProfile(data);
        return data;
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getProfile()
            .then((data) => {
                if (!cancelled) setProfile(data);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'Failed to load your profile.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const displayName = useMemo(
        () => profile?.full_name || profile?.username || 'Author',
        [profile],
    );

    const handlePick = () => {
        if (busy) return;
        setActionError(null);
        setNotice(null);
        fileInputRef.current?.click();
    };

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Reset the input so re-picking the same file still fires onChange.
        event.target.value = '';
        if (!file) return;

        if (!ALLOWED_TYPES.has(file.type)) {
            setActionError('Please choose a JPEG, PNG, or WebP image.');
            return;
        }
        if (file.size > MAX_BYTES) {
            setActionError('That image is larger than 5 MB. Please choose a smaller file.');
            return;
        }

        setBusy('upload');
        setActionError(null);
        setNotice(null);
        try {
            await uploadPicture(file);
            await refresh();
            setNotice('Profile picture updated.');
        } catch (err) {
            setActionError(errorMessage(err, 'Upload failed. Please try again.'));
        } finally {
            setBusy(null);
        }
    };

    const handleRemove = async () => {
        if (busy || !profile?.profile_picture_url) return;
        const ok = window.confirm('Remove your profile picture?');
        if (!ok) return;
        setBusy('remove');
        setActionError(null);
        setNotice(null);
        try {
            await removePicture();
            await refresh();
            setNotice('Profile picture removed.');
        } catch (err) {
            setActionError(errorMessage(err, 'Failed to remove the picture.'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title="Your author profile"
                description="Update your author profile picture and view the account details on file."
            />
            <Header />

            <main className="flex-1 py-12">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="mb-8">
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                            Your profile
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Manage the photo shown on your author profile and review the details on file.
                        </p>
                    </div>

                    {loading ? (
                        <Loading />
                    ) : error || !profile ? (
                        <div
                            role="alert"
                            className="bg-white rounded-2xl border border-red-200 p-8 text-center text-red-700"
                        >
                            {error || 'Profile unavailable.'}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="h-2 bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500" />
                            <div className="p-6 sm:p-10">
                                <div className="flex flex-col items-center text-center">
                                    <div className="relative">
                                        {profile.profile_picture_url ? (
                                            <img
                                                src={profile.profile_picture_url}
                                                alt={displayName}
                                                className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-lg ring-1 ring-gray-200"
                                            />
                                        ) : (
                                            <div
                                                aria-label={`${displayName} initials`}
                                                className="w-40 h-40 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-white flex items-center justify-center text-5xl font-black shadow-lg ring-4 ring-white"
                                            >
                                                {initialsOf(profile.full_name, profile.username)}
                                            </div>
                                        )}
                                        {busy && (
                                            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                                                <span className="text-white text-xs font-bold uppercase tracking-wider">
                                                    {busy === 'upload' ? 'Uploading…' : 'Removing…'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={handleFile}
                                        />
                                        <button
                                            type="button"
                                            onClick={handlePick}
                                            disabled={busy !== null}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                                        >
                                            {profile.profile_picture_url ? 'Replace photo' : 'Upload photo'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRemove}
                                            disabled={busy !== null || !profile.profile_picture_url}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-800 font-bold text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            Remove photo
                                        </button>
                                    </div>

                                    <p className="mt-3 text-xs text-gray-500">
                                        JPEG, PNG, or WebP — up to 5 MB.
                                    </p>

                                    {actionError && (
                                        <div
                                            role="alert"
                                            className="mt-4 w-full max-w-md rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-2"
                                        >
                                            {actionError}
                                        </div>
                                    )}
                                    {notice && !actionError && (
                                        <div
                                            role="status"
                                            className="mt-4 w-full max-w-md rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm px-4 py-2"
                                        >
                                            {notice}
                                        </div>
                                    )}
                                </div>

                                <hr className="my-8 border-gray-100" />

                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Full name
                                        </dt>
                                        <dd className="mt-1 text-gray-900 font-medium break-words">
                                            {profile.full_name || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Email
                                        </dt>
                                        <dd className="mt-1 text-gray-900 font-medium break-all">
                                            {profile.email || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Institution
                                        </dt>
                                        <dd className="mt-1 text-gray-900 font-medium break-words">
                                            {profile.institution || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Country
                                        </dt>
                                        <dd className="mt-1 text-gray-900 font-medium break-words">
                                            {profile.country || '—'}
                                        </dd>
                                    </div>
                                </dl>

                                <p className="mt-6 text-xs text-gray-500">
                                    These details are read-only here. Update them from your author dashboard.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default AuthorProfileEditPage;
