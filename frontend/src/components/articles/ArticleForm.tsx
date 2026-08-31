import React, { useState } from 'react';
import { createArticle } from '../../api/articles';

interface ArticleFormProps {
    journalId?: number;
    onCreated?: () => void;
}

const ArticleForm: React.FC<ArticleFormProps> = ({ journalId, onCreated }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [abstract, setAbstract] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const validate = (): string | null => {
        if (!title.trim()) return 'Title is required.';
        if (title.trim().length < 5) return 'Title must be at least 5 characters.';
        if (!content.trim()) return 'Content is required.';
        if (content.trim().length < 50) return 'Content must be at least 50 characters.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        try {
            await createArticle({
                title: title.trim(),
                content: content.trim(),
                abstract: abstract.trim() || undefined,
                journal_id: journalId ?? 0,
            } as any);
            setTitle('');
            setContent('');
            setAbstract('');
            setSuccess(true);
            onCreated?.();
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(
                typeof detail === 'string'
                    ? detail
                    : detail?.[0]?.msg
                    ? `Validation error: ${detail[0].msg}`
                    : 'Failed to create article. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Submit a New Article</h2>
            {error && (
                <p role="alert" className="text-red-500 mb-2">
                    {error}
                </p>
            )}
            {success && (
                <p role="status" className="text-green-500 mb-2">
                    Article submitted successfully!
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                    <label htmlFor="article-title" className="block text-sm font-medium">
                        Title
                    </label>
                    <input
                        id="article-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                        required
                        minLength={5}
                    />
                </div>
                <div>
                    <label htmlFor="article-abstract" className="block text-sm font-medium">
                        Abstract (optional)
                    </label>
                    <textarea
                        id="article-abstract"
                        value={abstract}
                        onChange={(e) => setAbstract(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                        rows={3}
                    />
                </div>
                <div>
                    <label htmlFor="article-content" className="block text-sm font-medium">
                        Content
                    </label>
                    <textarea
                        id="article-content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                        rows={5}
                        required
                        minLength={50}
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400"
                >
                    {submitting ? 'Submitting…' : 'Submit Article'}
                </button>
            </form>
        </div>
    );
};

export default ArticleForm;
