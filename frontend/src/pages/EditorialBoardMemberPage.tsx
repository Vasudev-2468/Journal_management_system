import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import {
    BoardCategory,
    BoardMember,
    CATEGORY_LABELS,
    fetchBoardMember,
} from '../api/board';

// Public /editorial-board/:memberId page — one board member at full length.
// Photo, name, affiliation, qualifications, research interests and a
// Contact card mirroring the icons on EditorialBoardPage.

const CATEGORY_ACCENT: Record<BoardCategory, string> = {
    editor_in_chief: 'from-amber-500 via-orange-500 to-rose-500',
    associate_editor: 'from-brand-500 via-indigo-500 to-purple-500',
    managing_editor: 'from-sky-500 via-cyan-500 to-teal-500',
    section_editor: 'from-emerald-500 via-teal-500 to-cyan-500',
    board_member: 'from-blue-500 via-indigo-500 to-violet-500',
    advisory: 'from-purple-500 via-fuchsia-500 to-pink-500',
    technical: 'from-slate-500 via-gray-500 to-neutral-600',
};

const initials = (name: string): string => {
    const parts = name.replace(/^(Prof\.?|Dr\.?|Mr\.?|Ms\.?)\s+/i, '').trim().split(/\s+/);
    if (parts.length === 0) return '§';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const parseBullets = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw
        .split(/[\n\r]+/)
        .map((s) => s.replace(/^[\s\-•▸·*]+/, '').trim())
        .filter(Boolean);
};

const parseTags = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
};

const orcidHref = (orcid: string): string =>
    orcid.startsWith('http') ? orcid : `https://orcid.org/${orcid}`;

const scopusHref = (scopus: string): string =>
    scopus.startsWith('http')
        ? scopus
        : `https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(scopus)}`;

const ORCID_ICON = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947 0 .525-.422.947-.947.947a.95.95 0 01-.947-.947c0-.516.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.019-2.484 4.019-3.722 0-2.016-1.284-3.722-4.088-3.722h-2.228z" />
    </svg>
);

const SCHOLAR_ICON = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 100 14 7 7 0 000-14z" />
    </svg>
);

const SCOPUS_ICON = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14.97 17.106c-.79-1.02-1.94-1.5-2.99-1.99-1.02-.47-2.09-.94-2.63-1.75-.42-.62-.4-1.34.05-1.85.61-.7 1.65-.87 2.44-.48.65.31 1.16.87 1.44 1.55l1.02-.44c-.37-.91-1.06-1.64-1.93-2.05-1.16-.55-2.55-.36-3.5.5-.94.85-1.17 2.24-.55 3.34.54.96 1.5 1.51 2.44 1.98 1.32.65 2.65 1.32 3.02 2.4.28.83-.11 1.75-.9 2.13-.79.38-1.79.28-2.48-.24-.83-.6-1.19-1.66-.98-2.66l-1.11-.19c-.28 1.4.28 2.85 1.42 3.66 1.14.81 2.7.87 3.9.15 1.19-.71 1.79-2.2 1.34-3.55zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
);

const INSTITUTION_ICON = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
);

const EMAIL_ICON = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
);

interface ContactRowProps {
    href: string;
    label: string;
    value: string;
    icon: React.ReactNode;
}

const ContactRow: React.FC<ContactRowProps> = ({ href, label, value, icon }) => (
    <a
        href={href}
        target={href.startsWith('mailto:') ? undefined : '_blank'}
        rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition group no-underline"
    >
        <span className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-600 group-hover:text-white flex items-center justify-center flex-shrink-0 transition">
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {label}
            </span>
            <span className="block text-sm text-gray-900 font-medium truncate">
                {value}
            </span>
        </span>
    </a>
);

