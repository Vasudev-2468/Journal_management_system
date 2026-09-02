import React, { useEffect, useState } from 'react';
import { ArticleNotice, fetchArticleNotices } from '../../api/corrections';

/**
 * Displays post-publication notices on the public article page
 * (spec §30 — retracted articles must remain accessible with the
 * notice shown prominently, never suppressed). Drop into ArticlePage
 * near the header. Renders nothing when the article has no notices.
 */
const ArticleNoticesBanner: React.FC<{ articleId: number }> = ({ articleId }) => {
    const [notices, setNotices] = useState<ArticleNotice[]>([]);

    useEffect(() => {
        if (!articleId) return;
        let cancelled = false;
        fetchArticleNotices(articleId)
            .then((rows) => {
                if (!cancelled) setNotices(rows);
            })
            .catch(() => {
                // Notices are read-only public info; a failure here just
                // means we render nothing rather than erroring the page.
            });
        return () => {
            cancelled = true;
        };
    }, [articleId]);

    if (notices.length === 0) return null;

    const retraction = notices.find((n) => n.notice_type === 'retraction');
    const corrections = notices.filter((n) => n.notice_type !== 'retraction');

    return (
        <div className="space-y-3 mb-6">
            {retraction && (
                <div className="rounded-xl border-2 border-rose-500 bg-rose-50 px-5 py-4">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl" aria-hidden>⚠️</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold uppercase tracking-wider text-rose-800">
                                Retracted article
                            </p>
                            <p className="text-lg font-bold text-gray-900 mt-1">{retraction.title}</p>
                            <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{retraction.description}</p>
                            {retraction.reason && (
                                <p className="text-xs text-rose-700 mt-2">
                                    Reason: <span className="font-mono">{retraction.reason}</span>
                                </p>
                            )}
                            <p className="text-[11px] text-rose-800 mt-2">
                                Retracted on {new Date(retraction.published_at).toLocaleDateString()}. The
                                original article remains accessible below for the historical record.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {corrections.map((n) => (
                <div key={n.id} className="rounded-xl border-l-4 border-blue-500 bg-blue-50 px-5 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-800">
                        {n.notice_type === 'expression_of_concern' ? 'Expression of concern' : 'Correction'}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{n.title}</p>
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{n.description}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                        Published {new Date(n.published_at).toLocaleDateString()}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default ArticleNoticesBanner;
