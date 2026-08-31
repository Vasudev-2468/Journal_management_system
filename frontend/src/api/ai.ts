import client from './client';

export interface AISummary {
    summary: string;
}

export interface PlagiarismMatch {
    article_id: number;
    title: string;
    similarity: number;
}

export interface PlagiarismResult {
    score: number;
    matches: PlagiarismMatch[];
}

export interface RelatedArticle {
    article_id: number;
    title: string;
    similarity: number;
}

export interface RecommendationsResult {
    article_id: number;
    related: RelatedArticle[];
}

export interface AIAnalysis {
    id: number;
    article_id: number;
    summary: string;
    plagiarism_score: number;
    recommendations: string | null;
}

export const getAIStatus = async (): Promise<{ status: string }> => {
    const response = await client.get('/ai/status');
    return response.data;
};

export const getAISummary = async (articleId?: number | string): Promise<AISummary> => {
    if (articleId !== undefined && articleId !== null && articleId !== '') {
        const response = await client.get(`/ai/summary/${articleId}`);
        return response.data;
    }
    throw new Error('An article id (or a POST body of text) is required to summarize.');
};

export const summarizeText = async (
    text: string,
    maxSentences = 3,
): Promise<AISummary> => {
    const response = await client.post('/ai/summary', {
        text,
        max_sentences: maxSentences,
    });
    return response.data;
};

export const checkPlagiarism = async (
    text: string,
    corpusArticleIds?: number[],
): Promise<PlagiarismResult> => {
    const response = await client.post('/ai/plagiarism', {
        text,
        corpus_article_ids: corpusArticleIds,
    });
    return response.data;
};

export const getAIRecommendations = async (
    articleId: number | string,
): Promise<RecommendationsResult> => {
    const response = await client.get(`/ai/recommendations/${articleId}`);
    return response.data;
};

export const runAIAnalysis = async (
    articleId: number | string,
): Promise<AIAnalysis> => {
    const response = await client.post(`/ai/analyze/${articleId}`);
    return response.data;
};

export const getAIAnalysis = async (
    analysisId: number | string,
): Promise<AIAnalysis> => {
    const response = await client.get(`/ai/analysis/${analysisId}`);
    return response.data;
};
