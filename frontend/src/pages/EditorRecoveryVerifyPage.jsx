import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';

// Landing page for the "Lost your recovery codes? Verify by email" flow.
// The URL is /editor-recovery-verify?token=<jwt> — the token is minted
// by /editor-auth/recovery-fallback/request and emailed to the editor.
// On mount we POST it to /editor-auth/recovery-fallback/verify: on
// success we get back a full session JWT AND a fresh set of recovery
// codes (the old set is voided on the server). The codes are shown
// exactly once here so the editor can bank them before continuing to
// the portal.
export default function EditorRecoveryVerifyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);

  const [state, setState] = useState('verifying'); // verifying | ready | error
  const [error, setError] = useState('');
  const [codes, setCodes] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This link is missing the required token.');
      setState('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await client.post(
          '/editor-auth/recovery-fallback/verify',
          { token },
        );
        if (cancelled) return;
        // Stash the session immediately — the editor is signed in from
        // this point. We keep them on this page until they confirm
        // they've saved the codes so the plaintext isn't lost to a
        // back-button click.
        localStorage.setItem('editor_token', data.access_token);
        localStorage.setItem('editor_mfa_verified', 'true');
        setCodes(Array.isArray(data.recovery_codes) ? data.recovery_codes : []);
        setGeneratedAt(data.recovery_codes_generated_at);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        setError(
          detail ||
            'We could not verify this link. Please start the recovery flow again.',
        );
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
    } catch {
      // clipboard blocked — user can still hand-copy from the list.
    }
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        'JGAIR Editor Portal — recovery codes\n',
        generatedAt ? `Generated at ${generatedAt}\n\n` : '\n',
        codes.map((c) => `${c}\n`).join(''),
        '\nEach code can be used ONCE to complete the MFA challenge.\n',
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jgair-editor-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Recovery verification</h1>
          <p className="text-blue-300 text-sm mt-1">Editor Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden p-8">
          {state === 'verifying' && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-600">Verifying your link…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                We couldn't verify this link
              </h2>
              <p className="text-sm text-gray-600">{error}</p>
              <Link
                to="/editor-login"
                className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {state === 'ready' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                  <span className="text-2xl">✅</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Save your new recovery codes
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Any old codes no longer work. Store these somewhere
                  safe — they're shown only once.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {codes.map((code) => (
                  <div key={code} className="tracking-wide text-gray-800">
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Download .txt
                </button>
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                  I've saved these codes somewhere safe. I understand
                  they will not be shown again.
                </span>
              </label>

              <button
                type="button"
                disabled={!acknowledged}
                onClick={() => navigate('/editor', { replace: true })}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue to Editor Portal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
