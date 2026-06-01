import React from 'react';

interface JournalCardProps {
    journal: {
        id: number;
        title: string;
        description?: string;
    };
}

const JournalCard: React.FC<JournalCardProps> = ({ journal }) => {
    return (
        <div className="border rounded-lg p-4 shadow hover:shadow-md transition">
            <h3 className="text-lg font-semibold">{journal.title}</h3>
            {journal.description && (
                <p className="text-gray-600 mt-2">{journal.description}</p>
            )}
        </div>
    );
};

export default JournalCard;
