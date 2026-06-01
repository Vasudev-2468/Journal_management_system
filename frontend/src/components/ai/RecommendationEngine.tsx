import React, { useEffect, useState } from 'react';
import { getAIRecommendations } from '../../api/ai';
import Loading from '../common/Loading';

const RecommendationEngine: React.FC = () => {
    const [recommendations, setRecommendations] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const data = await getAIRecommendations();
                setRecommendations(data);
            } catch (err) {
                setError('Failed to fetch recommendations');
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, []);

    if (loading) {
        return <Loading />;
    }

    if (error) {
        return <div className="text-red-500">{error}</div>;
    }

    return (
        <div className="recommendation-engine">
            <h2 className="text-xl font-bold">AI-Based Recommendations</h2>
            <ul className="list-disc pl-5">
                {recommendations.map((rec, index) => (
                    <li key={index} className="my-2">{rec}</li>
                ))}
            </ul>
        </div>
    );
};

export default RecommendationEngine;

// TODO: Implement error handling and loading states more gracefully.
// TODO: Style the component using Tailwind CSS for better UI.