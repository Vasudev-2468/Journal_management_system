import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerAuthor } from '../api/authorAuth';

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Argentina','Australia','Austria','Bangladesh','Belgium',
  'Brazil','Canada','Chile','China','Colombia','Croatia','Czech Republic','Denmark','Egypt',
  'Ethiopia','Finland','France','Germany','Ghana','Greece','Hungary','India','Indonesia',
  'Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan','Kenya','Malaysia','Mexico',
  'Morocco','Netherlands','New Zealand','Nigeria','Norway','Pakistan','Peru','Philippines',
  'Poland','Portugal','Romania','Russia','Saudi Arabia','Singapore','South Africa','South Korea',
  'Spain','Sri Lanka','Sweden','Switzerland','Taiwan','Thailand','Turkey','Ukraine',
  'United Arab Emirates','United Kingdom','United States','Vietnam','Other',
];

const STEPS = ['Personal Info', 'Academic Profile', 'Account Setup'];

function StepDot({ step, current, label }) {
  const done = step < current;
  const active = step === current;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
        done ? 'bg-green-500 text-white' :
        active ? 'bg-green-700 text-white ring-4 ring-green-100' :
        'bg-gray-100 text-gray-400'
      }`}>
        {done ? '✓' : step}
      </div>
      <span className={`text-xs font-medium hidden sm:block ${active ? 'text-green-700' : done ? 'text-green-500' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}

