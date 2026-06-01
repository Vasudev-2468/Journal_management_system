import React, { useEffect, useState } from 'react';
import { getAIAnalysis as fetchAIInsights } from '../api/ai';
import Loading from '../components/common/Loading';

const AIInsightsPage: React.FC = () => {
    const [insights, setInsights] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const getInsights = async () => {
            try {
                const data = await fetchAIInsights();
                setInsights(data);
            } catch (err) {
                setError('Failed to fetch AI insights');
            } finally {
                setLoading(false);
            }
        };

        getInsights();
    }, []);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div className="text-red-500">{error}</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">AI Insights</h1>
            <ul>
                {insights.map((insight, index) => (
                    <li key={index} className="mb-2">
                        <div className="p-2 border rounded shadow">
                            <h2 className="font-semibold">{insight.title}</h2>
                            <p>{insight.description}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default AIInsightsPage;