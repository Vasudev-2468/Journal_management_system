import React, { useState } from 'react';
import { createArticle } from '../../api/articles';

const ArticleForm: React.FC = () => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        // TODO: Validate input fields before submission

        try {
            await createArticle({ title, content });
            setSuccess(true);
            // TODO: Reset form fields after successful submission
        } catch (err) {
            setError('Failed to create article. Please try again.');
            // TODO: Handle specific error messages based on response
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Submit a New Article</h2>
            {error && <p className="text-red-500">{error}</p>}
            {success && <p className="text-green-500">Article submitted successfully!</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium">Content</label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                        rows={5}
                        required
                    />
                </div>
                <button
                    type="submit"
                    className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600"
                >
                    Submit Article
                </button>
            </form>
        </div>
    );
};

export default ArticleForm;