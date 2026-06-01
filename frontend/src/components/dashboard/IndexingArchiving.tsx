import React from 'react';
import { Link } from 'react-router-dom';

const IndexingArchiving: React.FC = () => {
    const indexingBodies = [
        { name: 'Scopus', desc: 'CiteScore 3.8', color: 'text-orange-600 bg-orange-50 border-orange-100', letter: 'S' },
        { name: 'Web of Science', desc: 'ESCI Indexed', color: 'text-blue-600 bg-blue-50 border-blue-100', letter: 'W' },
        { name: 'DOAJ', desc: 'Open Access', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', letter: 'D' },
        { name: 'CrossRef', desc: 'DOI Provider', color: 'text-indigo-600 bg-indigo-50 border-indigo-100', letter: 'C' },
        { name: 'Google Scholar', desc: 'Full Indexing', color: 'text-sky-600 bg-sky-50 border-sky-100', letter: 'G' },
        { name: 'CLOCKSS', desc: 'Archiving', color: 'text-purple-600 bg-purple-50 border-purple-100', letter: 'K' },
    ];

    return (
        <section className="py-14 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Indexed &amp; Archived In</h2>
                    <p className="text-sm text-gray-500 mt-2">Recognized by leading global indexing databases</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {indexingBodies.map((body) => (
                        <div
                            key={body.name}
                            className={`flex flex-col items-center gap-3 px-4 py-5 rounded-2xl border ${body.color} hover:shadow-md transition-all duration-300 cursor-default`}
                        >
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${body.color}`}>
                                <span className="font-extrabold text-2xl">{body.letter}</span>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-gray-800 leading-tight">{body.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{body.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default IndexingArchiving;
