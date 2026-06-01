import React, { useEffect, useState } from 'react';
import { getAISummary } from '../../api/ai'; // TODO: Implement API call for AI summary

const AISummary: React.FC = () => {
    const [summary, setSummary] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const data = await getAISummary(); // TODO: Handle API response
                setSummary(data.summary); // TODO: Adjust based on actual response structure
            } catch (err) {
                setError('Failed to fetch summary'); // TODO: Improve error handling
            } finally {
                setLoading(false);
            }
        };

        fetchSummary();
    }, []);

    if (loading) {
        return <div>Loading...</div>; // TODO: Replace with a loading component
    }

    if (error) {
        return <div>{error}</div>; // TODO: Replace with a more user-friendly error component
    }

    return (
        <div className="ai-summary">
            <h2>AI Generated Summary</h2>
            <p>{summary}</p>
        </div>
    );
};

export default AISummary;