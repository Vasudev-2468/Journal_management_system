import React from 'react';

const Sidebar: React.FC = () => {
    return (
        <div className="w-64 h-full bg-gray-800 text-white">
            <h2 className="text-2xl font-bold p-4">Academic Journal</h2>
            <nav className="mt-4">
                <ul>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/dashboard">Dashboard</a>
                    </li>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/journals">Journals</a>
                    </li>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/articles">Articles</a>
                    </li>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/reviews">Reviews</a>
                    </li>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/ai-insights">AI Insights</a>
                    </li>
                    <li className="p-2 hover:bg-gray-700">
                        <a href="/login">Login</a>
                    </li>
                </ul>
            </nav>
        </div>
    );
};

export default Sidebar;

// TODO: Implement dynamic navigation based on user roles and permissions.