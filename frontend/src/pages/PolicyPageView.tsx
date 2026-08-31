import React, { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import SEO from '../components/common/SEO';
import { fetchPolicy, PolicyPage as PolicyPageData } from '../api/policies';

// JG-102 + JG-103 — the three seeded policy pages (publication-ethics,
// open-access, copyright) share this shell. Each individual route mounts
// this component with its own `slug`; the shell fetches the policy from
// GET /policies/{slug} and renders sections, a ToC and a version footer.

interface Props {
    slug: string;
}

// Minimal safe renderer for the inline `**bold**` and link syntax that
// appears in the seed prose. Keeps the CMS content editor-friendly without
// pulling in a full markdown library, and never emits raw user HTML.
function renderInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g);
    return parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (/^https?:\/\/\S+$/.test(part)) {
            // Strip trailing punctuation from the link target.
            const cleaned = part.replace(/[.,;:!?]+$/, '');
            const trailing = part.slice(cleaned.length);
            return (
                <React.Fragment key={i}>
                    <a href={cleaned} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                        {cleaned}
                    </a>
                    {trailing}
                </React.Fragment>
            );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

const PolicyPageView: React.FC<Props> = ({ slug }) => {
    const [policy, setPolicy] = useState<PolicyPageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchPolicy(slug)
            .then((p) => { if (!cancelled) setPolicy(p); })
            .catch((e) => {
                if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Failed to load policy');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [slug]);

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {policy && (
                <SEO
                    title={`${policy.title} — JGAIR`}
                    description={policy.subtitle ?? undefined}
                    canonical={
                        typeof window !== 'undefined'
                            ? `${window.location.origin}/${slug}`
                            : undefined
                    }
                    type="website"
                />
            )}
            <Header />
            <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {loading && <p className="text-sm text-gray-500">Loading…</p>}

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {policy && (
                    <article>
                        <header className="mb-10">
                            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                                {policy.title}
                            </h1>
                            {policy.subtitle && (
                                <p className="mt-3 text-lg text-gray-600">{policy.subtitle}</p>
                            )}
                        </header>

                        {policy.body.length > 1 && (
                            <nav aria-label="Table of contents" className="mb-10 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                                    On this page
                                </p>
                                <ol className="space-y-1 text-sm">
                                    {policy.body.map((section) => (
                                        <li key={section.id}>
                                            <a href={`#${section.id}`} className="text-blue-700 hover:underline">
                                                {section.title}
                                            </a>
                                        </li>
                                    ))}
                                </ol>
                            </nav>
                        )}

                        {policy.body.map((section) => (
                            <section key={section.id} id={section.id} className="mb-10 scroll-mt-20">
                                <h2 className="text-2xl font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                                    {section.title}
                                </h2>
                                <div className="space-y-4 text-gray-800 leading-relaxed">
                                    {section.content.map((clause, idx) => (
                                        <p key={idx}>{renderInline(clause)}</p>
                                    ))}
                                </div>
                            </section>
                        ))}

                        <footer className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
                            {policy.footer_note && (
                                <p className="mb-3">{renderInline(policy.footer_note)}</p>
                            )}
                            <p>
                                Version {policy.version}
                                {policy.last_reviewed_at && (
                                    <>
                                        {' · '}Last reviewed{' '}
                                        {new Date(policy.last_reviewed_at).toLocaleDateString(undefined, {
                                            year: 'numeric', month: 'long', day: 'numeric',
                                        })}
                                    </>
                                )}
                            </p>
                        </footer>
                    </article>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default PolicyPageView;
