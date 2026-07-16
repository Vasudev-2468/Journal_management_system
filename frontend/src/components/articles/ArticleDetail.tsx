import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchArticleById as getArticleById } from '../../api/articles';
import { Article } from '../../types';
import Loading from '../common/Loading';

interface ArticleDetailProps {
    article?: Article;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ article: articleProp }) => {
    const { id } = useParams<{ id: string }>();
    const [article, setArticle] = useState<Article | null>(articleProp ?? null);
    const [loading, setLoading] = useState(!articleProp);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (articleProp) {
            setArticle(articleProp);
            setLoading(false);
            return;
        }
        if (!id) {
            setLoading(false);
            return;
        }
        const fetchArticle = async () => {
            try {
                const data = await getArticleById(id);
                setArticle(data);
            } catch (err) {
                setError('Failed to fetch article details.');
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [id, articleProp]);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div>{error}</div>;
    }

    if (!article) {
        return <div>Article not found.</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold">{article.title}</h1>
            {article.author && <p className="mt-2 text-gray-600">{article.author}</p>}
            {article.abstract && (
                <div className="mt-4">
                    <h2 className="text-xl font-semibold">Abstract</h2>
                    <p>{article.abstract}</p>
                </div>
            )}
            <div className="mt-4">
                <h2 className="text-xl font-semibold">Content</h2>
                <p>{article.content}</p>
            </div>
            {/* TODO: Add functionality for comments and reviews */}
        </div>
    );
};

export default ArticleDetail;