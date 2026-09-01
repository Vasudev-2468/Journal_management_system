import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReviewerPortalLayout from '../../components/reviewer/ReviewerPortalLayout';
import Loading from '../../components/common/Loading';
import { ProfileResponse, fetchProfile, saveProfile } from '../../api/reviewerPortal';

const Field: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
}> = ({ label, value, onChange, placeholder, disabled }) => (
    <label className="block">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <input
            type="text" value={value} disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
        />
    </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
);

export default function ProfilePage() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<ProfileResponse | null>(null);
    const [tagsInput, setTagsInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    useEffect(() => {
        fetchProfile()
            .then((p) => {
                setProfile(p);
                setTagsInput((p.expertise_tags || []).join(', '));
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    navigate('/reviewer-login', { replace: true });
                    return;
                }
                setError('Could not load your profile.');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    if (loading) return <ReviewerPortalLayout active="profile"><Loading /></ReviewerPortalLayout>;
    if (error || !profile) return <ReviewerPortalLayout active="profile"><div role="alert" className="text-red-700">{error}</div></ReviewerPortalLayout>;

    const set = (k: keyof ProfileResponse, v: any) => setProfile({ ...profile, [k]: v } as ProfileResponse);

    const handleSave = async () => {
        setSaving(true); setFlash(null);
        try {
            const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
            const updated = await saveProfile({
                phone: profile.phone,
                country: profile.country,
                institution: profile.institution,
                department: profile.department,
                designation: profile.designation,
                expertise_tags: tags,
                orcid: profile.orcid,
                scopus_id: profile.scopus_id,
                google_scholar: profile.google_scholar,
            });
            setProfile(updated);
            setTagsInput((updated.expertise_tags || []).join(', '));
            setFlash('Profile saved.');
            setTimeout(() => setFlash(null), 2400);
        } catch (err: any) {
            setFlash(err?.response?.data?.detail || 'Could not save the profile.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ReviewerPortalLayout active="profile">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">My Profile</h1>
            {flash && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{flash}</div>}

            <Section title="Personal Information">
                <Field label="Name" value={profile.name} onChange={() => {}} disabled />
                <Field label="Email" value={profile.email} onChange={() => {}} disabled />
                <Field label="Phone" value={profile.phone || ''} onChange={(v) => set('phone', v)} />
                <Field label="Country" value={profile.country || ''} onChange={(v) => set('country', v)} />
            </Section>

            <Section title="Institution">
                <Field label="Institution" value={profile.institution || ''} onChange={(v) => set('institution', v)} />
                <Field label="Department" value={profile.department || ''} onChange={(v) => set('department', v)} />
                <Field label="Designation" value={profile.designation || ''} onChange={(v) => set('designation', v)} />
            </Section>

            <Section title="Research Expertise">
                <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Keywords (comma-separated)
                    </span>
                    <input
                        type="text" value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="machine learning, computer vision, remote sensing"
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                </label>
            </Section>

            <Section title="Academic Identifiers">
                <Field label="ORCID" value={profile.orcid || ''} onChange={(v) => set('orcid', v)} placeholder="0000-0002-1234-5678" />
                <Field label="Scopus ID" value={profile.scopus_id || ''} onChange={(v) => set('scopus_id', v)} />
                <Field label="Google Scholar" value={profile.google_scholar || ''} onChange={(v) => set('google_scholar', v)} />
            </Section>

            <div className="flex justify-end">
                <button
                    type="button" onClick={handleSave} disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        </ReviewerPortalLayout>
    );
}
