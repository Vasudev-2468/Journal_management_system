import client from './client';

export interface DoiEligibility {
    eligible: boolean;
    reason: string;
    missing_checks: string[];
    can_assign: boolean;
    current_status: string;
    current_doi: string | null;
    proposed_doi: string | null;
}

export interface DoiState {
    doi: string | null;
    doi_status: string;
    doi_assigned_by: number | null;
    doi_assigned_at: string | null;
    doi_registered_at: string | null;
}

export interface DoiAuditEntry {
    id: number;
    action: string;
    performed_by_email: string | null;
    performed_at: string;
    previous_status: string | null;
    new_status: string | null;
    proposed_doi: string | null;
    reason: string | null;
}

export const fetchDoiEligibility = async (
    articleId: number,
    submissionId?: string,
): Promise<DoiEligibility> => {
    const r = await client.get(`/crossref/${articleId}/eligibility`, {
        params: submissionId ? { submission_id: submissionId } : {},
    });
    return r.data;
};

export const assignDoi = async (
    articleId: number,
    submissionId?: string,
): Promise<DoiState> => {
    const r = await client.post(`/crossref/${articleId}/assign`, {
        submission_id: submissionId || null,
        confirmed: true,
    });
    return r.data;
};

export const registerDoi = async (
    articleId: number,
): Promise<{ ok: boolean; detail?: string; batch_id?: string }> => {
    const r = await client.post(`/crossref/${articleId}/register`);
    return r.data;
};

export const fetchDoiAudit = async (articleId: number): Promise<DoiAuditEntry[]> => {
    const r = await client.get(`/crossref/${articleId}/audit`);
    return r.data;
};
