import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchArticleById as getArticleById } from '../../api/articles';
import Loading from '../common/Loading';

const ArticleDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [article, setArticle] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                const response = await getArticleById(id!);
                setArticle(response.data);
            } catch (err) {
                setError('Failed to fetch article details.');
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [id]);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold">{article.title}</h1>
            <p className="mt-2 text-gray-600">{article.author}</p>
            <div className="mt-4">
                <h2 className="text-xl font-semibold">Abstract</h2>
                <p>{article.abstract}</p>
            </div>
            <div className="mt-4">
                <h2 className="text-xl font-semibold">Content</h2>
                <p>{article.content}</p>
            </div>
            {/* TODO: Add functionality for comments and reviews */}
        </div>
    );
};

export default ArticleDetail;