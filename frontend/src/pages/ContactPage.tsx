import React, { useState } from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { submitContactMessage } from '../api/contact';
import { useJournal } from '../context/JournalContext';

interface FormState {
    name: string;
    email: string;
    subject: string;
    message: string;
}

const EMPTY: FormState = { name: '', email: '', subject: '', message: '' };

const ContactPage: React.FC = () => {
    const [form, setForm] = useState<FormState>(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const { journal } = useJournal();

    const change = (field: keyof FormState) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const validate = (): string | null => {
        if (!form.name.trim()) return 'Please enter your name.';
        if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Please enter a valid email address.';
        if (!form.subject.trim()) return 'Please enter a subject.';
        if (form.message.trim().length < 10) return 'Message must be at least 10 characters.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        const err = validate();
        if (err) {
            setError(err);
            return;
        }
        setSubmitting(true);
        try {
            await submitContactMessage({
                name: form.name.trim(),
                email: form.email.trim(),
                subject: form.subject.trim(),
                message: form.message.trim(),
            });
            setForm(EMPTY);
            setSuccess(true);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setError(
                typeof detail === 'string'
                    ? detail
                    : err instanceof Error
                    ? err.message
                    : 'Could not send message. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    // Assemble contact rows from journal record — anything that is not set
    // is simply omitted so the sidebar collapses cleanly on a fresh install.
    const j: any = journal || {};
    const hasContactBlock = Boolean(
        j.phone ||
            j.address ||
            j.twitter_url ||
            j.linkedin_url ||
            j.email_editorial ||
            j.email_publisher,
    );

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 py-12">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            Contact the Editorial Office
                        </h1>
                        <p className="mt-3 text-gray-600 max-w-xl mx-auto">
                            Have a question about submissions, indexing, permissions, or the
                            journal's policies? Send us a message — we typically reply within a
                            few working days.
                        </p>
                    </div>

                    <div
                        className={`grid gap-6 ${
                            hasContactBlock ? 'lg:grid-cols-3' : 'lg:grid-cols-1'
                        }`}
                    >
                        <div className={hasContactBlock ? 'lg:col-span-2' : 'max-w-3xl mx-auto w-full'}>
                            <div className="bg-white shadow-sm rounded-2xl border border-gray-100 p-8">
                                {error && (
                                    <div
                                        role="alert"
                                        className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3"
                                    >
                                        {error}
                                    </div>
                                )}
                                {success && (
                                    <div
                                        role="status"
                                        className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3"
                                    >
                                        Thank you — your message has reached the editorial office.
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="c-name" className="block text-sm font-medium text-gray-700">
                                                Name
                                            </label>
                                            <input
                                                id="c-name"
                                                type="text"
                                                value={form.name}
                                                onChange={change('name')}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="c-email" className="block text-sm font-medium text-gray-700">
                                                Email
                                            </label>
                                            <input
                                                id="c-email"
                                                type="email"
                                                value={form.email}
                                                onChange={change('email')}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="c-subject" className="block text-sm font-medium text-gray-700">
                                            Subject
                                        </label>
                                        <input
                                            id="c-subject"
                                            type="text"
                                            value={form.subject}
                                            onChange={change('subject')}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="c-message" className="block text-sm font-medium text-gray-700">
                                            Message
                                        </label>
                                        <textarea
                                            id="c-message"
                                            value={form.message}
                                            onChange={change('message')}
                                            rows={7}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                            required
                                            minLength={10}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                                    >
                                        {submitting ? 'Sending…' : 'Send Message'}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {hasContactBlock && (
                            <aside className="lg:col-span-1">
                                <div className="bg-white shadow-sm rounded-2xl border border-gray-100 p-6 sticky top-6">
                                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                        Reach us directly
                                    </h2>
                                    <dl className="space-y-4 text-sm">
                                        {j.email_editorial && (
                                            <div>
                                                <dt className="font-medium text-gray-500 uppercase tracking-wide text-xs">
                                                    Editorial
                                                </dt>
                                                <dd className="mt-1 text-gray-800 break-all">
                                                    <a
                                                        href={`mailto:${j.email_editorial}`}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {j.email_editorial}
                                                    </a>
                                                </dd>
                                            </div>
                                        )}
                                        {j.email_publisher && (
                                            <div>
                                                <dt className="font-medium text-gray-500 uppercase tracking-wide text-xs">
                                                    Publisher
                                                </dt>
                                                <dd className="mt-1 text-gray-800 break-all">
                                                    <a
                                                        href={`mailto:${j.email_publisher}`}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {j.email_publisher}
                                                    </a>
                                                </dd>
                                            </div>
                                        )}
                                        {j.phone && (
                                            <div>
                                                <dt className="font-medium text-gray-500 uppercase tracking-wide text-xs">
                                                    Phone
                                                </dt>
                                                <dd className="mt-1 text-gray-800">
                                                    <a
                                                        href={`tel:${j.phone.replace(/\s+/g, '')}`}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {j.phone}
                                                    </a>
                                                </dd>
                                            </div>
                                        )}
                                        {j.address && (
                                            <div>
                                                <dt className="font-medium text-gray-500 uppercase tracking-wide text-xs">
                                                    Address
                                                </dt>
                                                <dd className="mt-1 text-gray-800 whitespace-pre-line">
                                                    {j.address}
                                                </dd>
                                            </div>
                                        )}
                                        {(j.twitter_url || j.linkedin_url) && (
                                            <div>
                                                <dt className="font-medium text-gray-500 uppercase tracking-wide text-xs">
                                                    Follow
                                                </dt>
                                                <dd className="mt-1 flex flex-col gap-1">
                                                    {j.twitter_url && (
                                                        <a
                                                            href={j.twitter_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:underline break-all"
                                                        >
                                                            Twitter / X
                                                        </a>
                                                    )}
                                                    {j.linkedin_url && (
                                                        <a
                                                            href={j.linkedin_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:underline break-all"
                                                        >
                                                            LinkedIn
                                                        </a>
                                                    )}
                                                </dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            </aside>
                        )}
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ContactPage;
