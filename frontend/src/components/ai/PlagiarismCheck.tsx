import React, { useState } from 'react';
import axios from 'axios';

const PlagiarismCheck: React.FC = () => {
    const [text, setText] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleCheckPlagiarism = async () => {
        setLoading(true);
        setResult(null);
        try {
            // TODO: Implement API call to backend for plagiarism check
            const response = await axios.post('/api/ai/plagiarism-check', { text });
            setResult(response.data.result);
        } catch (error) {
            console.error('Error checking plagiarism:', error);
            // TODO: Handle error appropriately
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="plagiarism-check">
            <h2 className="text-xl font-bold">Plagiarism Check</h2>
            <textarea
                className="w-full h-40 border border-gray-300 p-2"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your text here..."
            />
            <button
                className="mt-2 bg-blue-500 text-white p-2 rounded"
                onClick={handleCheckPlagiarism}
                disabled={loading}
            >
                {loading ? 'Checking...' : 'Check Plagiarism'}
            </button>
            {result && (
                <div className="mt-4">
                    <h3 className="font-semibold">Result:</h3>
                    <p>{result}</p>
                </div>
            )}
        </div>
    );
};

export default PlagiarismCheck;