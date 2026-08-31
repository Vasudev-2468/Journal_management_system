import axios from 'axios';
// AxiosRequestConfig is exported in all axios majors — safer than the
// InternalAxiosRequestConfig which arrived in 1.x. The interceptor callback
// gets whatever axios's runtime hands it either way.

// The API base MUST be provided at build time in production. In dev we fall
// back to localhost. The prior silent-empty default let a mis-configured
// production build ship pointing at the browser's own origin.
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const client = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// JG-fix F5 — pick the auth token by URL prefix instead of falling back
// through editor → author → regular. On a shared browser the prior order
// silently sent the editor's Bearer to author endpoints, causing wrong-role
// requests and privilege confusion.
function tokenForUrl(url: string | undefined): string | null {
    const u = url || '';
    if (u.startsWith('/editor-') || u.startsWith('/editor/')) {
        return localStorage.getItem('editor_token');
    }
    // Reviewer session: persistent reviewer account (JG reviewer-auth).
    // Routed BEFORE the /author- branch so /reviewer-auth/* is never
    // reached by the author fallthrough. /reviewer/* covers any future
    // reviewer-scoped endpoints. The per-review token flow at
    // /reviews/access/:token stays anonymous — it does not match here.
    if (u.startsWith('/reviewer-auth') || u.startsWith('/reviewer/')) {
        return localStorage.getItem('reviewer_token');
    }
    // R9 — /articles POST/PUT is authenticated: authors POST to publish
    // (author_id fills from get_current_user), editors PATCH/DELETE via the
    // editor gate. Either role's token is acceptable — prefer the author
    // token for a session that has one (matches the "current identity"
    // most consumers expect), else fall back to the editor token so
    // editor-only mutations still authenticate. Legacy /submissions/* and
    // /author-*/ stay author-only.
    if (u.startsWith('/author-') || u.startsWith('/submissions')) {
        return localStorage.getItem('author_token');
    }
    // JG-U — /uploads/* is a generic authenticated upload endpoint used by
    // both the author revision UI and the initial-submission wizard. Route
    // it through whichever role token the browser has (author first, since
    // that's the common case), so the FileDropzone stays framework-free
    // and doesn't need to know which page mounted it.
    if (u.startsWith('/uploads')) {
        return (
            localStorage.getItem('author_token') ||
            localStorage.getItem('editor_token') ||
            localStorage.getItem('token')
        );
    }
    if (u.startsWith('/articles')) {
        return (
            localStorage.getItem('author_token') ||
            localStorage.getItem('editor_token') ||
            localStorage.getItem('token')
        );
    }
    // Fallback: generic session token. Covers /reviews/access/:token
    // (unauthenticated by design) and any future unauthed endpoint.
    return localStorage.getItem('token');
}

client.interceptors.request.use(
    (config: any) => {
        if (config.headers && !config.headers.Authorization) {
            const token = tokenForUrl(config.url);
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error),
);

client.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 403 && error.response?.headers?.['x-mfa-required']) {
            localStorage.removeItem('editor_token');
            localStorage.removeItem('editor_mfa_verified');
            window.location.href = '/editor-login';
        }
        if (error.response?.status === 401) {
            const url = error.config?.url || '';
            if (url.startsWith('/editor-') || url.startsWith('/editor/')) {
                localStorage.removeItem('editor_token');
                localStorage.removeItem('editor_mfa_verified');
            } else if (url.startsWith('/reviewer-auth') || url.startsWith('/reviewer/')) {
                localStorage.removeItem('reviewer_token');
            } else if (url.startsWith('/author-') || url.startsWith('/submissions')) {
                localStorage.removeItem('author_token');
            }
        }
        return Promise.reject(error);
    },
);

export default client;
