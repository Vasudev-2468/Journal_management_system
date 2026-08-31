import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Loading from '../components/common/Loading';
import FileDropzone, { UploadedFile } from '../components/common/FileDropzone';
import {
    FileKind,
    ManuscriptVersion,
    fetchVersionsForSubmission,
    submitRevision,
} from '../api/platform';

const KIND_LABEL: Record<FileKind, string> = {
    manuscript: 'Revised manuscript',
    figure: 'Figure',
    supplementary: 'Supplementary file',
    response: 'Response to reviewers',
    cover_letter: 'Cover letter',
    dataset: 'Dataset',
    video: 'Video',
    revised: 'Revised source',
    other: 'Other',
};

const KIND_ACCENT: Record<FileKind, string> = {
    manuscript: 'bg-brand-50 text-brand-700 border-brand-200',
    figure: 'bg-purple-50 text-purple-700 border-purple-200',
    supplementary: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    response: 'bg-amber-50 text-amber-700 border-amber-200',
    cover_letter: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dataset: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    video: 'bg-pink-50 text-pink-700 border-pink-200',
    revised: 'bg-gray-100 text-gray-700 border-gray-200',
    other: 'bg-gray-100 text-gray-700 border-gray-200',
};

// Kinds authors can attach to a revision, in the order they should appear
// in the per-row dropdown. Manuscript first so the natural default picks
// the most-common intent.
const REVISION_KINDS: FileKind[] = [
    'manuscript',
    'response',
    'figure',
    'supplementary',
    'cover_letter',
    'dataset',
    'video',
    'other',
];

