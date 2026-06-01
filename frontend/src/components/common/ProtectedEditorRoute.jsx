import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import client from '../../api/client';

// Cache the last successful verification to avoid redundant API calls
let lastVerifiedToken = null;
let lastVerifiedAt = 0;
const VERIFY_CACHE_MS = 60_000; // re-verify at most once per minute

export default function ProtectedEditorRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const location = useLocation();
  const verifyingRef = useRef(false);

  useEffect(() => {
    // Prevent StrictMode double-fire
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    const verify = async () => {
      const token = localStorage.getItem('editor_token');
      const mfaFlag = localStorage.getItem('editor_mfa_verified');

      if (!token || mfaFlag !== 'true') {
        setAuthorized(false);
        setChecking(false);
        verifyingRef.current = false;
        return;
      }

      // Use cached result if same token verified recently
      if (token === lastVerifiedToken && Date.now() - lastVerifiedAt < VERIFY_CACHE_MS) {
        setAuthorized(true);
        setChecking(false);
        verifyingRef.current = false;
        return;
      }

      try {
        await client.get('/editor-auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        lastVerifiedToken = token;
        lastVerifiedAt = Date.now();
        setAuthorized(true);
      } catch {
        localStorage.removeItem('editor_token');
        localStorage.removeItem('editor_mfa_verified');
        lastVerifiedToken = null;
        setAuthorized(false);
      } finally {
        setChecking(false);
        verifyingRef.current = false;
      }
    };

    verify();
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to="/editor-login" state={{ from: location }} replace />;
  }

  return children;
}
