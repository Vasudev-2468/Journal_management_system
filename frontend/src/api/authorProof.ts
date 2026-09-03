import client from './client';

export interface ProofView {
    submission_id: string;
    manuscript_id: string;
    paper_title: string;
    stage: string;
    proof_pdf_url: string | null;
    author_corrections: string | null;
    updated_at: string;
}

export interface ProofActionResponse {
    ok: boolean;
    submission_id: string;
    new_stage: string;
}

export const fetchAuthorProof = (submissionId: string): Promise<ProofView> =>
    client.get(`/author-proof/submissions/${submissionId}`).then((r) => r.data);

export const approveProof = (submissionId: string): Promise<ProofActionResponse> =>
    client.post(`/author-proof/submissions/${submissionId}/approve`).then((r) => r.data);

export const requestProofCorrection = (
    submissionId: string,
    corrections: string,
): Promise<ProofActionResponse> =>
    client
        .post(`/author-proof/submissions/${submissionId}/request-correction`, { corrections })
        .then((r) => r.data);
