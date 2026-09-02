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
    // Editor-managed reviewer directory (POST /reviewers/invite, PATCH
    // /reviewers/:id, GET /reviewers/suggest/…). All of these require an
    // editor session; the sole public route is POST /reviewers/register
    // which happily ignores an attached Bearer.
    // Routed BEFORE the /reviewer prefixes below so the plural form is
    // not intercepted by the reviewer-token branch.
    if (u.startsWith('/reviewers/') || u === '/reviewers') {
        return localStorage.getItem('editor_token');
    }
    // Editorial board CRUD lives at /board/*. GET is public (used by
    // the marketing /editorial-board page) but POST/PATCH/DELETE
    // require editor MFA — attach the editor token on every /board
    // call and let the backend ignore it on the public GETs.
    if (u.startsWith('/board/') || u === '/board') {
        return localStorage.getItem('editor_token');
    }
    // Production queue (/production/queue, /production/{id}, …) is
    // fully editor-gated. The public read surface lives under
    // /production-public/* so this prefix is safe to bind unconditionally.
    if (u.startsWith('/production/') || u === '/production') {
        return localStorage.getItem('editor_token');
    }
    // Editor-owned admin surfaces. Every prefix below has the same
    // shape: the write side needs an editor MFA session, the public
    // read side (when it exists) lives under a distinct
    // *-public / marketing route. Attaching the editor Bearer on the
    // public read paths is harmless — FastAPI ignores an unused Bearer
    // on unauthed endpoints — so we bind the whole prefix unconditionally.
    const EDITOR_ADMIN_PREFIXES = [
        '/contact/',
        '/announcements/',
        '/policies/',
        '/audit-logs/',
        '/references/',
        '/email-templates/',
        '/special-issues/',
        '/users-admin/',
        '/publication/',
        '/crossref/',
        '/permissions/',
    ];
    // ``/submissions/`` is shared between authors and editors — keep
    // the existing author-token routing for that prefix. Editor-only
    // sub-endpoints (e.g. /submissions/{id}/decision-briefing) attach
    // their editor Bearer at the call site.
    for (const p of EDITOR_ADMIN_PREFIXES) {
        if (u.startsWith(p) || u === p.slice(0, -1)) {
            return localStorage.getItem('editor_token');
        }
    }
    // Reviewer session: persistent reviewer account (JG reviewer-auth).
    // Routed BEFORE the /author- branch so /reviewer-auth/* is never
    // reached by the author fallthrough. /reviewer/* covers any future
    // reviewer-scoped endpoints. The per-review token flow at
    // /reviews/access/:token stays anonymous — it does not match here.
    if (
        u.startsWith('/reviewer-auth') ||
        u.startsWith('/reviewer/') ||
        u.startsWith('/reviewer-portal')
    ) {
        return localStorage.getItem('reviewer_token');
    }
    // R9 — /articles POST/PUT is authenticated: authors POST to publish
    // (author_id fills from get_current_user), editors PATCH/DELETE via the
    // editor gate. Either role's token is acceptable — prefer the author
    // token for a session that has one (matches the "current identity"
    // most consumers expect), else fall back to the editor token so
    // editor-only mutations still authenticate. Legacy /submissions/* and
    // /author-*/ stay author-only.
    if (
        u.startsWith('/author-') ||
        u.startsWith('/author-revision') ||
        u.startsWith('/submissions')
    ) {
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
            if (
                url.startsWith('/editor-') ||
                url.startsWith('/editor/') ||
                url.startsWith('/reviewers/') ||
                url === '/reviewers' ||
                url.startsWith('/board/') ||
                url === '/board' ||
                url.startsWith('/production/') ||
                url === '/production' ||
                url.startsWith('/contact/') ||
                url === '/contact' ||
                url.startsWith('/announcements/') ||
                url === '/announcements' ||
                url.startsWith('/policies/') ||
                url === '/policies' ||
                url.startsWith('/audit-logs/') ||
                url === '/audit-logs' ||
                url.startsWith('/references/') ||
                url === '/references' ||
                url.startsWith('/email-templates/') ||
                url === '/email-templates' ||
                url.startsWith('/special-issues/') ||
                url === '/special-issues' ||
                url.startsWith('/users-admin/') ||
                url === '/users-admin' ||
                url.startsWith('/publication/') ||
                url === '/publication' ||
                url.startsWith('/crossref/') ||
                url === '/crossref' ||
                url.startsWith('/permissions/') ||
                url === '/permissions'
            ) {
                localStorage.removeItem('editor_token');
                localStorage.removeItem('editor_mfa_verified');
            } else if (
                url.startsWith('/reviewer-auth') ||
                url.startsWith('/reviewer/') ||
                url.startsWith('/reviewer-portal')
            ) {
                localStorage.removeItem('reviewer_token');
            } else if (url.startsWith('/author-') || url.startsWith('/submissions')) {
                localStorage.removeItem('author_token');
            }
        }
        return Promise.reject(error);
    },
);

export default client;
