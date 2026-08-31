import client from './client';

// Author profile API — thin wrapper around the /author-auth endpoints used by
// AuthorProfileEditPage. The full session token in localStorage.author_token
// is attached automatically by client.ts's request interceptor for /author-*
// URLs, so callers pass no headers of their own.

export interface AuthorProfile {
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string;
    whatsapp_number: string | null;
    institution: string | null;
    department: string | null;
    orcid: string | null;
    research_areas: string | null;
    country: string | null;
    bio: string | null;
    profile_picture_url: string | null;
    mfa_email_verified?: boolean;
    mfa_whatsapp_verified?: boolean;
}

export const getProfile = async (): Promise<AuthorProfile> => {
    const res = await client.get('/author-auth/me');
    return res.data;
};

export interface UploadPictureResponse {
    message?: string;
    url: string;
}

export const uploadPicture = async (file: File): Promise<UploadPictureResponse> => {
    const fd = new FormData();
    fd.append('picture', file);
    // Let the browser set the multipart boundary — Content-Type is intentionally
    // omitted so the browser writes the correct `multipart/form-data; boundary=…`.
    const res = await client.post('/author-auth/profile/picture', fd);
    return res.data;
};

export const removePicture = async (): Promise<void> => {
    await client.delete('/author-auth/profile/picture');
};
