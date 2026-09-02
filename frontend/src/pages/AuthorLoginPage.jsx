import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authorLogin, authorVerifyOtp, authorResendOtp } from '../api/authorAuth';

const STATS = [
  { value: '2,400+', label: 'Manuscripts Submitted' },
  { value: '18 days', label: 'Avg. Review Time' },
  { value: '94%', label: 'Author Satisfaction' },
  { value: 'Open', label: 'Access Policy' },
];

// Author MFA — single-factor email OTP. TOTP + WhatsApp were both
// removed by request. Stage lifecycle:
//   credentials → emailOtp → done
export default function AuthorLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = location.state?.registered;

  const [stage, setStage] = useState('credentials');
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [maskedDest, setMaskedDest] = useState('');
  const [channel, setChannel] = useState('email');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const errorFrom = (err, fallback) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return fallback;
  };

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authorLogin(email, password);
      setPreAuthToken(data.pre_auth_token);
      setMaskedDest(data.masked_destination || '');
      setChannel(data.channel || 'email');
      setDevOtp(data.dev_otp || '');
      setOtp('');
      setStage('emailOtp');
    } catch (err) {
      setError(errorFrom(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const applyNextStage = (data) => {
    // Email-OTP-only flow — the backend now mints the session as soon
    // as the email code verifies. Save the session token, then land
    // on the author dashboard. Any legacy ``totp_*`` / ``whatsapp_*``
    // stage that arrives is treated as a completed sign-in if the
    // response carries an access_token, otherwise it's an error.
    if (data.access_token && data.token_type !== 'pre_auth') {
      try {
        localStorage.setItem('author_token', data.access_token);
      } catch { /* private mode */ }
    }
    if (data.stage === 'complete' || (data.access_token && data.token_type !== 'pre_auth')) {
      navigate('/author-dashboard');
      return;
    }
    // Unknown stage from a backend on a different version — surface it
    // rather than silently succeed.
    setError(`Unexpected server response: ${data.stage}`);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authorVerifyOtp(preAuthToken, otp);
      applyNextStage(data);
    } catch (err) {
      setError(errorFrom(err, 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await authorResendOtp(preAuthToken);
      setMaskedDest(data.masked_destination || maskedDest);
      setChannel(data.channel || channel);
      setDevOtp(data.dev_otp || '');
    } catch (err) {
      setError(errorFrom(err, 'Could not resend the code.'));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setOtp('');
    setError('');
    if (stage === 'emailOtp') setStage('credentials');
  };

  // Stage indices for the stepper. Two steps only now — the
  // Authenticator step was removed on request.
  const steps = ['Credentials', 'Email code'];
  const stageIdx = {
    credentials: 0,
    emailOtp: 1,
  }[stage] ?? 0;

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6" role="progressbar" aria-label="Sign-in progress">
      {steps.map((label, i) => {
        const state = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'todo';
        return (
          <React.Fragment key={label}>
            <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
              state === 'done' ? 'bg-green-700 text-white'
              : state === 'active' ? 'bg-green-100 text-green-800 ring-2 ring-green-500'
              : 'bg-gray-100 text-gray-400'
            }`}>{state === 'done' ? '✓' : i + 1}</div>
            <span className={`text-xs ${state === 'active' ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>{label}</span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f7f0] flex">
      {/* Left Hero Panel — unchanged */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between bg-gradient-to-br from-[#1B4332] via-[#2D6A4F] to-[#40916C] overflow-hidden p-12">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0C13.431 0 0 13.431 0 30c0 16.569 13.431 30 30 30 16.569 0 30-13.431 30-30C60 13.431 46.569 0 30 0zm0 54C16.745 54 6 43.255 6 30S16.745 6 30 6s24 10.745 24 24-10.745 24-24 24z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">Journal of Generative and Applied Intelligence Research</p>
              <p className="text-green-300 text-xs mt-0.5">Open Access · Peer Reviewed</p>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Share your research<br />with the world.
          </h1>
          <p className="text-green-200 text-base leading-relaxed max-w-md">
            Submit your manuscript to our AI-assisted editorial pipeline. Fast, transparent, and fully open-access — your work reaches readers worldwide within weeks.
          </p>
        </div>

        <div className="relative z-10 rounded-3xl overflow-hidden shadow-2xl border border-white/10 mb-4">
          <img
            src="https://images.unsplash.com/photo-1606761568499-6d2451b23c66?auto=format&fit=crop&w=900&q=80"
            alt="Researcher working"
            className="w-full h-40 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1B4332]/80 to-transparent flex items-end p-4">
            <p className="text-white text-xs font-medium italic">"Science progresses one published paper at a time."</p>
          </div>
        </div>

        <div className="relative z-10 space-y-2.5">
          {[
            { icon: '⚡', title: 'AI-Assisted Review', desc: 'Automated format checks and reviewer matching within minutes' },
            { icon: '🔓', title: 'Open Access by Default', desc: 'CC BY 4.0 — free to read, share, and build upon' },
            { icon: '🛡️', title: 'Two-Step Sign-In', desc: 'Every session confirmed on the channels you registered' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
              <span className="text-lg shrink-0">{item.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm">{item.title}</p>
                <p className="text-green-200 text-xs mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10">
          <div className="grid grid-cols-4 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-white font-bold text-xl">{s.value}</p>
                <p className="text-green-300 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Auth Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="font-bold text-green-900">Journal of Generative and Applied Intelligence Research</p>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {stage === 'credentials' && 'Author Sign In'}
              {stage === 'emailOtp' && 'Confirm your email'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {stage === 'credentials' && (
                <>
                  New here?{' '}
                  <Link to="/author-register" className="text-green-700 font-semibold hover:text-green-800">Create an account</Link>
                </>
              )}
              {stage === 'emailOtp' && (
                <>We sent a 6-digit code to <span className="font-mono text-gray-700">{maskedDest}</span> ({channel}).</>
              )}
            </p>
          </div>

          {stage !== 'credentials' && stepIndicator}

          {justRegistered && stage === 'credentials' && (
            <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-800 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Registration successful! Sign in below to access the submission portal.
            </div>
          )}

          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {error}
            </div>
          )}

          {devOtp && stage !== 'credentials' && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              Dev mode — OTP: <span className="font-mono font-bold text-sm">{devOtp}</span>
            </div>
          )}

          {stage === 'credentials' && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 focus:bg-white"
                  placeholder="jane@university.edu"
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Password</label>
                  <Link
                    to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                    className="text-xs font-semibold text-green-700 hover:text-green-800 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 focus:bg-white"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-green-700 hover:bg-green-800 active:bg-green-900 px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Sending code…
                  </>
                ) : 'Continue'}
              </button>
            </form>
          )}

          {(stage === 'emailOtp' || stage === 'whatsappOtp') && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">One-time code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center font-mono text-lg tracking-widest text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 focus:bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full rounded-2xl bg-green-700 hover:bg-green-800 active:bg-green-900 px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </>
                ) : stage === 'whatsappOtp' ? 'Verify & sign in' : 'Verify & continue'}
              </button>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <button type="button" onClick={goBack} className="hover:text-gray-800">← Back</button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-green-700 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {stage === 'credentials' && (
            <div className="mt-6 p-4 bg-green-50 rounded-2xl border border-green-100 text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">First time submitting?</p>
              <p>Please <Link to="/author-register" className="text-green-700 font-semibold hover:underline">register your author profile</Link> first — then return here to sign in and upload your manuscript.</p>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            By signing in you agree to our{' '}
            <Link to="/copyright" className="text-green-700 hover:underline">Terms of Use</Link>
            {' '}and our{' '}
            <span className="text-green-700 cursor-pointer hover:underline">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
