import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import client from '../../api/client';

// Author-side mirror of ProtectedEditorRoute (JG-fix F2).
// The prior /submit and /author-dashboard routes let the page render one
// frame before manual redirect; SubmitPaper did not redirect at all and
// happily uploaded PDFs from anonymous sessions. This guard blocks render
// until a valid author token is verified.

let lastVerifiedToken = null;
let lastVerifiedAt = 0;
const VERIFY_CACHE_MS = 60_000;

export default function ProtectedAuthorRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const location = useLocation();
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    const verify = async () => {
      const token = localStorage.getItem('author_token');
      if (!token) {
        setAuthorized(false);
        setChecking(false);
        verifyingRef.current = false;
        return;
      }

      if (token === lastVerifiedToken && Date.now() - lastVerifiedAt < VERIFY_CACHE_MS) {
        setAuthorized(true);
        setChecking(false);
        verifyingRef.current = false;
        return;
      }

      try {
        await client.get('/author-auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        lastVerifiedToken = token;
        lastVerifiedAt = Date.now();
        setAuthorized(true);
      } catch {
        localStorage.removeItem('author_token');
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
    return <Navigate to="/author-login" state={{ from: location }} replace />;
  }

  return children;
}