const EditorialBoardMemberPage: React.FC = () => {
    const { memberId } = useParams<{ memberId: string }>();
    const [member, setMember] = useState<BoardMember | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!memberId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchBoardMember(memberId)
            .then((data) => {
                if (!cancelled) setMember(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    if (err?.response?.status === 404) {
                        setError('This editorial board member could not be found.');
                    } else {
                        setError(
                            err?.response?.data?.detail ||
                                err?.message ||
                                'Failed to load member profile.',
                        );
                    }
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [memberId]);

    const accent = member ? CATEGORY_ACCENT[member.category] : CATEGORY_ACCENT.board_member;
    const categoryLabel = member ? CATEGORY_LABELS[member.category] : '';
    const qualifications = parseBullets(member?.qualifications);
    const interests = parseTags(member?.expertise);

    const contacts: React.ReactNode[] = [];
    if (member?.email) {
        contacts.push(
            <ContactRow
                key="email"
                href={`mailto:${member.email}`}
                label="Email"
                value={member.email}
                icon={EMAIL_ICON}
            />,
        );
    }
    if (member?.orcid) {
        contacts.push(
            <ContactRow
                key="orcid"
                href={orcidHref(member.orcid)}
                label="ORCID"
                value={member.orcid}
                icon={ORCID_ICON}
            />,
        );
    }
    if (member?.scholar_url) {
        contacts.push(
            <ContactRow
                key="scholar"
                href={member.scholar_url}
                label="Google Scholar"
                value="View publications"
                icon={SCHOLAR_ICON}
            />,
        );
    }
    if (member?.scopus_id) {
        contacts.push(
            <ContactRow
                key="scopus"
                href={scopusHref(member.scopus_id)}
                label="Scopus"
                value={member.scopus_id}
                icon={SCOPUS_ICON}
            />,
        );
    }
    if (member?.institutional_profile_url) {
        contacts.push(
            <ContactRow
                key="inst"
                href={member.institutional_profile_url}
                label="Institutional profile"
                value="Visit page"
                icon={INSTITUTION_ICON}
            />,
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title={member ? `${member.name} — Editorial Board` : 'Editorial Board member'}
                description={
                    member
                        ? `${member.role}${member.affiliation ? ' · ' + member.affiliation : ''}`
                        : 'Public profile of an editorial board member.'
                }
                canonical={
                    typeof window !== 'undefined' && memberId
                        ? `${window.location.origin}/editorial-board/${memberId}`
                        : undefined
                }
                type="website"
            />
            <Header />

            {loading ? (
                <main className="flex-1"><Loading /></main>
            ) : error || !member ? (
                <main className="flex-1 flex items-center justify-center px-4 py-16">
                    <div className="bg-white border border-red-100 rounded-2xl p-12 text-center max-w-md">
                        <span className="text-4xl block mb-3">🧑‍🎓</span>
                        <h1 className="text-lg font-bold text-gray-900">
                            {error || 'Member not available.'}
                        </h1>
                        <Link
                            to="/editorial-board"
                            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition no-underline"
                        >
                            ← Back to Editorial Board
                        </Link>
                    </div>
                </main>
            ) : (
                <>
                    {/* Hero band */}
                    <section className={`relative overflow-hidden bg-gradient-to-br ${accent}`}>
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-white blur-3xl" />
                            <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-white/60 blur-3xl" />
                        </div>
                        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 flex flex-col sm:flex-row items-center sm:items-end gap-8">
                            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden bg-white/20 backdrop-blur border-4 border-white/60 shadow-2xl flex items-center justify-center flex-shrink-0">
                                {member.photo_url ? (
                                    <img
                                        src={member.photo_url}
                                        alt={member.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-6xl font-black text-white">
                                        {initials(member.name)}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                {categoryLabel && (
                                    <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-white/90 bg-white/15 border border-white/25 rounded-full px-3 py-1">
                                        {categoryLabel}
                                    </span>
                                )}
                                <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow">
                                    {member.name}
                                </h1>
                                <p className="mt-2 text-white/90 text-lg font-semibold">
                                    {member.role}
                                </p>
                                <p className="mt-2 text-white/80 text-sm">
                                    {[member.department, member.affiliation, member.country]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            </div>
                        </div>
                    </section>

                    <main className="flex-1 py-12">
                        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                            <Link
                                to="/editorial-board"
                                className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900 no-underline"
                            >
                                ← Back to Editorial Board
                            </Link>

                            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-8">
                                    {member.bio && (
                                        <section className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
                                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                                                Biography
                                            </h2>
                                            <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                                                {member.bio}
                                            </p>
                                        </section>
                                    )}

                                    {qualifications.length > 0 && (
                                        <section className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
                                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                                                Qualifications
                                            </h2>
                                            <ul className="space-y-2 text-gray-800">
                                                {qualifications.map((q, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="text-brand-600 mt-0.5">▸</span>
                                                        <span className="leading-relaxed">{q}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {interests.length > 0 && (
                                        <section className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
                                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                                                Research interests
                                            </h2>
                                            <div className="flex flex-wrap gap-2">
                                                {interests.map((tag, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-sm px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-100 rounded-full font-semibold"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {!member.bio &&
                                        qualifications.length === 0 &&
                                        interests.length === 0 && (
                                            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
                                                No further biography or research interests have been published for this member yet.
                                            </div>
                                        )}
                                </div>

                                <aside className="space-y-4">
                                    <section
                                        aria-labelledby="contact-heading"
                                        className="bg-gray-50 border border-gray-100 rounded-2xl p-5"
                                    >
                                        <h2
                                            id="contact-heading"
                                            className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3"
                                        >
                                            Contact
                                        </h2>
                                        {contacts.length > 0 ? (
                                            <div className="space-y-2">{contacts}</div>
                                        ) : (
                                            <p className="text-sm text-gray-500">
                                                No public contact details have been provided.
                                            </p>
                                        )}
                                    </section>
                                </aside>
                            </div>
                        </div>
                    </main>
                </>
            )}

            <Footer />
        </div>
    );
};

export default EditorialBoardMemberPage;
