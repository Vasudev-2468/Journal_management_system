import { useEffect, useState } from 'react';
import { fetchArticles } from '../api/articles';
import { Article } from '../types';

const useArticles = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadArticles = async () => {
            try {
                const data = await fetchArticles();
                setArticles(data);
            } catch (err) {
                setError('Failed to load articles');
            } finally {
                setLoading(false);
            }
        };

        loadArticles();
    }, []);

    return { articles, loading, error };
};

export default useArticles;