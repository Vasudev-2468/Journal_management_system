import React, { useEffect, useState } from 'react';
import { getArticles } from '../../api/articles';
import ArticleCard from './ArticleCard';

const ArticleList: React.FC = () => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchArticles = async () => {
            try {
                const response = await getArticles();
                setArticles(response.data);
            } catch (err) {
                setError('Failed to fetch articles');
            } finally {
                setLoading(false);
            }
        };

        fetchArticles();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div className="article-list">
            {articles.map(article => (
                <ArticleCard key={article.id} article={article} />
            ))}
        </div>
    );
};

export default ArticleList;

// TODO: Implement ArticleCard component to display individual article details
// TODO: Add pagination or infinite scroll for better article navigation
// TODO: Implement error handling and loading states more gracefully