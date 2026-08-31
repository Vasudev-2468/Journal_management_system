import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

// Editor login is a two-step flow (JG-fix B1):
//   step 1 — email + password → server generates + sends an OTP; response
//            carries a short-lived pre-auth token
//   step 2 — enter OTP → server mints the full session JWT with mfa_verified
export default function EditorLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [maskedDest, setMaskedDest] = useState('');
  const [channel, setChannel] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/editor-auth/login', { email, password });
      setPreAuthToken(data.pre_auth_token);
      setMaskedDest(data.masked_destination || '');
      setChannel(data.channel || 'email');
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setStep('otp');
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setError(detail || (status ? `Server error (${status})` : 'Network error — is the backend running?'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post(
        '/editor-auth/verify-otp',
        { otp },
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      localStorage.setItem('editor_token', data.access_token);
      localStorage.setItem('editor_mfa_verified', 'true');
      navigate('/editor', { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setError(detail || (status ? `Server error (${status})` : 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post(
        '/editor-auth/resend-otp',
        {},
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      setMaskedDest(data.masked_destination || maskedDest);
      setChannel(data.channel || channel);
      if (data.dev_otp) setDevOtp(data.dev_otp);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Could not resend the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Editor Portal</h1>
          <p className="text-blue-300 text-sm mt-1">Authorized access only</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <span className="mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {step === 'credentials' ? (
              <form onSubmit={handleCredentials} className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">Sign In</h2>
                  <p className="text-sm text-gray-500">Enter your editor credentials</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtp} className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">Verify code</h2>
                  <p className="text-sm text-gray-500">
                    We sent a 6-digit code to <span className="font-mono">{maskedDest}</span>{' '}
                    ({channel}).
                  </p>
                  {devOtp && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                      Dev mode — OTP: <span className="font-mono font-bold">{devOtp}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">One-time code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm tracking-widest text-center font-mono"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Verify & Sign In'}
                </button>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <button type="button" onClick={() => setStep('credentials')} className="hover:text-gray-800">
                    ← Back
                  </button>
                  <button type="button" onClick={handleResendOtp} disabled={loading} className="text-blue-700 hover:underline disabled:opacity-50">
                    Resend code
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>🛡️</span>
              <span>Access is restricted to authorized editors only. All activity is logged.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
