import client from './client';

export type BoardCategory =
    | 'editor_in_chief'
    | 'associate_editor'
    | 'managing_editor'
    | 'section_editor'
    | 'board_member'
    | 'advisory'
    | 'technical';

export interface BoardInvitationLink {
    member_id: number;
    invitation_url: string;
    expires_at: string;
}

export interface BoardMember {
    id: number;
    name: string;
    role: string;
    category: BoardCategory;
    affiliation: string | null;
    department: string | null;
    country: string | null;
    email: string | null;
    orcid: string | null;
    scholar_url: string | null;
    scopus_id: string | null;
    institutional_profile_url: string | null;
    qualifications: string | null;
    bio: string | null;
    expertise: string | null;
    photo_url: string | null;
    phone: string | null;
    keywords: string | null;
    years_editorial_experience: number | null;
    max_active_manuscripts: number | null;
    photo_file_url: string | null;
    resume_file_url: string | null;
    certification_files: Array<{ file_url: string; filename: string }> | null;
    sort_order: number;
    is_active: boolean;
    invited_email?: string | null;
    invitation_sent_at?: string | null;
    invitation_completed_at?: string | null;
    invitation_revoked_at?: string | null;
}

export interface CvParseResult {
    fields: Partial<Omit<BoardMember, 'id'>>;
    extracted_field_count: number;
    characters_read: number;
}

export const CATEGORY_LABELS: Record<BoardCategory, string> = {
    editor_in_chief: 'Editor-in-Chief',
    associate_editor: 'Associate Editors',
    managing_editor: 'Managing Editor',
    section_editor: 'Section Editors',
    board_member: 'Editorial Board Members',
    advisory: 'Advisory Board',
    technical: 'Technical / Production Team',
};

export const CATEGORY_ORDER: BoardCategory[] = [
    'editor_in_chief',
    'associate_editor',
    'managing_editor',
    'section_editor',
    'board_member',
    'advisory',
    'technical',
];

const BASE = '/board';

export const fetchBoardMembers = async (
    include_inactive = false,
    category?: BoardCategory,
): Promise<BoardMember[]> => {
    const params: Record<string, unknown> = { include_inactive };
    if (category) params.category = category;
    const response = await client.get(`${BASE}/`, { params });
    return response.data;
};

export const fetchBoardMember = async (id: number | string): Promise<BoardMember> => {
    const response = await client.get(`${BASE}/${id}`);
    return response.data;
};

export const createBoardMember = async (
    payload: Omit<BoardMember, 'id'>,
): Promise<BoardMember> => {
    const response = await client.post(`${BASE}/`, payload);
    return response.data;
};

export const updateBoardMember = async (
    id: number,
    payload: Partial<Omit<BoardMember, 'id'>>,
): Promise<BoardMember> => {
    const response = await client.patch(`${BASE}/${id}`, payload);
    return response.data;
};

export const deleteBoardMember = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};

export const parseBoardMemberCv = async (file: File): Promise<CvParseResult> => {
    const form = new FormData();
    form.append('file', file);
    const response = await client.post(`${BASE}/parse-cv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Extraction hits OpenAI — allow a longer ceiling than the 10 s
        // default so a large CV doesn't time out mid-inference.
        timeout: 60_000,
    });
    return response.data;
};

// ── Invitation lifecycle (editor-only) ──────────────────

export interface BoardInvitePayload {
    name: string;
    email: string;
    category: BoardCategory;
    role: string;
}

export interface BoardInviteResult {
    member_id: number;
    invited_email: string;
    email_sent: boolean;
    message: string;
}

export const inviteBoardMember = (payload: BoardInvitePayload): Promise<BoardInviteResult> =>
    client.post(`${BASE}/invite`, payload).then((r) => r.data);

export const resendBoardInvitation = (memberId: number): Promise<BoardInviteResult> =>
    client.post(`${BASE}/invite/${memberId}/resend`).then((r) => r.data);

export const revokeBoardInvitation = (memberId: number): Promise<{ ok: boolean }> =>
    client.post(`${BASE}/invite/${memberId}/revoke`).then((r) => r.data);

export const getBoardInvitationLink = (memberId: number): Promise<BoardInvitationLink> =>
    client.get(`${BASE}/invite/${memberId}/link`).then((r) => r.data);

// ── Public complete-profile flow (unauthenticated) ──────

export interface BoardInvitePrefill {
    member_id: number;
    name: string;
    email: string;
    category: BoardCategory;
    role: string;
    invitation_expires_at?: string | null;
}

export interface BoardFileUpload {
    file_url: string;
    filename: string;
    size: number;
}

export const fetchBoardInvitePrefill = (token: string): Promise<BoardInvitePrefill> =>
    client.get(`${BASE}/complete-profile/${token}`).then((r) => r.data);

export const submitBoardProfile = (
    token: string,
    payload: Partial<Omit<BoardMember, 'id'>>,
): Promise<{ ok: boolean; message: string }> =>
    client.post(`${BASE}/complete-profile/${token}`, payload).then((r) => r.data);

export const uploadBoardFileAsEditor = (file: File): Promise<BoardFileUpload> => {
    const form = new FormData();
    form.append('file', file);
    return client
        .post(`${BASE}/upload-file`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60_000,
        })
        .then((r) => r.data);
};

// ── CSV import / export (JG-BM3) ────────────────────────
// The backend Board Import Validation Agent runs first as a dry-run and
// returns a per-row report the UI shows before the editor confirms.

export interface BoardImportRow {
    row_number: number;
    action: 'create' | 'update' | 'skip';
    name: string;
    email: string | null;
    role: string | null;
    category: string | null;
    errors: string[];
}

export interface BoardImportReport {
    dry_run: boolean;
    total_rows: number;
    will_create: number;
    will_update: number;
    will_skip: number;
    unrecognised_headers: string[];
    rows: BoardImportRow[];
    summary: string;
    applied?: { created: number; updated: number };
}

export const exportBoardCsv = async (): Promise<Blob> => {
    const response = await client.get(`${BASE}/export.csv`, { responseType: 'blob' });
    return response.data;
};

export const importBoardCsv = async (file: File, dryRun: boolean): Promise<BoardImportReport> => {
    const form = new FormData();
    form.append('file', file);
    const response = await client.post(
        `${BASE}/import?dry_run=${dryRun ? 'true' : 'false'}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 },
    );
    return response.data;
};

export const uploadBoardProfileFile = (token: string, file: File): Promise<BoardFileUpload> => {
    const form = new FormData();
    form.append('file', file);
    return client
        .post(`${BASE}/complete-profile/${token}/upload`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60_000,
        })
        .then((r) => r.data);
};
