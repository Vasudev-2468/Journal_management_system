import React, { useEffect, useState } from 'react';
import { getAISummary, summarizeText } from '../../api/ai';
import Loading from '../common/Loading';

interface AISummaryProps {
    articleId?: number | string;
    text?: string;
}

const AISummary: React.FC<AISummaryProps> = ({ articleId, text }) => {
    const [summary, setSummary] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchSummary = async () => {
            setLoading(true);
            setError(null);
            try {
                let data;
                if (text) {
                    data = await summarizeText(text);
                } else if (articleId !== undefined) {
                    data = await getAISummary(articleId);
                } else {
                    throw new Error('AISummary requires an articleId or text.');
                }
                if (!cancelled) {
                    setSummary(data.summary);
                }
            } catch (err) {
                if (!cancelled) {
                    const message =
                        err instanceof Error ? err.message : 'Failed to generate summary.';
                    setError(message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchSummary();
        return () => {
            cancelled = true;
        };
    }, [articleId, text]);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return (
            <div role="alert" className="text-red-600 bg-red-50 border border-red-200 rounded p-3">
                {error}
            </div>
        );
    }

    return (
        <section className="ai-summary bg-white border border-gray-200 rounded p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">AI Generated Summary</h2>
            <p className="text-gray-800 whitespace-pre-line">{summary || 'No summary available.'}</p>
        </section>
    );
};

export default AISummary;
