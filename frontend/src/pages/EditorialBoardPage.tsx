import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

/*  Editorial Board — public marketing page.
 *
 *  Layout:
 *    1. Animated video hero with logo, blurb, and live stats (members,
 *       countries, expertise areas, editorial years).
 *    2. Sticky category jump-nav — pills labelled by category name +
 *       member count. Click to smooth-scroll to that section.
 *    3. Search + category filter bar (also sticky) — instant client-side
 *       filter across name, role, department, affiliation, country,
 *       expertise, keywords.
 *    4. Editor-in-Chief spotlight — full-bleed feature card.
 *    5. Every other category rendered as a grid of MemberCards.
 *    6. Expertise cloud aggregating the top tags across the whole board.
 *    7. "Join the board" CTA.
 */

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
    return raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
};

const CATEGORY_ACCENT: Record<BoardCategory, string> = {
    editor_in_chief:  'from-amber-500 via-orange-500 to-rose-500',
    associate_editor: 'from-brand-500 via-indigo-500 to-purple-500',
    managing_editor:  'from-sky-500 via-cyan-500 to-teal-500',
    section_editor:   'from-emerald-500 via-teal-500 to-cyan-500',
    board_member:     'from-blue-500 via-indigo-500 to-violet-500',
    advisory:         'from-purple-500 via-fuchsia-500 to-pink-500',
    technical:        'from-slate-500 via-gray-500 to-neutral-600',
};

const CATEGORY_SUBTITLE: Record<BoardCategory, string> = {
    editor_in_chief:  'Sets the editorial direction and vouches for every accepted paper.',
    associate_editor: 'Lead handling editors overseeing peer review across the journal.',
    managing_editor:  'Coordinates day-to-day editorial operations and production.',
    section_editor:   'Own submissions inside their subject area.',
    board_member:     'Provide topical expertise and shape the scope of the journal.',
    advisory:         'Long-serving advisors on strategy, ethics, and standards.',
    technical:        'Production, typesetting, and platform engineering.',
};

const CATEGORY_ICON: Record<BoardCategory, string> = {
    editor_in_chief:  '👑',
    associate_editor: '🎓',
    managing_editor:  '🛠',
    section_editor:   '📚',
    board_member:     '👥',
    advisory:         '🕊',
    technical:        '⚙',
};

/* ── Iconography — kept inline so a build without heroicons still ships ── */

const iconLink = (href: string, label: string, svg: React.ReactNode): React.ReactNode => (
    <a
        key={label} href={href} target="_blank" rel="noreferrer"
        title={label} aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="w-8 h-8 rounded-lg bg-white/70 backdrop-blur-sm hover:bg-brand-600 text-gray-600 hover:text-white flex items-center justify-center transition no-underline border border-gray-200 hover:border-brand-600"
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
const SEARCH_ICON = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
    </svg>
);

/* ── Member card — three variants (spotlight / default / compact) ─────── */

interface CardProps { member: BoardMember; variant: 'spotlight' | 'default' | 'compact'; }

const collectLinks = (member: BoardMember): React.ReactNode[] => {
    const links: React.ReactNode[] = [];
    if (member.orcid) {
        links.push(iconLink(
            member.orcid.startsWith('http') ? member.orcid : `https://orcid.org/${member.orcid}`,
            'ORCID', ORCID_ICON,
        ));
    }
    if (member.scholar_url) links.push(iconLink(member.scholar_url, 'Google Scholar', SCHOLAR_ICON));
    if (member.scopus_id) {
        links.push(iconLink(
            member.scopus_id.startsWith('http')
                ? member.scopus_id
                : `https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(member.scopus_id)}`,
            'Scopus', SCOPUS_ICON,
        ));
    }
    if (member.institutional_profile_url) {
        links.push(iconLink(member.institutional_profile_url, 'Institutional profile', INSTITUTION_ICON));
    }
    if (member.email) links.push(iconLink(`mailto:${member.email}`, member.email, EMAIL_ICON));
    return links;
};

