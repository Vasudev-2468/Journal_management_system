import React, { useEffect, useState } from 'react';
import { fetchJournals as getJournals } from '../api/journals';
import { Journal } from '../types';
import JournalCard from '../components/journals/JournalCard';

const JournalPage: React.FC = () => {
    const [journals, setJournals] = useState<Journal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadJournals = async () => {
            try {
                const data = await getJournals();
                setJournals(data);
            } catch (err) {
                setError('Failed to fetch journals');
            } finally {
                setLoading(false);
            }
        };

        loadJournals();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Journals</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {journals.map((journal) => (
                    <JournalCard key={journal.id} journal={journal} />
                ))}
            </div>
        </div>
    );
};

export default JournalPage;