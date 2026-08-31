import React, { useState } from 'react';
import { checkPlagiarism, PlagiarismResult } from '../../api/ai';

const PlagiarismCheck: React.FC = () => {
    const [text, setText] = useState('');
    const [result, setResult] = useState<PlagiarismResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleCheckPlagiarism = async () => {
        if (!text.trim()) {
            setError('Paste some text to check.');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const data = await checkPlagiarism(text);
            setResult(data);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Plagiarism check failed.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const scoreClass =
        result && result.score >= 60
            ? 'text-red-600'
            : result && result.score >= 30
            ? 'text-amber-600'
            : 'text-green-700';

    return (
        <div className="plagiarism-check p-4 bg-white border border-gray-200 rounded shadow-sm">
            <h2 className="text-xl font-bold mb-3">Plagiarism Check</h2>
            <label htmlFor="plagiarism-text" className="sr-only">
                Text to check
            </label>
            <textarea
                id="plagiarism-text"
                className="w-full h-40 border border-gray-300 p-2 rounded"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your text here..."
            />
            <button
                type="button"
                className="mt-2 bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
                onClick={handleCheckPlagiarism}
                disabled={loading || !text.trim()}
            >
                {loading ? 'Checking…' : 'Check Plagiarism'}
            </button>
            {error && (
                <div role="alert" className="mt-3 text-red-600">
                    {error}
                </div>
            )}
            {result && (
                <div className="mt-4">
                    <p className="text-lg">
                        Similarity score:{' '}
                        <span className={`font-semibold ${scoreClass}`}>{result.score}%</span>
                    </p>
                    {result.matches.length > 0 ? (
                        <ul className="mt-2 divide-y divide-gray-200">
                            {result.matches.map((m) => (
                                <li key={m.article_id} className="py-2">
                                    <span className="font-medium">{m.title}</span>
                                    <span className="ml-2 text-sm text-gray-600">
                                        ({Math.round(m.similarity * 100)}% overlap)
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-gray-600">No significant matches found in the corpus.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlagiarismCheck;
