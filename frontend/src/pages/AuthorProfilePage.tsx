import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import { AuthorPublicProfile, fetchAuthorProfile } from '../api/authors';

const initialsOf = (name: string): string =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'AU';

const excerpt = (text: string | null | undefined, maxChars = 220): string => {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length <= maxChars ? clean : clean.slice(0, maxChars).trimEnd() + '…';
};

const AuthorProfilePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [profile, setProfile] = useState<AuthorPublicProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchAuthorProfile(id)
            .then((data) => {
                if (!cancelled) setProfile(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    if (err?.response?.status === 404) {
                        setError('This author profile was not found.');
                    } else {
                        setError(err?.message || 'Failed to load author profile.');
                    }
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    const displayName = profile?.full_name || profile?.username || 'Author';
    const researchAreas = (profile?.research_areas || '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={profile ? `${displayName} · Author profile` : 'Author profile'}
                description={
                    profile
                        ? `Published works by ${displayName}${profile.institution ? ' at ' + profile.institution : ''}.`
                        : 'Public profile of a contributing author.'
                }
            />
            <Header />

            {loading ? (
                <main className="flex-1"><Loading /></main>
            ) : error || !profile ? (
                <main className="flex-1 flex items-center justify-center px-4">
                    <div className="bg-white border border-red-100 rounded-2xl p-12 text-center max-w-md">
                        <span className="text-4xl block mb-3">👤</span>
                        <h1 className="text-lg font-bold text-gray-900">
                            {error || 'Author not available.'}
                        </h1>
                        <Link
                            to="/articles"
                            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            Browse articles →
                        </Link>
                    </div>
                </main>
            ) : (
                <>
                    {/* Cover header */}
                    <section className="relative py-20 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                            <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-purple-500 blur-3xl" />
                        </div>
                        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center sm:items-end gap-6">
                            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-brand-400 to-indigo-500 text-white flex items-center justify-center text-4xl font-black shadow-2xl ring-4 ring-white/20">
                                {initialsOf(displayName)}
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                                    {displayName}
                                </h1>
                                <div className="mt-2 flex flex-wrap justify-center sm:justify-start items-center gap-3 text-brand-200 text-sm">
                                    {profile.institution && <span>🏛 {profile.institution}</span>}
                                    {profile.department && <span>· {profile.department}</span>}
                                    {profile.country && <span>· 🌍 {profile.country}</span>}
                                </div>
                                {profile.orcid && (
                                    <a
                                        href={`https://orcid.org/${profile.orcid}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-white text-xs font-bold hover:bg-white/20 transition no-underline"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="inline-block w-4 h-4 rounded-full bg-[#a6ce39] text-white text-[10px] font-black flex items-center justify-center"
                                        >
                                            iD
                                        </span>
                                        ORCID · {profile.orcid}
                                    </a>
                                )}
                            </div>
                        </div>
                    </section>

                    <main className="flex-1 py-16">
                        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                            {/* Sidebar */}
                            <aside className="space-y-6">
                                {profile.bio && (
                                    <section className="bg-white rounded-2xl border border-gray-100 p-6">
                                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-2">
                                            Biography
                                        </h3>
                                        <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                                            {profile.bio}
                                        </p>
                                    </section>
                                )}
                                {researchAreas.length > 0 && (
                                    <section className="bg-white rounded-2xl border border-gray-100 p-6">
                                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">
                                            Research areas
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {researchAreas.map((area) => (
                                                <span
                                                    key={area}
                                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-800 border border-brand-100"
                                                >
                                                    {area}
                                                </span>
                                            ))}
                                        </div>
                                    </section>
                                )}
                                <section className="bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-100 rounded-2xl p-6">
                                    <h3 className="text-sm font-bold text-brand-800 uppercase tracking-wider mb-1">
                                        Publications
                                    </h3>
                                    <p className="text-3xl font-black text-brand-900">{profile.articles.length}</p>
                                    <p className="text-xs text-brand-700 mt-1">Article{profile.articles.length === 1 ? '' : 's'} in the archive</p>
                                </section>
                            </aside>

                            {/* Article list */}
                            <section className="lg:col-span-2">
                                <h2 className="text-lg font-extrabold text-gray-900 mb-4">
                                    Published articles
                                </h2>
                                {profile.articles.length === 0 ? (
                                    <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                                        <span className="text-4xl block mb-3">📄</span>
                                        <p className="text-gray-500">
                                            No articles are attributed to this author yet.
                                        </p>
                                    </div>
                                ) : (
                                    <ul className="space-y-4">
                                        {profile.articles.map((a) => (
                                            <li
                                                key={a.id}
                                                className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300"
                                            >
                                                <div className="h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500" />
                                                <Link
                                                    to={`/articles/${a.id}`}
                                                    className="block p-6 no-underline"
                                                >
                                                    <h3 className="text-lg font-extrabold text-gray-900 group-hover:text-brand-700 transition">
                                                        {a.title}
                                                    </h3>
                                                    {a.abstract && (
                                                        <p className="mt-2 text-gray-700 leading-relaxed">
                                                            {excerpt(a.abstract)}
                                                        </p>
                                                    )}
                                                    <p className="mt-3 text-sm font-bold text-brand-700 group-hover:text-brand-800">
                                                        Read article →
                                                    </p>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>
                    </main>
                </>
            )}

            <Footer />
        </div>
    );
};

export default AuthorProfilePage;
