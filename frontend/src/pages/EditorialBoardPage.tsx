import React, { useEffect, useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import JournalLogo from '../components/common/JournalLogo';
import Loading from '../components/common/Loading';
import SEO from '../components/common/SEO';
import {
    BoardCategory,
    BoardMember,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    fetchBoardMembers,
} from '../api/board';

const HERO_VIDEO = 'https://videos.pexels.com/video-files/3255275/3255275-hd_1920_1080_25fps.mp4';
const HERO_FALLBACK =
    'https://images.unsplash.com/photo-1523050854058-8df90110c7f1?w=1920&h=600&fit=crop&q=80';

const initials = (name: string): string => {
    const parts = name.replace(/^(Prof\.?|Dr\.?|Mr\.?|Ms\.?)\s+/i, '').trim().split(/\s+/);
    if (parts.length === 0) return '§';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const parseList = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
};

const CATEGORY_ACCENT: Record<BoardCategory, string> = {
    editor_in_chief: 'from-amber-500 via-orange-500 to-rose-500',
    associate_editor: 'from-brand-500 via-indigo-500 to-purple-500',
    managing_editor: 'from-sky-500 via-cyan-500 to-teal-500',
    section_editor: 'from-emerald-500 via-teal-500 to-cyan-500',
    board_member: 'from-blue-500 via-indigo-500 to-violet-500',
    advisory: 'from-purple-500 via-fuchsia-500 to-pink-500',
    technical: 'from-slate-500 via-gray-500 to-neutral-600',
};

const CATEGORY_SUBTITLE: Record<BoardCategory, string> = {
    editor_in_chief: 'Sets the editorial direction of the journal.',
    associate_editor: 'Lead handling editors overseeing peer review.',
    managing_editor: 'Coordinates day-to-day editorial operations.',
    section_editor: 'Handle submissions within their subject area.',
    board_member: 'Provide topical expertise and shape the journal.',
    advisory: 'Long-serving advisors on strategy and standards.',
    technical: 'Production, typesetting, and platform engineering.',
};

/* ── One card ─────────────────────────────────────────── */

interface CardProps {
    member: BoardMember;
    variant: 'featured' | 'default' | 'compact';
}

const iconLink = (
    href: string,
    label: string,
    svg: React.ReactNode,
): React.ReactNode => (
    <a
        key={label}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={label}
        aria-label={label}
        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-brand-600 text-gray-600 hover:text-white flex items-center justify-center transition no-underline"
    >
        {svg}
    </a>
);

const ORCID_ICON = (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947 0 .525-.422.947-.947.947a.95.95 0 01-.947-.947c0-.516.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.016-5.325 5.016h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.019-2.484 4.019-3.722 0-2.016-1.284-3.722-4.088-3.722h-2.228z" />
    </svg>
);

const SCHOLAR_ICON = (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 100 14 7 7 0 000-14z" />
    </svg>
);

const SCOPUS_ICON = (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.97 17.106c-.79-1.02-1.94-1.5-2.99-1.99-1.02-.47-2.09-.94-2.63-1.75-.42-.62-.4-1.34.05-1.85.61-.7 1.65-.87 2.44-.48.65.31 1.16.87 1.44 1.55l1.02-.44c-.37-.91-1.06-1.64-1.93-2.05-1.16-.55-2.55-.36-3.5.5-.94.85-1.17 2.24-.55 3.34.54.96 1.5 1.51 2.44 1.98 1.32.65 2.65 1.32 3.02 2.4.28.83-.11 1.75-.9 2.13-.79.38-1.79.28-2.48-.24-.83-.6-1.19-1.66-.98-2.66l-1.11-.19c-.28 1.4.28 2.85 1.42 3.66 1.14.81 2.7.87 3.9.15 1.19-.71 1.79-2.2 1.34-3.55zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
    </svg>
);

const INSTITUTION_ICON = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
);

const EMAIL_ICON = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
);

