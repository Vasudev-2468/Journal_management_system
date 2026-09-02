import client from './client';

export interface BidRoomReviewer {
    review_id: string;
    reviewer_id: string | null;
    reviewer_name: string | null;
    reviewer_email: string | null;
    status: string;
    state: string | null;
    assigned_at: string;
    accepted_at: string | null;
    completed_at: string | null;
    deadline: string | null;
    overall_recommendation: string | null;
    days_overdue: number;
    is_overdue: boolean;
}

export interface BidRoomProgress {
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
    overdue: number;
    percent: number;
}

export interface BidRoomTimelineEvent {
    at: string;
    kind: string;
    label: string;
    actor: string | null;
}

export interface BidRoomResponse {
    submission_id: string;
    paper_id_code: string | null;
    paper_title: string;
    author_name: string | null;
    author_email: string | null;
    submitted_at: string;
    status: string;
    reviewers: BidRoomReviewer[];
    progress: BidRoomProgress;
    timeline: BidRoomTimelineEvent[];
}

const editorAuthHeader = () => {
    const t = localStorage.getItem('editor_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
};

export const fetchBidRoom = (submissionId: string): Promise<BidRoomResponse> =>
    client
        .get(`/editor-portal/bid-room/${submissionId}`, { headers: editorAuthHeader() })
        .then((r) => r.data);

export const remindReviewer = (
    reviewId: string,
): Promise<{ ok: boolean; email_sent: boolean; reviewer_email: string }> =>
    client
        .post(
            `/editor-portal/bid-room/reviews/${reviewId}/remind`,
            {},
            { headers: editorAuthHeader() },
        )
        .then((r) => r.data);

export const resendReviewInvitation = (
    reviewId: string,
): Promise<{ ok: boolean; email_sent: boolean; reviewer_email: string; message: string }> =>
    client
        .post(
            `/editor-portal/bid-room/reviews/${reviewId}/resend-invitation`,
            {},
            { headers: editorAuthHeader() },
        )
        .then((r) => r.data);

export interface ReviewerDetail {
    id: string;
    name: string;
    email: string;
    whatsapp_number: string | null;
    institution: string | null;
    expertise_tags: string[];
    current_load: number;
    max_assignments: number;
    is_active: boolean;
    created_at: string;
    review_history: Array<{
        review_id: string;
        submission_id: string;
        paper_title: string;
        status: string;
        assigned_at: string;
        completed_at: string | null;
    }>;
    // Access lifecycle — editor-only. The password is stored as a
    // hash and is never returned; `password_set` tells us whether the
    // reviewer has ever completed onboarding.
    password_set: boolean;
    email_verified_at: string | null;
    last_login_at: string | null;
    invitation_sent_at: string | null;
    invitation_accepted_at: string | null;
    invitation_declined_at: string | null;
    invitation_revoked_at: string | null;
    invitation_expires_at: string | null;
}

export const fetchReviewerDetail = (reviewerId: string): Promise<ReviewerDetail> =>
    client
        .get(`/reviewers/${reviewerId}`, { headers: editorAuthHeader() })
        .then((r) => r.data);

export interface ReviewerCredentialsReveal {
    reviewer_id: string;
    username: string;
    password: string;
    login_url: string;
    invitation_url: string | null;
    invitation_expires_at: string | null;
}

export const resetReviewerCredentials = (
    reviewerId: string,
): Promise<ReviewerCredentialsReveal> =>
    client
        .post(
            `/reviewers/${reviewerId}/reset-credentials`,
            {},
            { headers: editorAuthHeader() },
        )
        .then((r) => r.data);

export interface ComparisonRow {
    reviewer_id: string | null;
    reviewer_name: string | null;
    status: string;
    overall_recommendation: string | null;
    score_originality: number | null;
    score_technical: number | null;
    score_relevance: number | null;
    score_clarity: number | null;
    score_references: number | null;
    ethics_flag: boolean;
    confidence: string | null;
}

export interface ComparisonResponse {
    dimensions: string[];
    rows: ComparisonRow[];
    unique_recommendations: string[];
    has_conflict: boolean;
}

export const fetchReviewerComparison = (
    submissionId: string,
): Promise<ComparisonResponse> =>
    client
        .get(`/editor-portal/bid-room/${submissionId}/comparison`, {
            headers: editorAuthHeader(),
        })
        .then((r) => r.data);
