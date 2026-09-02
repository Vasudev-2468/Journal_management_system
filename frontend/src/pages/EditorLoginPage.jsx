import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

// Editor login pipeline:
//   step 1 — credentials
//   step 2 — authenticator code (primary) — or the "Verify by email
//            instead" fallback link when the editor has lost app access
//   step 3 — email OTP (fallback path, or first-time enrolment path
//            when the editor has never paired an authenticator)
//   step 4 — authenticator setup (first-time enrolment only) —
//            gates on prior email verification for identity proof
export default function EditorLoginPage() {
  const navigate = useNavigate();
  // step values:
  //   'credentials' | 'totp_verify' | 'otp' | 'totp_enrol'
  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpEnrol, setTotpEnrol] = useState(null); // { secret, qr_data_uri, otpauth_uri }
  const [preAuthToken, setPreAuthToken] = useState('');
  const [maskedDest, setMaskedDest] = useState('');
  const [channel, setChannel] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set after a successful "Lost your recovery codes?" request so the
  // OTP screen switches to a "check your inbox" confirmation state
  // rather than showing the OTP form beneath a stale success banner.
  const [fallbackSent, setFallbackSent] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/editor-auth/login', { email, password });
      setPreAuthToken(data.pre_auth_token);
      // Backend hands us one of two stages depending on whether the
      // editor has an authenticator paired.
      if (data.stage === 'totp_needed') {
        setTotpCode('');
        setStep('totp_verify');
      } else {
        // 'email_otp_needed' — first-time enrolment path.
        setMaskedDest(data.masked_destination || '');
        setChannel(data.channel || 'email');
        if (data.dev_otp) setDevOtp(data.dev_otp);
        setOtp('');
        setStep('otp');
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setError(detail || (status ? `Server error (${status})` : 'Network error — is the backend running?'));
    } finally {
      setLoading(false);
    }
  };

  // "Can't access authenticator? Verify by email instead" — dispatches
  // an email OTP and switches to the OTP screen. From there the editor
  // types the code and lands directly in the dashboard (skipping TOTP
  // for this session).
  const handleRequestEmailFallback = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post(
        '/editor-auth/request-email-otp',
        {},
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      setMaskedDest(data.masked_destination || '');
      setChannel(data.channel || 'email');
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setOtp('');
      setStep('otp');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Could not send the email code.');
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
      if (data.access_token) {
        // Fallback path — editor was already enrolled, email verify
        // mints the session outright.
        localStorage.setItem('editor_token', data.access_token);
        localStorage.setItem('editor_mfa_verified', 'true');
        navigate('/editor', { replace: true });
        return;
      }
      // First-time enrolment path — email OTP cleared, now pair a device.
      setPreAuthToken(data.pre_auth_token);
      setTotpCode('');
      setDevOtp('');
      if (data.stage === 'totp_enrolment_needed') {
        setTotpEnrol({
          secret: data.totp_secret,
          qr_data_uri: data.totp_qr_data_uri,
          otpauth_uri: data.totp_otpauth_uri,
        });
        setStep('totp_enrol');
      } else {
        setTotpEnrol(null);
        setStep('totp_verify');
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setError(detail || (status ? `Server error (${status})` : 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleTotp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post(
        '/editor-auth/verify-totp',
        { code: totpCode },
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

  // "Lost your recovery codes?" — sends a signed magic link to the
  // editor's registered email so they can verify by email and get a
  // fresh set of recovery codes. Gated on the pre-auth token so a
  // bare email cannot trigger the mail.
  const handleRecoveryFallback = async () => {
    setError('');
    setLoading(true);
    try {
      await client.post(
        '/editor-auth/recovery-fallback/request',
        {},
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      setFallbackSent(true);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Could not start email verification.');
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

            {/* Compact stepper reflecting the reordered flow. Authenticator
                is the primary second factor; the email code slot lights
                up only when the editor takes the fallback path or is
                enrolling a device for the first time. */}
            {step !== 'credentials' && !fallbackSent && (
              <div className="flex items-center justify-center gap-2 mb-4" role="progressbar" aria-label="Sign-in progress">
                {[
                  { key: 'creds', label: 'Credentials', done: true, active: false },
                  {
                    key: 'totp',
                    label: 'Authenticator',
                    done: false,
                    active: step === 'totp_verify' || step === 'totp_enrol',
                  },
                  {
                    key: 'email',
                    label: 'Email code',
                    done: false,
                    active: step === 'otp',
                    // Muted until the editor actually opts into the email fallback,
                    // or first-time enrolment kicks it into the pipeline.
                    muted: step === 'totp_verify',
                  },
                ].map((s) => (
                  <React.Fragment key={s.key}>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        s.done
                          ? 'bg-emerald-500'
                          : s.active
                          ? 'bg-blue-600 ring-2 ring-blue-200'
                          : s.muted
                          ? 'bg-gray-200'
                          : 'bg-gray-300'
                      }`}
                      aria-label={s.label}
                    />
                    <span
                      className={`text-[11px] ${
                        s.active
                          ? 'text-gray-900 font-semibold'
                          : s.muted
                          ? 'text-gray-300'
                          : 'text-gray-500'
                      }`}
                    >
                      {s.label}
                    </span>
                    {s.key !== 'email' && <div className="w-4 h-px bg-gray-200" />}
                  </React.Fragment>
                ))}
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
            ) : step === 'totp_enrol' ? (
              <form onSubmit={handleTotp} className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">Set up authenticator</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Scan the QR code with Google Authenticator, Authy, 1Password,
                    or any RFC&nbsp;6238 app. This is a one-time setup.
                  </p>
                </div>
                {totpEnrol?.qr_data_uri && (
                  <div className="flex justify-center">
                    <img
                      src={totpEnrol.qr_data_uri}
                      alt="Authenticator setup QR code"
                      className="w-48 h-48 border border-gray-200 rounded-lg bg-white"
                    />
                  </div>
                )}
                {totpEnrol?.secret && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Can't scan? Type this secret in manually:</p>
                    <p className="font-mono text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 inline-block select-all break-all">
                      {totpEnrol.secret}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enter the 6-digit code from your app to finish setup
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ''))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm tracking-widest text-center font-mono"
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={10}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || totpCode.length < 6}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Confirm & sign in'}
                </button>
                <div className="text-[11px] text-gray-500 text-center">
                  Save this secret somewhere safe. If you lose access to the app
                  you'll need it (or a recovery code) to sign in again.
                </div>
              </form>
            ) : step === 'totp_verify' ? (
              <form onSubmit={handleTotp} className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">Authenticator code</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Open your authenticator app and enter the 6-digit code for
                    <span className="font-medium"> JGAIR Editor</span>.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    6-digit code
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ''))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm tracking-widest text-center font-mono"
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={10}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || totpCode.length < 6}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Verify & sign in'}
                </button>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <button type="button" onClick={() => setStep('credentials')} className="hover:text-gray-800">
                    ← Back
                  </button>
                </div>
                <div className="pt-3 border-t border-gray-100 text-center space-y-1.5">
                  <button
                    type="button"
                    onClick={handleRequestEmailFallback}
                    disabled={loading}
                    className="block w-full text-xs text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Can't access your authenticator? Verify by email instead
                  </button>
                  <button
                    type="button"
                    onClick={handleRecoveryFallback}
                    disabled={loading}
                    className="block w-full text-xs text-gray-500 hover:text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Lost your recovery codes? Get a magic link instead
                  </button>
                </div>
              </form>
            ) : fallbackSent ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Check your inbox</h2>
                <p className="text-sm text-gray-600">
                  If an editor account matches, a verification email is on
                  its way. Click the link inside to sign in and receive a
                  fresh set of recovery codes. The link stays valid for
                  <strong> 2 hours</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => { setFallbackSent(false); setError(''); }}
                  className="text-xs text-blue-700 hover:underline"
                >
                  ← Back to the code entry screen
                </button>
              </div>
            ) : (
              <form onSubmit={handleOtp} className="space-y-5">
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">Verify code</h2>
                  <p className="text-sm text-gray-500">
                    We sent a 6-digit code to <span className="font-mono">{maskedDest}</span>{' '}
                    ({channel}). You can also paste one of your recovery codes.
                  </p>
                  {devOtp && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                      Dev mode — OTP: <span className="font-mono font-bold">{devOtp}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    One-time code or recovery code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm tracking-widest text-center font-mono"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    placeholder="123456 or xxxx-xxxx-xxxx"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
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
                <div className="pt-3 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={handleRecoveryFallback}
                    disabled={loading}
                    className="text-xs text-gray-600 hover:text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Lost your recovery codes? Verify by email instead
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
