import client from './client';

// Persistent reviewer account — /reviewer-auth backend router.
// The token lives in localStorage under 'reviewer_token'; client.ts routes
// every /reviewer-auth/* and /reviewer/* request through it automatically.
//
// The per-review token flow at /review/:token stays intact — /reviews/access
// and /reviews/submit remain anonymous (no Authorization header sent).

const TOKEN_KEY = 'reviewer_token';

export const getReviewerToken = (): string | null =>
    localStorage.getItem(TOKEN_KEY);

export const setReviewerToken = (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearReviewerToken = (): void => {
    localStorage.removeItem(TOKEN_KEY);
};

export interface ReviewerMe {
    id: string;
    name: string;
    email: string;
    institution?: string | null;
    whatsapp_number?: string | null;
    expertise_tags: string[];
    max_assignments: number;
    current_load: number;
    is_active: boolean;
    email_verified_at?: string | null;
    last_login_at?: string | null;
    created_at: string;
}

export interface Assignment {
    review_id: string;
    submission_id: string;
    paper_title: string;
    status: 'pending' | 'completed' | 'expired' | string;
    deadline?: string | null;
    assigned_at: string;
    completed_at?: string | null;
    link_token?: string | null;
    link_valid: boolean;
    review_url?: string | null;
}

export interface LoginResponse {
    access_token: string;
    reviewer_id: string;
    token_type: string;
}

// ── Login (email + password → session token) ────────────
//
// The backend uses the OAuth2 password form (username=email), so we send
// application/x-www-form-urlencoded rather than JSON.
export const login = async (email: string, password: string): Promise<LoginResponse> => {
    const form = new URLSearchParams();
    form.set('username', email);
    form.set('password', password);
    const res = await client.post<LoginResponse>('/reviewer-auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (res.data?.access_token) {
        setReviewerToken(res.data.access_token);
    }
    return res.data;
};

// ── Current reviewer ────────────────────────────────────
export const getMe = async (): Promise<ReviewerMe> => {
    const res = await client.get<ReviewerMe>('/reviewer-auth/me');
    return res.data;
};

// ── Sign out ────────────────────────────────────────────
export const logout = (): void => {
    clearReviewerToken();
};

// ── My assignments ──────────────────────────────────────
export const fetchMyAssignments = async (): Promise<Assignment[]> => {
    const res = await client.get<Assignment[]>('/reviewer-auth/my-assignments');
    return res.data;
};

// ── Set password from a signed invitation token ─────────
export interface SetPasswordResponse {
    reviewer_id: string;
    message: string;
}

export const setPassword = async (
    token: string,
    newPassword: string,
): Promise<SetPasswordResponse> => {
    const res = await client.post<SetPasswordResponse>('/reviewer-auth/set-password', {
        token,
        new_password: newPassword,
    });
    return res.data;
};