const AuthorRevisionPage: React.FC = () => {
    const { submissionId = '' } = useParams<{ submissionId: string }>();
    const [versions, setVersions] = useState<ManuscriptVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const [label, setLabel] = useState('');
    const [coverLetter, setCoverLetter] = useState('');
    const [response, setResponse] = useState('');
    const [summary, setSummary] = useState('');
    // Files come pre-uploaded from FileDropzone — no more URL/filename
    // paste-boxes. The list refreshes on every dropzone state change; we
    // only forward the *successful* uploads to the submit call.
    const [files, setFiles] = useState<UploadedFile[]>([]);
    // Remount key: forces FileDropzone to reset its internal state after a
    // successful submission so the next revision starts from a clean slate.
    const [dropzoneKey, setDropzoneKey] = useState(0);

    const load = () => {
        setLoading(true);
        fetchVersionsForSubmission(submissionId)
            .then((data) => setVersions(data))
            .catch((err) => setError(err?.response?.data?.detail || err?.message || 'Failed to load history.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (submissionId) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId]);

    const canSubmit = files.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        if (!canSubmit) {
            setError('Attach at least one file before submitting the revision.');
            return;
        }
        setSubmitting(true);
        try {
            await submitRevision(submissionId, {
                label: label || undefined,
                cover_letter: coverLetter || undefined,
                response_to_reviewers: response || undefined,
                change_summary: summary || undefined,
                files: files.map((f) => ({
                    kind: f.kind,
                    original_filename: f.original_filename,
                    stored_url: f.stored_url,
                    mime_type: f.mime_type,
                    size_bytes: f.size_bytes,
                })),
            });
            setSuccess(true);
            setLabel('');
            setCoverLetter('');
            setResponse('');
            setSummary('');
            setFiles([]);
            setDropzoneKey((k) => k + 1);
            load();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Could not submit revision.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />

            <section className="relative py-14 overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-indigo-950">
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500 blur-3xl" />
                </div>
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <Link to="/author-dashboard" className="text-brand-200 hover:text-white text-sm no-underline">
                        ← Back to my submissions
                    </Link>
                    <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                        Submit a revision
                    </h1>
                    <p className="mt-2 text-brand-200 max-w-2xl">
                        Upload the revised manuscript, response-to-reviewers, and any new files. Previous
                        versions are preserved — nothing is ever overwritten.
                    </p>
                </div>
            </section>

            <main className="flex-1 py-12">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8">
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
                        <h2 className="text-xl font-bold text-gray-900">New version</h2>

                        {error && (
                            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                                Revision submitted. Your submission is back with the editorial team.
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <label className="text-sm">
                                <span className="block text-gray-700 font-semibold mb-1">Label (optional)</span>
                                <input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="revised-1 / final / …"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="block text-gray-700 font-semibold mb-1">Change summary (optional)</span>
                                <input
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    placeholder="Restructured Section 3; added new dataset"
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                />
                            </label>
                        </div>

                        <label className="block text-sm">
                            <span className="block text-gray-700 font-semibold mb-1">Cover letter</span>
                            <textarea
                                value={coverLetter}
                                onChange={(e) => setCoverLetter(e.target.value)}
                                rows={4}
                                placeholder="Dear editors, we thank the reviewers for their thoughtful comments…"
                                className="w-full border border-gray-300 rounded px-3 py-2"
                            />
                        </label>

                        <label className="block text-sm">
                            <span className="block text-gray-700 font-semibold mb-1">Response to reviewers</span>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                rows={6}
                                placeholder="Reviewer 1 — Comment: …  Response: …"
                                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-xs"
                            />
                        </label>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm text-gray-700 font-semibold">Files</span>
                                {files.length > 0 && (
                                    <span className="text-[11px] text-gray-500">
                                        {files.length} file{files.length === 1 ? '' : 's'} ready
                                    </span>
                                )}
                            </div>

                            <FileDropzone
                                key={dropzoneKey}
                                kinds={REVISION_KINDS}
                                onUploaded={setFiles}
                                maxSizeMB={25}
                            />

                            {files.length > 0 && (
                                <ul className="mt-3 flex flex-wrap gap-2">
                                    {files.map((f, i) => (
                                        <li
                                            key={`${f.stored_url}-${i}`}
                                            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${KIND_ACCENT[f.kind]}`}
                                        >
                                            <span>{KIND_LABEL[f.kind]}</span>
                                            <span className="text-[10px] text-gray-600 truncate max-w-[160px]">
                                                {f.original_filename}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <p className="mt-2 text-[11px] text-gray-400">
                                Files upload straight from your device — no need to paste URLs. Each file
                                lands in the same storage the original submission uses.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !canSubmit}
                            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:bg-gray-300 transition shadow-lg"
                        >
                            {submitting ? 'Submitting…' : 'Submit revision'}
                        </button>
                    </form>

                    {/* History */}
                    <aside className="space-y-4">
                        <h2 className="text-lg font-bold text-gray-900">Version history</h2>
                        {loading ? (
                            <Loading />
                        ) : versions.length === 0 ? (
                            <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-4">
                                No prior versions on record.
                            </p>
                        ) : (
                            <ol className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                                {[...versions].reverse().map((v) => (
                                    <li key={v.id} className="ml-6">
                                        <span
                                            className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white shadow ${
                                                v.is_current ? 'bg-emerald-500' : 'bg-gray-300'
                                            }`}
                                        />
                                        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-900">
                                                    v{v.version_number} — {v.label}
                                                </h3>
                                                {v.is_current && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                                                        CURRENT
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(v.created_at).toLocaleString()}
                                            </p>
                                            {v.change_summary && (
                                                <p className="text-xs text-gray-700 mt-2 italic">
                                                    {v.change_summary}
                                                </p>
                                            )}
                                            {v.files.length > 0 && (
                                                <ul className="mt-3 text-xs space-y-1">
                                                    {v.files.map((f) => (
                                                        <li key={f.id} className="flex items-center gap-2 min-w-0">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${KIND_ACCENT[f.kind as FileKind] || KIND_ACCENT.other}`}>
                                                                {KIND_LABEL[f.kind as FileKind] || f.kind}
                                                            </span>
                                                            <a
                                                                href={f.stored_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-brand-700 truncate hover:underline"
                                                            >
                                                                {f.original_filename}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </aside>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default AuthorRevisionPage;
