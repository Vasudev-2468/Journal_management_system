import client from './client';

// Author auth — real two-step MFA (matches the /author-auth backend router).
// Flow:
//   1. authorLogin(email, password)
//        → { pre_auth_token, has_whatsapp, masked_destination, dev_otp? }
//   2. authorVerifyOtp(pre_auth_token, otp)
//        → either { stage: 'complete', access_token }        (finished)
//          or     { stage: 'whatsapp_needed', masked_destination, dev_otp? }
//   3. authorVerifyOtp(pre_auth_token, otp)   ← same call, second OTP
//        → { stage: 'complete', access_token }
//
// The pre_auth_token is used ONLY on /verify-otp and /resend-otp; every other
// author endpoint requires the full session token (author_token in
// localStorage). client.ts already routes /author-* through author_token so
// consumers don't need to pass it explicitly.

const TOKEN_KEY = 'author_token';

export const getAuthorToken = () => localStorage.getItem(TOKEN_KEY);
export const setAuthorToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearAuthorToken = () => localStorage.removeItem(TOKEN_KEY);


// ── 1. Register ─────────────────────────────────────────

export const registerAuthor = async (data) => {
  const res = await client.post('/auth/register', {
    username: data.username,
    email: data.email,
    password: data.password,
    full_name: data.full_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined,
    first_name: data.first_name,
    last_name: data.last_name,
    whatsapp_number: data.whatsapp_number || undefined,
    institution: data.institution,
    orcid: data.orcid || undefined,
    country: data.country || undefined,
    department: data.department || undefined,
    bio: data.bio || undefined,
  });
  return res.data;
};


// ── 2. Login (credentials → pre-auth token + email OTP dispatched) ──

export const authorLogin = async (email, password) => {
  const res = await client.post('/author-auth/login', { email, password });
  // Do NOT setAuthorToken here — the token in localStorage must always be a
  // FULL session token. The pre-auth is short-lived and only used by the
  // login UI to complete the OTP steps.
  return res.data;
};


// ── 3. Verify email/WhatsApp OTP (cascades to TOTP or WhatsApp or session) ──

export const authorVerifyOtp = async (preAuthToken, otp) => {
  const res = await client.post(
    '/author-auth/verify-otp',
    { otp },
    { headers: { Authorization: `Bearer ${preAuthToken}` } },
  );
  // Only store the FULL session token (stage=complete). The pre-auth
  // token that follows the TOTP step carries a totp_ok claim and is
  // still short-lived — we treat it the same way.
  if (res.data?.stage === 'complete' && res.data?.access_token) {
    setAuthorToken(res.data.access_token);
  }
  return res.data;
};


// ── 3b. Verify TOTP code (authenticator app) ────────────

export const authorVerifyTotp = async (preAuthToken, code) => {
  const res = await client.post(
    '/author-auth/verify-totp',
    { code },
    { headers: { Authorization: `Bearer ${preAuthToken}` } },
  );
  if (res.data?.stage === 'complete' && res.data?.access_token) {
    setAuthorToken(res.data.access_token);
  }
  return res.data;
};


// ── 4. Resend the current-stage OTP ─────────────────────

export const authorResendOtp = async (preAuthToken) => {
  const res = await client.post(
    '/author-auth/resend-otp',
    {},
    { headers: { Authorization: `Bearer ${preAuthToken}` } },
  );
  return res.data;
};


// ── 5. Get profile (requires full session) ──────────────

export const getAuthorProfile = async () => {
  const token = getAuthorToken();
  if (!token) return null;
  try {
    const res = await client.get('/author-auth/me');
    return res.data;
  } catch {
    return null;
  }
};


// ── 6. Update profile ──────────────────────────────────

export const updateAuthorProfile = async (data) => {
  const res = await client.patch('/author-auth/profile', data);
  return res.data;
};

export const uploadProfilePicture = async (file) => {
  const fd = new FormData();
  fd.append('picture', file);
  const res = await client.post('/author-auth/profile/picture', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};


// ── 7. Logout ──────────────────────────────────────────

export const authorLogout = () => {
  clearAuthorToken();
};
