import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchArticles } from '../../api/articles';
import { Article } from '../../types';

const ArticleSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Article[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const q = query.trim().toLowerCase();
        if (!q) return;

        setLoading(true);
        setError(null);
        setSearched(true);
        try {
            const all = await fetchArticles();
            const matches = all.filter((a) => {
                const hay = [
                    a.title,
                    a.abstract,
                    a.content,
                    a.author_display,
                    a.author,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return hay.includes(q);
            });
            setResults(matches);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Search failed.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Search Articles</h2>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <label htmlFor="article-search-input" className="sr-only">
                    Search term
                </label>
                <input
                    id="article-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter search term"
                    className="border p-2 rounded w-full"
                />
                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="bg-blue-500 text-white p-2 rounded disabled:bg-gray-400"
                >
                    {loading ? 'Searching…' : 'Search'}
                </button>
            </form>
            {error && (
                <div role="alert" className="text-red-600 mb-2">
                    {error}
                </div>
            )}
            {searched && !loading && (
                <div className="mt-4">
                    {results.length > 0 ? (
                        <ul className="divide-y divide-gray-200">
                            {results.map((article) => (
                                <li key={article.id} className="py-2">
                                    <Link
                                        to={`/articles/${article.id}`}
                                        className="text-blue-600 hover:underline"
                                    >
                                        {article.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>No articles found.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default ArticleSearch;
