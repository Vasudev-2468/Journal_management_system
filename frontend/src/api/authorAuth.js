import client from './client';

const TOKEN_KEY = 'author_token';

// ── Token management ──────────────────────────────────

export const getAuthorToken = () => localStorage.getItem(TOKEN_KEY);

export const setAuthorToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const clearAuthorToken = () => localStorage.removeItem(TOKEN_KEY);

const authHeaders = () => {
  const token = getAuthorToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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

// ── 2. Login (credentials → temp token) ─────────────────

export const authorLogin = async (email, password) => {
  const res = await client.post('/author-auth/login', { email, password });
  const { access_token } = res.data;
  setAuthorToken(access_token);
  return res.data;
};

// ── 3. Send OTP and verify OTP are currently disabled for authors.

// ── 5. Get profile ──────────────────────────────────────

export const getAuthorProfile = async () => {
  const token = getAuthorToken();
  if (!token) return null;
  try {
    const res = await client.get('/author-auth/me', { headers: authHeaders() });
    return res.data;
  } catch {
    return null;
  }
};

// ── 6. Update profile ──────────────────────────────────

export const updateAuthorProfile = async (data) => {
  const res = await client.patch('/author-auth/profile', data, { headers: authHeaders() });
  return res.data;
};

export const uploadProfilePicture = async (file) => {
  const fd = new FormData();
  fd.append('picture', file);
  const res = await client.post('/author-auth/profile/picture', fd, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ── 7. Logout ───────────────────────────────────────────

export const authorLogout = () => {
  clearAuthorToken();
};
