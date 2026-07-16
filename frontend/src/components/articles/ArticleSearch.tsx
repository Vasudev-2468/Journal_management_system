import React, { useState } from 'react';
import { Article } from '../../types';

const ArticleSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Article[]>([]);

    const handleSearch = async () => {
        // TODO: Implement the search API call to fetch articles based on the query
        // Example: const response = await fetch(`/api/articles/search?query=${query}`);
        // setResults(await response.json());
    };

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Search Articles</h2>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter search term"
                className="border p-2 rounded w-full mb-4"
            />
            <button
                onClick={handleSearch}
                className="bg-blue-500 text-white p-2 rounded"
            >
                Search
            </button>
            <div className="mt-4">
                {results.length > 0 ? (
                    <ul>
                        {results.map((article) => (
                            <li key={article.id} className="border-b py-2">
                                {article.title}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>No articles found.</p>
                )}
            </div>
        </div>
    );
};

export default ArticleSearch;