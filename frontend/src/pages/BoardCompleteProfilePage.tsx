import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    BoardInvitePrefill,
    fetchBoardInvitePrefill,
    submitBoardProfile,
    uploadBoardProfileFile,
} from '../api/board';

/**
 * Public "complete your editorial profile" landing page.
 *
 * Reached via a signed JWT link the editor sent from the admin panel:
 *   /board/complete-profile/:token
 *
 * The page prefills what the editor typed (name, email, category, role),
 * then walks the invitee through the full profile — identity, institution,
 * academic identifiers, expertise, editorial settings, and uploads for
 * photo, resume, and any certifications. On submit the row on the backend
 * is flipped active and appears on the public editorial board page.
 *
 * The token is the entire credential — no login is required. Every
 * failure branch on the backend returns the same 400 so an attacker
 * cannot distinguish "no such invitation" from "already used" from
 * "revoked" by probing.
 */
const BoardCompleteProfilePage: React.FC = () => {
    const { token = '' } = useParams<{ token: string }>();
    const [prefill, setPrefill] = useState<BoardInvitePrefill | null>(null);
    const [loading, setLoading] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    // Profile form state — starts empty, prefill hydrates the first 4 fields.
    const [form, setForm] = useState({
        name: '',
        role: '',
        affiliation: '',
        department: '',
        country: '',
        phone: '',
        orcid: '',
        scholar_url: '',
        scopus_id: '',
        institutional_profile_url: '',
        qualifications: '',
        bio: '',
        expertise: '',
        keywords: '',
        years_editorial_experience: '' as string | number,
        max_active_manuscripts: '' as string | number,
    });
    const [photoFile, setPhotoFile] = useState<{ url: string; name: string } | null>(null);
    const [resumeFile, setResumeFile] = useState<{ url: string; name: string } | null>(null);
    const [certFiles, setCertFiles] = useState<Array<{ url: string; name: string }>>([]);

    useEffect(() => {
        let cancelled = false;
        fetchBoardInvitePrefill(token)
            .then((data) => {
                if (cancelled) return;
                setPrefill(data);
                setForm((prev) => ({
                    ...prev,
                    name: data.name || prev.name,
                    role: data.role || prev.role,
                }));
            })
            .catch((err) => {
                if (cancelled) return;
                setTokenError(
                    err?.response?.data?.detail ||
                        err?.message ||
                        'This invitation link is invalid or expired.',
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    const setField = (key: keyof typeof form, value: any) => setForm((f) => ({ ...f, [key]: value }));

    const requiredMissing = () => {
        const missing: string[] = [];
        if (!form.name.trim()) missing.push('Full name');
        if (!form.role.trim()) missing.push('Designation / role');
        if (!form.affiliation.trim()) missing.push('Institution');
        if (!form.country.trim()) missing.push('Country');
        if (!form.expertise.trim()) missing.push('Primary expertise');
        return missing;
    };

    const handleSubmit = async () => {
        setSubmitError(null);
        const missing = requiredMissing();
        if (missing.length > 0) {
            setSubmitError(`Please fill: ${missing.join(', ')}`);
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                ...form,
                years_editorial_experience:
                    form.years_editorial_experience === '' ? null : Number(form.years_editorial_experience),
                max_active_manuscripts:
                    form.max_active_manuscripts === '' ? null : Number(form.max_active_manuscripts),
                photo_file_url: photoFile?.url || null,
                resume_file_url: resumeFile?.url || null,
                certification_files: certFiles.length
                    ? certFiles.map((c) => ({ file_url: c.url, filename: c.name }))
                    : null,
            };
            await submitBoardProfile(token, payload as any);
            setDone(true);
        } catch (err: any) {
            setSubmitError(
                err?.response?.data?.detail || err?.message || 'Could not submit the profile. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-500 text-sm">Loading invitation…</p>
            </div>
        );
    }

    if (tokenError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-8 text-center shadow-sm">
                    <div className="text-5xl mb-3" aria-hidden>🔒</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation unavailable</h1>
                    <p className="text-sm text-gray-600">{tokenError}</p>
                    <p className="mt-4 text-xs text-gray-500">
                        Please contact the editorial office to request a new link.
                    </p>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white border border-emerald-200 rounded-2xl p-8 text-center shadow-sm">
                    <div className="text-5xl mb-3" aria-hidden>✅</div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Profile submitted</h1>
                    <p className="text-sm text-gray-600">
                        Thank you — your editorial profile has been received. The editorial office will review your
                        submission and your profile will appear on the public board shortly.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-3xl mx-auto px-4">
                <header className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Complete your editorial profile</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Invited as <strong>{prefill?.role}</strong>. Review the information below, complete the
                        remaining fields, upload your documents, and submit.
                    </p>
                    {prefill?.invitation_expires_at && (
                        <p className="text-xs text-gray-400 mt-1">
                            This link expires on{' '}
                            {new Date(prefill.invitation_expires_at).toLocaleString()}.
                        </p>
                    )}
                </header>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                    <ProfileSection title="Personal details">
                        <Grid>
                            <Field label="Full name" required value={form.name} onChange={(v) => setField('name', v)} />
                            <Field label="Email" value={prefill?.email || ''} readOnly />
                            <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+91 98765 43210" type="tel" />
                            <Field label="Country" required value={form.country} onChange={(v) => setField('country', v)} placeholder="India" />
                        </Grid>
                    </ProfileSection>

                    <ProfileSection title="Institution">
                        <Grid>
                            <Field label="Institution" required value={form.affiliation} onChange={(v) => setField('affiliation', v)} placeholder="Example University" />
                            <Field label="Department" value={form.department} onChange={(v) => setField('department', v)} />
                            <Field label="Designation / role" required value={form.role} onChange={(v) => setField('role', v)} />
                            <Field label="Institutional profile URL" value={form.institutional_profile_url} onChange={(v) => setField('institutional_profile_url', v)} type="url" />
                        </Grid>
                    </ProfileSection>

                    <ProfileSection title="Academic identifiers">
                        <Grid>
                            <Field label="ORCID" value={form.orcid} onChange={(v) => setField('orcid', v)} placeholder="0000-0000-0000-0000" />
                            <Field label="Scopus Author ID" value={form.scopus_id} onChange={(v) => setField('scopus_id', v)} />
                            <Field label="Google Scholar URL" value={form.scholar_url} onChange={(v) => setField('scholar_url', v)} type="url" />
                        </Grid>
                    </ProfileSection>

                    <ProfileSection title="Expertise & bio">
                        <Textarea label="Primary expertise" required value={form.expertise} onChange={(v) => setField('expertise', v)} rows={2} placeholder="Comma-separated: Machine Learning, NLP, Computer Vision" />
                        <Textarea label="Keywords" value={form.keywords} onChange={(v) => setField('keywords', v)} rows={2} placeholder="5–20 comma-separated keywords" />
                        <Textarea label="Academic qualifications" value={form.qualifications} onChange={(v) => setField('qualifications', v)} rows={2} placeholder="PhD in CS, Stanford, 2010; MSc, IIT Bombay, 2005" />
                        <Textarea label="Short bio" value={form.bio} onChange={(v) => setField('bio', v)} rows={3} />
                    </ProfileSection>

                    <ProfileSection title="Editorial capacity">
                        <Grid>
                            <Field label="Years of editorial experience" value={String(form.years_editorial_experience)} onChange={(v) => setField('years_editorial_experience', v)} type="number" placeholder="5" />
                            <Field label="Max active manuscripts" value={String(form.max_active_manuscripts)} onChange={(v) => setField('max_active_manuscripts', v)} type="number" placeholder="10" />
                        </Grid>
                    </ProfileSection>

                    <ProfileSection title="Documents">
                        <FileUploadRow
                            label="Profile photo (JPEG / PNG / WEBP)"
                            token={token}
                            file={photoFile}
                            onChange={setPhotoFile}
                            accept="image/jpeg,image/png,image/webp,image/gif"
                        />
                        <FileUploadRow
                            label="Resume / CV (PDF or Word)"
                            token={token}
                            file={resumeFile}
                            onChange={setResumeFile}
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        />
                        <MultiFileUploadRow
                            label="Additional certifications (optional)"
                            token={token}
                            files={certFiles}
                            onChange={setCertFiles}
                            accept=".pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        />
                    </ProfileSection>

                    {submitError && (
                        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2">
                            {submitError}
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                            Fields marked * are required. All information is reviewed before publication.
                        </p>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="px-6 py-2 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:bg-gray-300"
                        >
                            {submitting ? 'Submitting…' : 'Submit profile'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Field helpers ───────────────────────────────────────

const ProfileSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">{title}</h2>
        <div className="space-y-3">{children}</div>
    </section>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
);

interface FieldProps {
    label: string;
    value: string;
    onChange?: (v: string) => void;
    placeholder?: string;
    type?: string;
    required?: boolean;
    readOnly?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, type = 'text', required, readOnly }) => (
    <label className="block text-sm">
        <span className="block text-gray-600 mb-1">
            {label}
            {required && <span className="text-rose-600 ml-0.5">*</span>}
        </span>
        <input
            type={type}
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                readOnly ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'
            }`}
        />
    </label>
);

const Textarea: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    rows?: number;
    placeholder?: string;
    required?: boolean;
}> = ({ label, value, onChange, rows = 3, placeholder, required }) => (
    <label className="block text-sm">
        <span className="block text-gray-600 mb-1">
            {label}
            {required && <span className="text-rose-600 ml-0.5">*</span>}
        </span>
        <textarea
            value={value}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
    </label>
);

// ── File upload widgets ─────────────────────────────────

const FileUploadRow: React.FC<{
    label: string;
    token: string;
    file: { url: string; name: string } | null;
    onChange: (file: { url: string; name: string } | null) => void;
    accept: string;
}> = ({ label, token, file, onChange, accept }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = async (f: File) => {
        setErr(null);
        setBusy(true);
        try {
            const res = await uploadBoardProfileFile(token, f);
            onChange({ url: res.file_url, name: res.filename });
        } catch (ex: any) {
            setErr(ex?.response?.data?.detail || 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p className="text-sm text-gray-600 mb-1">{label}</p>
            <div className="border border-dashed border-gray-300 rounded-lg p-3 flex items-center gap-3">
                {file ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span aria-hidden>📎</span>
                        <span className="text-sm font-medium truncate">{file.name}</span>
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            className="text-xs text-rose-600 hover:underline ml-auto"
                        >
                            Remove
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={busy}
                        className="text-sm text-blue-700 hover:underline"
                    >
                        {busy ? 'Uploading…' : 'Choose file'}
                    </button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    hidden
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                    }}
                />
            </div>
            {err && <p role="alert" className="text-xs text-rose-600 mt-1">{err}</p>}
        </div>
    );
};

const MultiFileUploadRow: React.FC<{
    label: string;
    token: string;
    files: Array<{ url: string; name: string }>;
    onChange: (files: Array<{ url: string; name: string }>) => void;
    accept: string;
}> = ({ label, token, files, onChange, accept }) => {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const upload = async (list: FileList) => {
        setErr(null);
        setBusy(true);
        try {
            const results: Array<{ url: string; name: string }> = [];
            for (const f of Array.from(list)) {
                const res = await uploadBoardProfileFile(token, f);
                results.push({ url: res.file_url, name: res.filename });
            }
            onChange([...files, ...results]);
        } catch (ex: any) {
            setErr(ex?.response?.data?.detail || 'One or more uploads failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p className="text-sm text-gray-600 mb-1">{label}</p>
            <div className="border border-dashed border-gray-300 rounded-lg p-3">
                {files.length > 0 && (
                    <ul className="space-y-1 mb-2">
                        {files.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                                <span aria-hidden>📎</span>
                                <span className="flex-1 truncate">{f.name}</span>
                                <button
                                    type="button"
                                    onClick={() => onChange(files.filter((_, j) => j !== i))}
                                    className="text-xs text-rose-600 hover:underline"
                                >
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="text-sm text-blue-700 hover:underline"
                >
                    {busy ? 'Uploading…' : '+ Add certification'}
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple
                    hidden
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            upload(e.target.files);
                            e.target.value = '';
                        }
                    }}
                />
            </div>
            {err && <p role="alert" className="text-xs text-rose-600 mt-1">{err}</p>}
        </div>
    );
};

export default BoardCompleteProfilePage;
