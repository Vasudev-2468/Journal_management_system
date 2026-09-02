import client from './client';

export interface DecisionBriefing {
    submission_id: string;
    reviews_received: number;
    reviews_expected: number;
    recommendations: {
        accept: number;
        minor_revision: number;
        major_revision: number;
        reject: number;
    };
    consensus: string;
    suggested_decision: string;
    suggestion_reason: string;
    confidence: 'high' | 'medium' | 'low';
    common_concerns: { reviewer: string; concern: string }[];
    ethics_flags: number;
    coi_declared: number;
    can_finalise: boolean;
}

export interface SubmissionTransition {
    id: number;
    from_status: string | null;
    to_status: string;
    allowed: boolean;
    performed_by_email: string | null;
    performed_at: string;
    reason: string | null;
}

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export const fetchDecisionBriefing = (submissionId: string): Promise<DecisionBriefing> =>
    client
        .get(`/submissions/${submissionId}/decision-briefing`, { headers: editorAuthHeader() })
        .then((r) => r.data);

export const fetchSubmissionTransitions = (submissionId: string): Promise<SubmissionTransition[]> =>
    client
        .get(`/submissions/${submissionId}/transitions`, { headers: editorAuthHeader() })
        .then((r) => r.data);

export interface LegalNextStates {
    current: string;
    legal_next_states: string[];
    decisions_allowed: {
        accept: boolean;
        reject: boolean;
        minor_revision: boolean;
        major_revision: boolean;
        reject_and_resubmit: boolean;
    };
}

export const fetchLegalNextStates = (submissionId: string): Promise<LegalNextStates> =>
    client
        .get(`/submissions/${submissionId}/legal-next-states`, { headers: editorAuthHeader() })
        .then((r) => r.data);

export const finaliseDecision = (
    submissionId: string,
    decision: 'accept' | 'reject' | 'minor_revision' | 'major_revision' | 'reject_and_resubmit',
    opts: {
        comments?: string;
        override_reason?: string;
        ai_suggested?: string;
        evidence?: string;
    } = {},
): Promise<{
    ok: boolean;
    new_status: string;
    submission_id: string;
    override_recorded: boolean;
}> =>
    client
        .post(
            `/submissions/${submissionId}/finalise-decision`,
            { decision, ...opts },
            { headers: editorAuthHeader() },
        )
        .then((r) => r.data);

export const publishArticle = (
    articleId: number,
): Promise<{ ok: boolean; article_id: number; published_at: string; doi: string | null }> =>
    client
        .post(`/articles/${articleId}/publish`, {}, { headers: editorAuthHeader() })
        .then((r) => r.data);
