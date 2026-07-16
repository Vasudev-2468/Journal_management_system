import React from 'react';
import { Article } from '../../types';

interface ArticleCardProps {
    article: Article;
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article }) => {
    return (
        <div className="border rounded-lg p-4 shadow hover:shadow-md transition">
            <h3 className="text-lg font-semibold">{article.title}</h3>
            {article.author && (
                <p className="text-gray-500 text-sm mt-1">{article.author}</p>
            )}
            {article.abstract && (
                <p className="text-gray-600 mt-2 line-clamp-3">{article.abstract}</p>
            )}
        </div>
    );
};

export default ArticleCard;
