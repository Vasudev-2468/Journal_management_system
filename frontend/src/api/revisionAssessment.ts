import client from './client';

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export type Verdict = 'addressed' | 'partial' | 'unresolved';

export interface CommentAssessment {
    review_id: string;
    reviewer_display_name: string;
    comment_kind: 'major' | 'minor';
    comment_index: number;
    comment_text: string;
    response_text: string;
    change_location: string;
    ai_verdict: Verdict;
    verdict_reason: string;
}

export interface ReviewerRollup {
    review_id: string;
    reviewer_display_name: string;
    addressed: number;
    partial: number;
    unresolved: number;
    total: number;
    comments: CommentAssessment[];
}

export interface AiAnalysis {
    round_number: number;
    totals: { addressed: number; partial: number; unresolved: number };
    per_reviewer: ReviewerRollup[];
    flags: string[];
}

export interface RevisionAssessmentVersion {
    id: number;
    version_number: number;
    label: string;
    is_current: boolean;
    created_at: string;
    files: Array<{
        id: number;
        kind: string;
        original_filename: string;
        stored_url: string;
        mime_type?: string | null;
    }>;
}

export interface RevisionAssessmentResponse {
    submission_id: string;
    paper_id_code: string | null;
    paper_title: string;
    round_number: number;
    previous_decision: string | null;
    submitted_at: string | null;
    versions: RevisionAssessmentVersion[];
    ai_analysis: AiAnalysis;
    reviewer_pool: Array<{ reviewer_id: string; name: string; email: string; reviewed_before: boolean }>;
}

export const fetchRevisionAssessment = (
    submissionId: string,
): Promise<RevisionAssessmentResponse> =>
    client
        .get(`/editor-portal/submissions/${submissionId}/revision-assessment`, {
            headers: editorAuthHeader(),
        })
        .then((r) => r.data);

export type RevisionDecision =
    | 'accept'
    | 're_review_same'
    | 're_review_different'
    | 'further_revision'
    | 'reject';

export interface RevisionDecisionRequest {
    decision: RevisionDecision;
    editor_comments?: string;
    reviewer_ids?: string[];
    re_review_deadline_days?: number;
    required_changes?: string[];
    revision_deadline?: string;
    rejection_reason_code?: string;
}

export const submitRevisionDecision = (
    submissionId: string,
    body: RevisionDecisionRequest,
): Promise<{ ok: boolean; submission_id: string; new_status: string; decision: string }> =>
    client
        .post(
            `/editor-portal/submissions/${submissionId}/revision-decision`,
            body,
            { headers: editorAuthHeader() },
        )
        .then((r) => r.data);
