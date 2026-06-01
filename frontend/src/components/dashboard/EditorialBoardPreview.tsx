import React from 'react';
import { Link } from 'react-router-dom';

const editorialBoard = [
    {
        name: 'Prof. Dr. A. Rajendran',
        role: 'Editor-in-Chief',
        affiliation: 'Department of Computer Science, Stanford University, USA',
        expertise: 'Machine Learning, Neural Networks',
        photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face&q=80',
    },
    {
        name: 'Prof. Dr. Maria Santos',
        role: 'Associate Editor',
        affiliation: 'Faculty of Engineering, ETH Zurich, Switzerland',
        expertise: 'Computer Vision, Deep Learning',
        photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face&q=80',
    },
    {
        name: 'Prof. Dr. Wei Zhang',
        role: 'Associate Editor',
        affiliation: 'School of AI, Tsinghua University, China',
        expertise: 'NLP, Large Language Models',
        photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face&q=80',
    },
    {
        name: 'Prof. Dr. Sarah Mitchell',
        role: 'Associate Editor',
        affiliation: 'Department of Data Science, University of Oxford, UK',
        expertise: 'Reinforcement Learning, Robotics',
        photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop&crop=face&q=80',
    },
];

const EditorialBoardPreview: React.FC = () => {
    return (
        <section className="py-12 bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Editorial Board</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Distinguished researchers guiding our publication standards
                    </p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {editorialBoard.map((member) => (
                        <div
                            key={member.name}
                            className="text-center p-6 rounded-2xl border border-gray-100 hover:shadow-lg transition-all duration-300 group bg-white"
                        >
                            <div className="w-20 h-20 mx-auto rounded-full overflow-hidden mb-4 ring-4 ring-brand-50 group-hover:ring-brand-100 transition shadow-md">
                                <img
                                    src={member.photo}
                                    alt={member.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">{member.name}</h3>
                            <p className="text-xs font-medium text-brand-600 mt-0.5">{member.role}</p>
                            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{member.affiliation}</p>
                            <p className="text-xs text-gray-500 mt-1 italic">{member.expertise}</p>
                        </div>
                    ))}
                </div>
                <div className="text-center mt-6">
                    <Link
                        to="/editorial-board"
                        className="text-sm font-medium text-brand-600 hover:text-brand-700 no-underline"
                    >
                        View Full Editorial Board →
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default EditorialBoardPreview;
