import { useCallback, useState } from 'react';
import {
    AIAnalysis,
    AISummary,
    PlagiarismResult,
    RecommendationsResult,
    checkPlagiarism as apiCheckPlagiarism,
    getAIRecommendations as apiGetRecommendations,
    runAIAnalysis as apiRunAnalysis,
    summarizeText as apiSummarize,
} from '../api/ai';

type ErrorState = string | null;

const messageFrom = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
};

const useAI = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ErrorState>(null);
    const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
    const [summary, setSummary] = useState<AISummary | null>(null);
    const [plagiarism, setPlagiarism] = useState<PlagiarismResult | null>(null);
    const [recommendations, setRecommendations] = useState<RecommendationsResult | null>(null);

    const wrap = useCallback(
        async <T>(fn: () => Promise<T>, fallbackMsg: string): Promise<T | null> => {
            setLoading(true);
            setError(null);
            try {
                return await fn();
            } catch (err) {
                setError(messageFrom(err, fallbackMsg));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    const runAnalysis = useCallback(
        async (articleId: number | string) => {
            const result = await wrap(
                () => apiRunAnalysis(articleId),
                'AI analysis failed.',
            );
            if (result) setAnalysis(result);
            return result;
        },
        [wrap],
    );

    const summarize = useCallback(
        async (text: string, maxSentences?: number) => {
            const result = await wrap(
                () => apiSummarize(text, maxSentences),
                'Summarization failed.',
            );
            if (result) setSummary(result);
            return result;
        },
        [wrap],
    );

    const runPlagiarism = useCallback(
        async (text: string, corpusArticleIds?: number[]) => {
            const result = await wrap(
                () => apiCheckPlagiarism(text, corpusArticleIds),
                'Plagiarism check failed.',
            );
            if (result) setPlagiarism(result);
            return result;
        },
        [wrap],
    );

    const fetchRecommendations = useCallback(
        async (articleId: number | string) => {
            const result = await wrap(
                () => apiGetRecommendations(articleId),
                'Could not fetch recommendations.',
            );
            if (result) setRecommendations(result);
            return result;
        },
        [wrap],
    );

    return {
        loading,
        error,
        analysis,
        summary,
        plagiarism,
        recommendations,
        runAnalysis,
        summarize,
        runPlagiarism,
        fetchRecommendations,
    };
};

export default useAI;