const MemberCard: React.FC<CardProps> = ({ member, variant }) => {
    const accent = CATEGORY_ACCENT[member.category];
    const interests = parseList(member.expertise);
    const quals = parseList(member.qualifications);
    const links: React.ReactNode[] = [];
    if (member.orcid) {
        links.push(
            iconLink(
                member.orcid.startsWith('http')
                    ? member.orcid
                    : `https://orcid.org/${member.orcid}`,
                'ORCID',
                ORCID_ICON,
            ),
        );
    }
    if (member.scholar_url) links.push(iconLink(member.scholar_url, 'Google Scholar', SCHOLAR_ICON));
    if (member.scopus_id) {
        links.push(
            iconLink(
                member.scopus_id.startsWith('http')
                    ? member.scopus_id
                    : `https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(member.scopus_id)}`,
                'Scopus',
                SCOPUS_ICON,
            ),
        );
    }
    if (member.institutional_profile_url) {
        links.push(iconLink(member.institutional_profile_url, 'Institutional profile', INSTITUTION_ICON));
    }
    if (member.email) {
        links.push(iconLink(`mailto:${member.email}`, member.email, EMAIL_ICON));
    }

    if (variant === 'featured') {
        return (
            <div className="relative bg-white rounded-3xl border border-gray-100 shadow-2xl overflow-hidden">
                <div className={`h-2 bg-gradient-to-r ${accent}`} />
                <div className="grid md:grid-cols-3 gap-0">
                    <div className={`md:col-span-1 p-8 flex items-center justify-center bg-gradient-to-br ${accent} relative overflow-hidden`}>
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white blur-3xl" />
                        </div>
                        <div className="relative w-40 h-40 rounded-full border-4 border-white/40 bg-white/20 backdrop-blur-sm shadow-2xl overflow-hidden flex items-center justify-center">
                            {member.photo_url ? (
                                <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                                <span className="text-6xl font-black text-white">{initials(member.name)}</span>
                            )}
                        </div>
                    </div>
                    <div className="md:col-span-2 p-8">
                        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
                            {member.role}
                        </span>
                        <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
                            {member.name}
                        </h3>
                        <p className="mt-2 text-gray-700">
                            {[member.department, member.affiliation].filter(Boolean).join(' · ')}
                        </p>
                        {member.country && (
                            <p className="text-sm text-gray-500">📍 {member.country}</p>
                        )}
                        {quals.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                                    Qualifications
                                </p>
                                <ul className="space-y-0.5 text-sm text-gray-700">
                                    {quals.map((q, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <span className="text-brand-600">▸</span>
                                            {q}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {interests.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                                    Research interests
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {interests.map((tag, i) => (
                                        <span
                                            key={i}
                                            className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full font-medium"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {member.bio && (
                            <p className="mt-4 text-sm text-gray-600 leading-relaxed">{member.bio}</p>
                        )}
                        {links.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-2">{links}</div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (variant === 'compact') {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${accent}`}>
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <span className="text-lg font-bold text-white">{initials(member.name)}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-gray-900 truncate">{member.name}</h4>
                        <p className="text-xs text-brand-700 font-semibold truncate">{member.role}</p>
                        <p className="text-xs text-gray-500 truncate">
                            {[member.department, member.affiliation].filter(Boolean).join(' · ')}
                            {member.country ? ` · ${member.country}` : ''}
                        </p>
                    </div>
                </div>
                {(interests.length > 0 || links.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1 min-w-0">
                            {interests.slice(0, 2).map((tag, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded truncate">
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">{links.slice(0, 3)}</div>
                    </div>
                )}
            </div>
        );
    }

    // default
    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
            <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
            <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start gap-4">
                    <div className={`w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${accent} shadow-md`}>
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <span className="text-2xl font-black text-white">{initials(member.name)}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                            {member.role}
                        </span>
                        <h3 className="text-lg font-extrabold text-gray-900 mt-0.5 leading-tight">
                            {member.name}
                        </h3>
                        {member.country && (
                            <p className="text-xs text-gray-500 mt-1">📍 {member.country}</p>
                        )}
                    </div>
                </div>

                <div className="mt-4 text-sm text-gray-700">
                    {member.department && <p className="font-medium">{member.department}</p>}
                    {member.affiliation && <p className="text-gray-600">{member.affiliation}</p>}
                </div>

                {quals.length > 0 && (
                    <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            Qualifications
                        </p>
                        <p className="text-xs text-gray-600 line-clamp-2">{quals.join(' · ')}</p>
                    </div>
                )}

                {interests.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                        {interests.slice(0, 4).map((tag, i) => (
                            <span
                                key={i}
                                className="text-[11px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                        {interests.length > 4 && (
                            <span className="text-[11px] px-2 py-0.5 text-gray-400">
                                +{interests.length - 4}
                            </span>
                        )}
                    </div>
                )}

                {links.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">{links}</div>
                )}
            </div>
        </div>
    );
};

/* ── Page ─────────────────────────────────────────────── */

const EditorialBoardPage: React.FC = () => {
    const [members, setMembers] = useState<BoardMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetchBoardMembers()
            .then((data) => {
                if (!cancelled) setMembers(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.response?.data?.detail || err?.message || 'Failed to load editorial board.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.src = HERO_VIDEO;
        v.load();
    }, []);

    const grouped = useMemo(() => {
        const map: Record<BoardCategory, BoardMember[]> = {
            editor_in_chief: [],
            associate_editor: [],
            managing_editor: [],
            section_editor: [],
            board_member: [],
            advisory: [],
            technical: [],
        };
        for (const m of members) {
            (map[m.category] || map.board_member).push(m);
        }
        for (const key of Object.keys(map) as BoardCategory[]) {
            map[key].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        }
        return map;
    }, [members]);

    const totalMembers = members.length;
    const countries = useMemo(() => {
        const set = new Set<string>();
        for (const m of members) if (m.country) set.add(m.country);
        return set.size;
    }, [members]);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <SEO
                title="Editorial Board — JGAIR"
                description="Meet the international editorial board of the Journal of Generative and Applied Intelligence Research — the scholars overseeing peer review and publication of every article."
                canonical={
                    typeof window !== 'undefined'
                        ? `${window.location.origin}/editorial-board`
                        : undefined
                }
                type="website"
            />
            <Header />

            {/* Hero */}
            <section className="relative h-[380px] lg:h-[440px] flex items-center overflow-hidden">
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    onCanPlayThrough={() => setVideoReady(true)}
                    style={{ opacity: videoReady ? 1 : 0, transition: 'opacity 1.2s ease-in' }}
                />
                <img
                    src={HERO_FALLBACK}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: videoReady ? 0 : 1, transition: 'opacity 1.2s' }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-950/90 via-brand-950/75 to-brand-900/60" />
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-block mb-5">
                        <JournalLogo variant="compact" dark />
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">
                        Editorial Board
                    </h1>
                    <p className="mt-4 text-lg text-brand-200 max-w-2xl mx-auto font-light">
                        A diverse, international team of scholars overseeing the peer-review and publication of every article.
                    </p>
                    {totalMembers > 0 && (
                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-semibold">
                                👥 {totalMembers} Members
                            </span>
                            {countries > 0 && (
                                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-semibold">
                                    🌍 {countries} Countries
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <main className="flex-1 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-8 text-center text-red-600">
                            {error}
                        </div>
                    ) : totalMembers === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                            <span className="text-4xl block mb-3">🧑‍🎓</span>
                            <h2 className="text-xl font-bold text-gray-900">Board is being finalised</h2>
                            <p className="mt-2 text-gray-500 max-w-lg mx-auto">
                                The editorial board is being confirmed and will be published here shortly.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-16">
                            {CATEGORY_ORDER.map((category) => {
                                const list = grouped[category];
                                if (list.length === 0) return null;

                                // Featured layout for EiC and single Managing Editor.
                                const isSolo =
                                    (category === 'editor_in_chief' || category === 'managing_editor') &&
                                    list.length === 1;
                                const isCompact = category === 'technical' || category === 'advisory';

                                return (
                                    <section key={category}>
                                        <div className="text-center mb-10">
                                            <span className="text-brand-600 text-sm font-bold uppercase tracking-wider">
                                                {CATEGORY_LABELS[category]}
                                            </span>
                                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2 tracking-tight">
                                                {CATEGORY_LABELS[category]}
                                            </h2>
                                            <p className="mt-2 text-gray-500 max-w-2xl mx-auto text-sm">
                                                {CATEGORY_SUBTITLE[category]}
                                            </p>
                                        </div>

                                        {isSolo ? (
                                            <MemberCard member={list[0]} variant="featured" />
                                        ) : isCompact ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {list.map((m) => (
                                                    <MemberCard key={m.id} member={m} variant="compact" />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {list.map((m) => (
                                                    <MemberCard key={m.id} member={m} variant="default" />
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}

                    {/* Join the board CTA */}
                    <section className="mt-20 relative overflow-hidden rounded-3xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950" />
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-500 blur-3xl" />
                            <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-purple-500 blur-3xl" />
                        </div>
                        <div className="relative p-10 lg:p-16 text-center">
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                                Join the Editorial Board
                            </h2>
                            <p className="mt-4 text-brand-200 max-w-2xl mx-auto">
                                We welcome nominations from active researchers with a strong publication record and a
                                commitment to open, ethical scholarship. Reach out to the editorial office to be considered.
                            </p>
                            <a
                                href="/contact"
                                className="mt-8 inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-900 font-bold rounded-2xl hover:bg-gray-100 transition shadow-2xl no-underline"
                            >
                                Contact the Editorial Office →
                            </a>
                        </div>
                    </section>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default EditorialBoardPage;