const MemberCard: React.FC<CardProps> = ({ member, variant }) => {
    const accent = CATEGORY_ACCENT[member.category];
    const interests = parseList(member.expertise);
    const quals = parseList(member.qualifications);
    const links = collectLinks(member);

    if (variant === 'spotlight') {
        return (
            <div className="group relative bg-white rounded-[2rem] border border-gray-100 shadow-2xl overflow-hidden">
                <div className={`h-2 bg-gradient-to-r ${accent}`} />
                <div className="grid md:grid-cols-5 gap-0">
                    {/* Portrait column */}
                    <div className={`md:col-span-2 p-10 flex items-center justify-center bg-gradient-to-br ${accent} relative overflow-hidden`}>
                        {/* Decorative blur blobs */}
                        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute -bottom-20 -left-16 w-72 h-72 rounded-full bg-black/10 blur-3xl" />
                        <div className="relative w-56 h-56 rounded-full overflow-hidden ring-8 ring-white/30 shadow-2xl">
                            {member.photo_url ? (
                                <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-white/20 backdrop-blur-sm text-5xl font-black text-white">
                                    {initials(member.name)}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Content column */}
                    <div className="md:col-span-3 p-10">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest text-white bg-gradient-to-r ${accent} shadow-sm`}>
                                <span>{CATEGORY_ICON[member.category]}</span>
                                {CATEGORY_LABELS[member.category]}
                            </span>
                            {member.years_editorial_experience ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-600 bg-gray-100 border border-gray-200">
                                    {member.years_editorial_experience}+ yrs editorial
                                </span>
                            ) : null}
                        </div>
                        <h2 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">{member.name}</h2>
                        <p className="mt-1 text-lg text-brand-700 font-semibold">{member.role}</p>
                        {(member.department || member.affiliation) && (
                            <p className="mt-3 text-sm text-gray-700">
                                {[member.department, member.affiliation].filter(Boolean).join(' · ')}
                                {member.country ? ` · ${member.country}` : ''}
                            </p>
                        )}
                        {quals.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Qualifications</p>
                                <p className="text-sm text-gray-700">{quals.join(' · ')}</p>
                            </div>
                        )}
                        {interests.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Research Interests</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {interests.slice(0, 8).map((t, i) => (
                                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-800 font-medium border border-brand-100">{t}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {member.bio && (
                            <p className="mt-5 text-sm text-gray-600 leading-relaxed italic border-l-2 border-brand-200 pl-4">
                                “{member.bio}”
                            </p>
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
            <div className="group bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-lg hover:-translate-y-1 hover:border-brand-200 transition-all duration-300">
                <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${accent} shadow-md`}>
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <span className="text-base font-black text-white">{initials(member.name)}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-gray-900 truncate group-hover:text-brand-700 transition">{member.name}</h4>
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
                                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded truncate">{tag}</span>
                            ))}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">{links.slice(0, 3)}</div>
                    </div>
                )}
            </div>
        );
    }

    /* default variant */
    return (
        <div className="group relative bg-white rounded-3xl border border-gray-100 overflow-hidden hover:shadow-2xl hover:-translate-y-1 hover:border-brand-200 transition-all duration-300 flex flex-col">
            {/* Category ribbon */}
            <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
            {/* Decorative accent behind avatar */}
            <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${accent} opacity-5 rounded-full blur-3xl pointer-events-none`} />
            <div className="p-6 flex flex-col flex-1 relative">
                <div className="flex items-start gap-4">
                    <div className={`w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${accent} shadow-md ring-4 ring-white`}>
                        {member.photo_url ? (
                            <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <span className="text-2xl font-black text-white">{initials(member.name)}</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-600">{member.role}</span>
                        <h3 className="text-lg font-extrabold text-gray-900 mt-0.5 leading-tight group-hover:text-brand-700 transition">
                            {member.name}
                        </h3>
                        {member.country && (
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <span aria-hidden>📍</span>{member.country}
                            </p>
                        )}
                    </div>
                </div>
                <div className="mt-4 text-sm text-gray-700">
                    {member.department && <p className="font-medium">{member.department}</p>}
                    {member.affiliation && <p className="text-gray-600">{member.affiliation}</p>}
                </div>
                {quals.length > 0 && (
                    <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Qualifications</p>
                        <p className="text-xs text-gray-600 line-clamp-2">{quals.join(' · ')}</p>
                    </div>
                )}
                {interests.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                        {interests.slice(0, 4).map((tag, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-medium border border-brand-100">
                                {tag}
                            </span>
                        ))}
                        {interests.length > 4 && (
                            <span className="text-[11px] px-2 py-0.5 text-gray-400">+{interests.length - 4}</span>
                        )}
                    </div>
                )}
                {links.length > 0 && (
                    <div className="mt-auto pt-5 flex flex-wrap gap-2">{links}</div>
                )}
            </div>
        </div>
    );
};

/* ── Stat pill for the hero ─────────────────────────────────────────── */

const StatPill: React.FC<{ icon: string; value: number; label: string }> = ({ icon, value, label }) => (
    <div className="inline-flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl shadow-lg">
        <span className="text-2xl leading-none">{icon}</span>
        <div className="text-left">
            <div className="text-2xl font-black leading-none">{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-brand-200">{label}</div>
        </div>
    </div>
);

/* ── Page ───────────────────────────────────────────────────────────── */

const EditorialBoardPage: React.FC = () => {
    const [members, setMembers] = useState<BoardMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<BoardCategory | 'all'>('all');
    const videoRef = React.useRef<HTMLVideoElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetchBoardMembers()
            .then((data) => { if (!cancelled) setMembers(data); })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.response?.data?.detail || err?.message || 'Failed to load editorial board.');
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        v.src = HERO_VIDEO;
        v.load();
    }, []);

    /* Client-side filter — instant search across the sensible fields. */
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return members.filter((m) => {
            if (activeCategory !== 'all' && m.category !== activeCategory) return false;
            if (!q) return true;
            const hay = [
                m.name, m.role, m.department, m.affiliation, m.country,
                m.expertise, m.keywords, m.qualifications,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [members, query, activeCategory]);

    const grouped = useMemo(() => {
        const map: Record<BoardCategory, BoardMember[]> = {
            editor_in_chief: [], associate_editor: [], managing_editor: [],
            section_editor: [], board_member: [], advisory: [], technical: [],
        };
        for (const m of filtered) (map[m.category] || map.board_member).push(m);
        for (const key of Object.keys(map) as BoardCategory[]) {
            map[key].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        }
        return map;
    }, [filtered]);

    const totalMembers = members.length;
    const countries = useMemo(() => {
        const set = new Set<string>();
        for (const m of members) if (m.country) set.add(m.country);
        return set.size;
    }, [members]);
    const totalExpertise = useMemo(() => {
        const set = new Set<string>();
        for (const m of members) parseList(m.expertise).forEach((t) => set.add(t.toLowerCase()));
        return set.size;
    }, [members]);
    const totalYears = useMemo(() => {
        return members.reduce((n, m) => n + (m.years_editorial_experience || 0), 0);
    }, [members]);

    // Top expertise tags (aggregated word cloud).
    const topTags = useMemo(() => {
        const counts = new Map<string, number>();
        for (const m of members) {
            for (const tag of parseList(m.expertise)) {
                const key = tag.trim();
                if (!key) continue;
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);
    }, [members]);

    const categoryCounts = useMemo(() => {
        const map: Record<BoardCategory, number> = {
            editor_in_chief: 0, associate_editor: 0, managing_editor: 0,
            section_editor: 0, board_member: 0, advisory: 0, technical: 0,
        };
        for (const m of members) map[m.category] = (map[m.category] || 0) + 1;
        return map;
    }, [members]);

    const scrollToCategory = (cat: BoardCategory | 'all') => {
        setActiveCategory(cat);
        setTimeout(() => {
            const el = document.getElementById(cat === 'all' ? 'board-top' : `cat-${cat}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 30);
    };

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

            {/* ── Hero ───────────────────────────────────────────────── */}
            <section className="relative h-[520px] lg:h-[560px] flex items-center overflow-hidden">
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay loop muted playsInline
                    onCanPlayThrough={() => setVideoReady(true)}
                    style={{ opacity: videoReady ? 1 : 0, transition: 'opacity 1.2s ease-in' }}
                />
                <img
                    src={HERO_FALLBACK} alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: videoReady ? 0 : 1, transition: 'opacity 1.2s' }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-brand-950/95 via-brand-950/85 to-indigo-900/70" />
                {/* Decorative blur blobs */}
                <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-500 opacity-20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-purple-500 opacity-20 blur-3xl pointer-events-none" />

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-block mb-5">
                        <JournalLogo variant="compact" dark />
                    </div>
                    <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-semibold uppercase tracking-widest">
                        <span aria-hidden>✨</span> International Board
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tight drop-shadow-lg leading-tight">
                        Meet the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300">Editorial Board</span>
                    </h1>
                    <p className="mt-5 text-lg text-brand-100 max-w-2xl mx-auto font-light">
                        A diverse team of scholars overseeing peer review, ethics, and publication of every article we publish.
                    </p>

                    {totalMembers > 0 && (
                        <div className="mt-10 flex flex-wrap justify-center gap-3">
                            <StatPill icon="👥" value={totalMembers} label="Members" />
                            {countries > 0 && <StatPill icon="🌍" value={countries} label="Countries" />}
                            {totalExpertise > 0 && <StatPill icon="🧭" value={totalExpertise} label="Fields" />}
                            {totalYears > 0 && <StatPill icon="📜" value={totalYears} label="Editorial Years" />}
                        </div>
                    )}
                </div>

                {/* Wave separator */}
                <svg className="absolute bottom-0 left-0 w-full h-16 text-gray-50" viewBox="0 0 1440 80" fill="currentColor" preserveAspectRatio="none">
                    <path d="M0,32 C240,72 480,72 720,52 C960,32 1200,32 1440,60 L1440,80 L0,80 Z" />
                </svg>
            </section>

            {/* ── Sticky nav + search ─────────────────────────────── */}
            <div id="board-top" className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3 py-3">
                        {/* Search */}
                        <div className="relative flex-1 min-w-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>{SEARCH_ICON}</span>
                            <input
                                type="search" value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name, role, department, country, or expertise…"
                                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                aria-label="Search the editorial board"
                            />
                            {query && (
                                <button
                                    type="button" onClick={() => setQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg"
                                    aria-label="Clear search"
                                >×</button>
                            )}
                        </div>
                        {/* Category pills */}
                        <div className="flex gap-1.5 flex-wrap overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => scrollToCategory('all')}
                                className={
                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ' +
                                    (activeCategory === 'all'
                                        ? 'bg-brand-700 text-white shadow'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                                }
                            >
                                All <span className="opacity-70">· {totalMembers}</span>
                            </button>
                            {CATEGORY_ORDER.map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => scrollToCategory(cat)}
                                    disabled={categoryCounts[cat] === 0}
                                    className={
                                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed ' +
                                        (activeCategory === cat
                                            ? 'bg-brand-700 text-white shadow'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                                    }
                                    title={CATEGORY_SUBTITLE[cat]}
                                >
                                    <span>{CATEGORY_ICON[cat]}</span>
                                    {CATEGORY_LABELS[cat]}
                                    <span className="opacity-70">· {categoryCounts[cat]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <main className="flex-1 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {loading ? (
                        <Loading />
                    ) : error ? (
                        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-8 text-center text-red-600 shadow-lg">
                            {error}
                        </div>
                    ) : totalMembers === 0 ? (
                        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 text-center shadow-sm">
                            <span className="text-5xl block mb-3">🧑‍🎓</span>
                            <h2 className="text-2xl font-black text-gray-900">Board is being finalised</h2>
                            <p className="mt-2 text-gray-500 max-w-lg mx-auto">
                                The editorial board is being confirmed and will be published here shortly.
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 text-center shadow-sm">
                            <span className="text-5xl block mb-3">🔎</span>
                            <h2 className="text-xl font-black text-gray-900">No board members match your search</h2>
                            <p className="mt-2 text-gray-500">Try a different keyword, or clear the filter to see everyone.</p>
                            <button
                                type="button"
                                onClick={() => { setQuery(''); setActiveCategory('all'); }}
                                className="mt-5 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition"
                            >
                                Clear filters
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-20">
                            {CATEGORY_ORDER.map((category) => {
                                const list = grouped[category];
                                if (list.length === 0) return null;

                                const isSpotlight =
                                    (category === 'editor_in_chief' || category === 'managing_editor') &&
                                    list.length === 1;
                                const isCompact = category === 'technical' || category === 'advisory';

                                return (
                                    <section key={category} id={`cat-${category}`} className="scroll-mt-28">
                                        <div className="text-center mb-10">
                                            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-50 text-brand-700 border border-brand-100">
                                                <span aria-hidden>{CATEGORY_ICON[category]}</span> {list.length} member{list.length === 1 ? '' : 's'}
                                            </div>
                                            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                                                {CATEGORY_LABELS[category]}
                                            </h2>
                                            <p className="mt-3 text-gray-500 max-w-2xl mx-auto text-sm">{CATEGORY_SUBTITLE[category]}</p>
                                            <div className={`mt-4 mx-auto w-20 h-1 rounded-full bg-gradient-to-r ${CATEGORY_ACCENT[category]}`} />
                                        </div>

                                        {isSpotlight ? (
                                            <Link
                                                to={`/editorial-board/${list[0].id}`}
                                                className="block no-underline text-inherit hover:no-underline focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 rounded-[2rem]"
                                                aria-label={`View profile of ${list[0].name}`}
                                            >
                                                <MemberCard member={list[0]} variant="spotlight" />
                                            </Link>
                                        ) : isCompact ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {list.map((m) => (
                                                    <Link
                                                        key={m.id}
                                                        to={`/editorial-board/${m.id}`}
                                                        className="block no-underline text-inherit hover:no-underline focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 rounded-2xl"
                                                        aria-label={`View profile of ${m.name}`}
                                                    >
                                                        <MemberCard member={m} variant="compact" />
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {list.map((m) => (
                                                    <Link
                                                        key={m.id}
                                                        to={`/editorial-board/${m.id}`}
                                                        className="block no-underline text-inherit hover:no-underline focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 rounded-3xl"
                                                        aria-label={`View profile of ${m.name}`}
                                                    >
                                                        <MemberCard member={m} variant="default" />
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}

                    {/* Expertise cloud */}
                    {topTags.length > 0 && (
                        <section className="mt-24">
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-50 text-brand-700 border border-brand-100">
                                    Coverage
                                </div>
                                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Areas of Expertise</h2>
                                <p className="mt-2 text-gray-500 max-w-2xl mx-auto text-sm">
                                    The most represented research areas across the editorial board.
                                </p>
                            </div>
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {topTags.map(([tag, count]) => {
                                        const size = count >= 4 ? 'text-lg' : count >= 2 ? 'text-sm' : 'text-xs';
                                        const weight = count >= 4 ? 'font-black' : count >= 2 ? 'font-bold' : 'font-semibold';
                                        return (
                                            <button
                                                key={tag} type="button"
                                                onClick={() => { setActiveCategory('all'); setQuery(tag); scrollToCategory('all'); }}
                                                className={`${size} ${weight} px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 border border-brand-100 hover:bg-brand-600 hover:text-white hover:border-brand-600 transition`}
                                            >
                                                {tag}
                                                <span className="ml-1.5 opacity-60 text-[10px] font-mono">×{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Join the board CTA */}
                    <section className="mt-24 relative overflow-hidden rounded-[2rem]">
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950" />
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-500 blur-3xl" />
                            <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-purple-500 blur-3xl" />
                        </div>
                        <div className="relative p-10 lg:p-16 text-center">
                            <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-white/10 backdrop-blur border border-white/20 text-white">
                                Nominations open
                            </div>
                            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                Join the Editorial Board
                            </h2>
                            <p className="mt-4 text-brand-100 max-w-2xl mx-auto">
                                We welcome nominations from active researchers with a strong publication record and a
                                commitment to open, ethical scholarship. Reach out to the editorial office to be considered.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <a
                                    href="/contact"
                                    className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-900 font-black rounded-2xl hover:bg-gray-100 transition shadow-2xl no-underline"
                                >
                                    Contact the Editorial Office <span aria-hidden>→</span>
                                </a>
                                <a
                                    href="/for-reviewers"
                                    className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur border border-white/20 text-white font-bold rounded-2xl hover:bg-white/20 transition no-underline"
                                >
                                    Become a reviewer
                                </a>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default EditorialBoardPage;
