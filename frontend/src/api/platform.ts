import client from './client';

// ── Revisions ────────────────────────────────────────────

export type FileKind =
    | 'manuscript'
    | 'figure'
    | 'supplementary'
    | 'response'
    | 'cover_letter'
    | 'dataset'
    | 'video'
    | 'revised'
    | 'other';

export interface ManuscriptFile {
    id: number;
    kind: FileKind;
    original_filename: string;
    stored_url: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
}

export interface ManuscriptVersion {
    id: number;
    submission_id: string;
    version_number: number;
    label: string;
    cover_letter: string | null;
    response_to_reviewers: string | null;
    change_summary: string | null;
    is_current: boolean;
    created_at: string;
    files: ManuscriptFile[];
}

export const fetchVersionsForSubmission = async (
    submissionId: string,
): Promise<ManuscriptVersion[]> => {
    const r = await client.get(`/revisions/submission/${submissionId}`);
    return r.data;
};

export const submitRevision = async (
    submissionId: string,
    payload: {
        label?: string;
        cover_letter?: string;
        response_to_reviewers?: string;
        change_summary?: string;
        files: Array<{
            kind: FileKind;
            original_filename: string;
            stored_url: string;
            mime_type?: string;
            size_bytes?: number;
        }>;
    },
): Promise<ManuscriptVersion> => {
    const r = await client.post(`/revisions/submission/${submissionId}`, payload);
    return r.data;
};

// ── Production ───────────────────────────────────────────

export type ProductionStage =
    | 'copy_editing'
    | 'typesetting'
    | 'proof'
    | 'author_proof_pending'
    | 'author_proof_approved'
    | 'final_pdf'
    | 'doi_assigned'
    | 'published';

export interface ProductionRecord {
    id: number;
    submission_id: string;
    stage: ProductionStage;
    copy_edit_notes: string | null;
    typesetting_notes: string | null;
    proof_pdf_url: string | null;
    author_corrections: string | null;
    final_pdf_url: string | null;
    doi: string | null;
    published_at: string | null;
    updated_at: string;
    created_at: string;
}

export const fetchProductionQueue = async (
    stage?: ProductionStage,
): Promise<ProductionRecord[]> => {
    const r = await client.get('/production/queue', { params: stage ? { stage } : {} });
    return r.data;
};

export const openProductionForSubmission = async (
    submissionId: string,
): Promise<ProductionRecord> => {
    const r = await client.post(`/production/from-accepted/${submissionId}`);
    return r.data;
};

export const updateProduction = async (
    id: number,
    payload: Partial<ProductionRecord>,
): Promise<ProductionRecord> => {
    const r = await client.patch(`/production/${id}`, payload);
    return r.data;
};

// ── Special issues ───────────────────────────────────────

export interface SpecialIssue {
    id: number;
    slug: string;
    title: string;
    description: string;
    guest_editors: string | null;
    topics: string | null;
    cover_image_url: string | null;
    submission_deadline: string | null;
    publication_date: string | null;
    status: 'open' | 'closed' | 'published';
    is_published: boolean;
}

export const fetchSpecialIssues = async (
    include_unpublished = false,
): Promise<SpecialIssue[]> => {
    const r = await client.get('/special-issues/', { params: { include_unpublished } });
    return r.data;
};

export const fetchSpecialIssue = async (slug: string): Promise<SpecialIssue> => {
    const r = await client.get(`/special-issues/${slug}`);
    return r.data;
};

export const createSpecialIssue = async (
    payload: Omit<SpecialIssue, 'id'>,
): Promise<SpecialIssue> => {
    const r = await client.post('/special-issues/', payload);
    return r.data;
};

export const updateSpecialIssue = async (
    slug: string,
    payload: Partial<Omit<SpecialIssue, 'id' | 'slug'>>,
): Promise<SpecialIssue> => {
    const r = await client.patch(`/special-issues/${slug}`, payload);
    return r.data;
};

export const deleteSpecialIssue = async (slug: string): Promise<void> => {
    await client.delete(`/special-issues/${slug}`);
};

// ── Email templates ──────────────────────────────────────

export interface EmailTemplate {
    id: number;
    slug: string;
    subject: string;
    body: string;
    description: string | null;
    placeholders: string | null;
    is_active: boolean;
    updated_by: string | null;
    updated_at: string;
}

export const fetchEmailTemplates = async (): Promise<EmailTemplate[]> => {
    const r = await client.get('/email-templates/');
    return r.data;
};

export const updateEmailTemplate = async (
    slug: string,
    payload: Partial<Omit<EmailTemplate, 'id' | 'slug' | 'updated_by' | 'updated_at'>>,
): Promise<EmailTemplate> => {
    const r = await client.patch(`/email-templates/${slug}`, payload);
    return r.data;
};

// ── Audit log ────────────────────────────────────────────

export interface AuditLogEntry {
    id: number;
    actor_id: number | null;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip_address: string | null;
    meta: Record<string, unknown> | null;
    created_at: string;
}

export const fetchAuditLog = async (params?: {
    action?: string;
    actor_email?: string;
    target_type?: string;
    q?: string;
    limit?: number;
}): Promise<AuditLogEntry[]> => {
    const r = await client.get('/audit-logs/', { params });
    return r.data;
};

// ── References ───────────────────────────────────────────

export interface ArticleReference {
    id: number;
    article_id: number;
    sequence: number;
    text: string;
    doi: string | null;
    url: string | null;
}

export const fetchReferences = async (articleId: number): Promise<ArticleReference[]> => {
    const r = await client.get(`/references/article/${articleId}`);
    return r.data;
};

export const addReference = async (
    articleId: number,
    payload: { sequence?: number; text: string; doi?: string; url?: string },
): Promise<ArticleReference> => {
    const r = await client.post(`/references/article/${articleId}`, payload);
    return r.data;
};

export const deleteReference = async (referenceId: number): Promise<void> => {
    await client.delete(`/references/${referenceId}`);
};

// ── Users admin ──────────────────────────────────────────

export type AdminRole = 'author' | 'editor' | 'section_editor' | 'admin';

export interface AdminUser {
    id: number;
    username: string | null;
    email: string;
    full_name: string | null;
    role: AdminRole;
    is_active: boolean;
    country: string | null;
    institution: string | null;
    orcid: string | null;
    mfa_enabled: boolean;
}

export const fetchAdminUsers = async (params?: {
    role?: AdminRole;
    q?: string;
}): Promise<AdminUser[]> => {
    const r = await client.get('/users-admin/', { params });
    return r.data;
};

export const updateAdminUser = async (
    id: number,
    payload: Partial<Omit<AdminUser, 'id' | 'email' | 'username' | 'orcid' | 'mfa_enabled'>>,
): Promise<AdminUser> => {
    const r = await client.patch(`/users-admin/${id}`, payload);
    return r.data;
};

export const deactivateAdminUser = async (id: number): Promise<AdminUser> => {
    const r = await client.post(`/users-admin/${id}/deactivate`);
    return r.data;
};
