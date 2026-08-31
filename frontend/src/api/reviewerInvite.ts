import client from './client';

// Reviewer-invite API — three anonymous endpoints backing the explicit
// accept/decline landing card. The token in the URL is the same review
// link token the reviewer received by email; this module DOES NOT touch
// localStorage or send auth headers (client's tokenForUrl falls through
// to the generic ``token`` slot, which is empty for un-signed-in
// reviewers by design).

const BASE = '/reviewer-invite';

export interface InviteInfo {
    paper_title: string;
    paper_abstract_excerpt: string;
    expected_deadline: string | null;
    already_accepted: boolean;
}

export interface AcceptInviteResponse {
    ok: boolean;
    review_url: string;
}

export interface DeclineInviteResponse {
    ok: boolean;
    message: string;
}

export const fetchInvite = async (token: string): Promise<InviteInfo> => {
    const response = await client.get<InviteInfo>(`${BASE}/${token}`);
    return response.data;
};

export const acceptInvite = async (
    token: string,
): Promise<AcceptInviteResponse> => {
    const response = await client.post<AcceptInviteResponse>(
        `${BASE}/${token}/accept`,
    );
    return response.data;
};

export const declineInvite = async (
    token: string,
    reason?: string,
): Promise<DeclineInviteResponse> => {
    // Only send the body when the reviewer typed something — the backend
    // accepts an empty body, but sending ``{reason: ''}`` would land a
    // meaningless empty string in the audit meta.
    const body = reason && reason.trim() ? { reason: reason.trim() } : {};
    const response = await client.post<DeclineInviteResponse>(
        `${BASE}/${token}/decline`,
        body,
    );
    return response.data;
};
