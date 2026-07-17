import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { authorLogin } from '../api/authorAuth';

const STATS = [
  { value: '2,400+', label: 'Manuscripts Submitted' },
  { value: '18 days', label: 'Avg. Review Time' },
  { value: '94%', label: 'Author Satisfaction' },
  { value: 'Open', label: 'Access Policy' },
];

export default function AuthorLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = location.state?.registered;

  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authorLogin(email, password);
      navigate('/author-dashboard');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f7f0] flex">
      {/* Left Hero Panel */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between bg-gradient-to-br from-[#1B4332] via-[#2D6A4F] to-[#40916C] overflow-hidden p-12">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0C13.431 0 0 13.431 0 30c0 16.569 13.431 30 30 30 16.569 0 30-13.431 30-30C60 13.431 46.569 0 30 0zm0 54C16.745 54 6 43.255 6 30S16.745 6 30 6s24 10.745 24 24-10.745 24-24 24z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        {/* Top: Logo & Journal name */}
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

        {/* Research imagery */}
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

        {/* Middle: Feature highlights */}
        <div className="relative z-10 space-y-2.5">
          {[
            { icon: '⚡', title: 'AI-Assisted Review', desc: 'Automated format checks and reviewer matching within minutes' },
            { icon: '🔓', title: 'Open Access by Default', desc: 'CC BY 4.0 — free to read, share, and build upon' },
            { icon: '📊', title: 'Real-Time Tracking', desc: 'Follow your submission through every editorial stage' },
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

        {/* Bottom: Stats */}
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

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="font-bold text-green-900">Journal of Generative and Applied Intelligence Research</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Author Sign In</h2>
            <p className="text-gray-500 text-sm mt-1">
              New here?{' '}
              <Link to="/author-register" className="text-green-700 font-semibold hover:text-green-800">Create an account</Link>
            </p>
          </div>

          {justRegistered && (
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

          <form onSubmit={handleLogin} className="space-y-4">
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
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
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-green-50 rounded-2xl border border-green-100 text-sm text-gray-600">
            <p className="font-semibold text-gray-800 mb-1">First time submitting?</p>
            <p>Please <Link to="/author-register" className="text-green-700 font-semibold hover:underline">register your author profile</Link> first — then return here to sign in and upload your manuscript.</p>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            By signing in you agree to our{' '}
            <span className="text-green-700 cursor-pointer hover:underline">Terms of Use</span>
            {' '}and{' '}
            <span className="text-green-700 cursor-pointer hover:underline">Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