function InputField({ label, required, error, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const cls = (err) =>
  `w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 outline-none transition-all bg-white ${
    err ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-100'
  }`;

export default function AuthorRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', whatsapp_number: '',
    institution: '', department: '', orcid: '', country: '', bio: '',
    username: '', password: '', confirm_password: '',
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const validate = (s) => {
    const e = {};
    if (s === 1) {
      if (!form.first_name.trim()) e.first_name = 'First name is required.';
      if (!form.last_name.trim()) e.last_name = 'Last name is required.';
      if (!form.email.trim()) e.email = 'Email is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address.';
    }
    if (s === 2) {
      if (!form.institution.trim()) e.institution = 'Institution is required.';
      if (form.orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(form.orcid)) {
        e.orcid = 'ORCID format: 0000-0000-0000-0000';
      }
    }
    if (s === 3) {
      if (!form.username.trim()) e.username = 'Username is required.';
      else if (form.username.length < 3) e.username = 'At least 3 characters.';
      if (!form.password) e.password = 'Password is required.';
      else if (form.password.length < 8) e.password = 'At least 8 characters.';
      if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match.';
    }
    return e;
  };

  const next = () => {
    const e = validate(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep((s) => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const e2 = validate(3);
    if (Object.keys(e2).length) { setErrors(e2); return; }

    setLoading(true);
    setServerError('');
    try {
      await registerAuthor(form);
      navigate('/author-login', { state: { registered: true, email: form.email } });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setServerError(typeof detail === 'string' ? detail : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f7f0] flex">

      {/* ── Left Hero Panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col bg-[#1B4332] overflow-hidden">

        {/* Background image overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1400&q=80')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1B4332]/60 via-[#2D6A4F]/40 to-[#1B4332]/90" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold">Journal of AI Research</p>
              <p className="text-green-300 text-xs">Open Access · Impact Factor 8.4</p>
            </div>
          </div>

          {/* Research image card */}
          <div className="my-6 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            <img
              src="https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=800&q=80"
              alt="Scientific research"
              className="w-full h-44 object-cover"
            />
            <div className="bg-black/40 backdrop-blur-sm p-4">
              <p className="text-white text-sm font-semibold">Publish your discoveries</p>
              <p className="text-green-200 text-xs mt-1">Join 12,000+ authors from 140+ countries advancing AI research</p>
            </div>
          </div>

          {/* Benefits list */}
          <div className="space-y-3 mb-6">
            {[
              { icon: '🌍', text: 'Global reach — indexed in Scopus, Web of Science & Google Scholar' },
              { icon: '⚡', text: 'AI-powered review pipeline — initial decision within 3–5 days' },
              { icon: '🔓', text: 'Open access — your work is free to read and cite worldwide' },
              { icon: '📊', text: 'Real-time submission tracking through every editorial stage' },
            ].map((b) => (
              <div key={b.text} className="flex items-start gap-3 bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                <span className="text-lg shrink-0">{b.icon}</span>
                <p className="text-green-100 text-xs leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 bg-black/20 rounded-2xl p-4 border border-white/10">
            {[
              { value: '12K+', label: 'Authors' },
              { value: '98%', label: 'Satisfaction' },
              { value: '18d', label: 'Avg. Decision' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-white font-bold text-lg">{s.value}</p>
                <p className="text-green-300 text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Form Panel ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex items-start justify-center p-6 lg:p-10">
          <div className="w-full max-w-lg">

            {/* Mobile header */}
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <p className="font-bold text-green-900">Journal of AI Research</p>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Create Author Account</h1>
              <p className="text-gray-500 text-sm mt-1">
                Already have an account?{' '}
                <Link to="/author-login" className="text-green-700 font-semibold hover:underline">Sign in</Link>
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center mb-8">
              {STEPS.map((label, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 mx-2 transition-colors ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                  <StepDot step={i + 1} current={step} label={label} />
                </React.Fragment>
              ))}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-green-100 overflow-hidden">
              <form onSubmit={handleSubmit}>
                <div className="p-7 space-y-4">

                  {serverError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-start gap-2">
                      <span className="shrink-0">⚠</span> {serverError}
                    </div>
                  )}

                  {/* ── Step 1: Personal Info ── */}
                  {step === 1 && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <h2 className="font-bold text-gray-800">Personal Information</h2>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <InputField label="First Name" required error={errors.first_name}>
                          <input value={form.first_name} onChange={set('first_name')} className={cls(errors.first_name)} placeholder="Jane" autoFocus />
                        </InputField>
                        <InputField label="Last Name" required error={errors.last_name}>
                          <input value={form.last_name} onChange={set('last_name')} className={cls(errors.last_name)} placeholder="Smith" />
                        </InputField>
                      </div>

                      <InputField label="Email Address" required error={errors.email}>
                        <input type="email" value={form.email} onChange={set('email')} className={cls(errors.email)} placeholder="jane@university.edu" autoComplete="email" />
                      </InputField>

                      <InputField label="WhatsApp Number" hint="Used for two-step verification notifications.">
                        <input type="tel" value={form.whatsapp_number} onChange={set('whatsapp_number')} className={cls()} placeholder="+1 555 000 0000" />
                      </InputField>

                      <InputField label="Country">
                        <select value={form.country} onChange={set('country')} className={cls() + ' cursor-pointer'}>
                          <option value="">— Select your country —</option>
                          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </InputField>
                    </>
                  )}

                  {/* ── Step 2: Academic Profile ── */}
                  {step === 2 && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <h2 className="font-bold text-gray-800">Academic Profile</h2>
                      </div>

                      <InputField label="Institution / University" required error={errors.institution}>
                        <input value={form.institution} onChange={set('institution')} className={cls(errors.institution)} placeholder="University of Technology" />
                      </InputField>

                      <InputField label="Department / Faculty" hint="e.g. Department of Computer Science">
                        <input value={form.department} onChange={set('department')} className={cls()} placeholder="Department of Computer Science" />
                      </InputField>

                      <InputField label="ORCID iD" error={errors.orcid} hint="Format: 0000-0000-0000-0000 — register free at orcid.org">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">ID</span>
                          <input
                            value={form.orcid}
                            onChange={set('orcid')}
                            className={cls(errors.orcid) + ' pl-14'}
                            placeholder="0000-0000-0000-0000"
                          />
                        </div>
                      </InputField>

                      <InputField label="Short Bio" hint="Optional — briefly describe your research interests (max 300 chars)">
                        <textarea
                          value={form.bio}
                          onChange={set('bio')}
                          maxLength={300}
                          rows={3}
                          className={cls() + ' resize-none'}
                          placeholder="Researcher in machine learning and computational neuroscience with a focus on…"
                        />
                        <p className="text-right text-xs text-gray-400 mt-1">{form.bio.length}/300</p>
                      </InputField>
                    </>
                  )}

                  {/* ── Step 3: Account Setup ── */}
                  {step === 3 && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </div>
                        <h2 className="font-bold text-gray-800">Account Credentials</h2>
                      </div>

                      {/* Profile summary card */}
                      <div className="bg-green-50 rounded-2xl p-4 border border-green-100 flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-base shrink-0">
                          {form.first_name?.[0]?.toUpperCase() || 'A'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{[form.first_name, form.last_name].filter(Boolean).join(' ') || 'Author Name'}</p>
                          <p className="text-xs text-gray-500">{form.institution || 'Institution'} {form.country ? `· ${form.country}` : ''}</p>
                          {form.orcid && <p className="text-xs text-green-700 font-medium mt-0.5">ORCID: {form.orcid}</p>}
                        </div>
                      </div>

                      <InputField label="Username" required error={errors.username} hint="Unique identifier for your account. Min 3 characters.">
                        <input value={form.username} onChange={set('username')} className={cls(errors.username)} placeholder="janesmith_ai" autoComplete="username" />
                      </InputField>

                      <div className="grid grid-cols-2 gap-3">
                        <InputField label="Password" required error={errors.password}>
                          <input type="password" value={form.password} onChange={set('password')} className={cls(errors.password)} placeholder="Min 8 characters" autoComplete="new-password" minLength={8} />
                        </InputField>
                        <InputField label="Confirm" required error={errors.confirm_password}>
                          <input type="password" value={form.confirm_password} onChange={set('confirm_password')} className={cls(errors.confirm_password)} placeholder="Repeat password" autoComplete="new-password" minLength={8} />
                        </InputField>
                      </div>

                      <label className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-green-50 transition-colors">
                        <input type="checkbox" required className="mt-0.5 w-4 h-4 accent-green-600" />
                        <p className="text-xs text-gray-600 leading-relaxed">
                          I agree to the <span className="text-green-700 font-semibold">Terms of Use</span> and <span className="text-green-700 font-semibold">Privacy Policy</span>. I confirm that all submitted information is accurate.
                        </p>
                      </label>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-7 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  {step > 1 ? (
                    <button type="button" onClick={() => { setErrors({}); setStep((s) => s - 1); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      Back
                    </button>
                  ) : (
                    <p className="text-xs text-gray-400">Step {step} of 3</p>
                  )}

                  {step < 3 ? (
                    <button type="button" onClick={next} className="flex items-center gap-1.5 px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl text-sm transition-colors">
                      Continue
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ) : (
                    <button type="submit" disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
                      {loading ? (
                        <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating account…</>
                      ) : 'Create Account'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">
              Your data is stored securely and never shared with third parties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
