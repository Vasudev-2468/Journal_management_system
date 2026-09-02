import client from './client';

// Reviewer-portal API — every path lives under /reviewer-portal, which
// client.ts routes through the reviewer session token. Kept as its own
// module so the dashboard / assignment / form / history / notifications
// pages share types without importing from each other.

export type ReviewerState =
    | 'invited' | 'accepted' | 'in_progress' | 'submitted'
    | 'declined' | 'overdue' | 'cancelled' | 'expired';

export interface AssignmentSummary {
    review_id: string;
    submission_id: string;
    manuscript_id: string;
    paper_title: string;
    article_type?: string | null;
    subject?: string | null;
    assigned_at: string;
    deadline?: string | null;
    completed_at?: string | null;
    status: string;
    state: ReviewerState;
    coi_declared_at?: string | null;
    accepted_at?: string | null;
    recommendation?: string | null;
    link_token?: string | null;
}

export interface AssignmentDetail extends AssignmentSummary {
    abstract?: string | null;
    files: Array<{
        id: string;
        filename: string;
        size_bytes?: number | null;
        content_type?: string | null;
        kind?: string | null;
    }>;
    double_blind: boolean;
    authors_display?: string | null;
}

export interface Alert {
    kind: 'deadline' | 'new_invite' | 'submitted';
    title: string;
    detail: string;
    action_url?: string | null;
    review_id?: string | null;
}

export interface DashboardResponse {
    counters: {
        // "Pending Invitations" — reviewer has not yet accepted or declined.
        invited: number;
        // "Pending Reviews" — accepted (with or without a saved draft).
        pending_reviews: number;
        // Kept for the "has a saved draft" nuance if the UI wants it.
        in_progress: number;
        // Total submitted lifetime.
        submitted: number;
        // Just the current-year subset for the Completed card's hint.
        completed_this_year: number;
        overdue: number;
        due_soon: number;
    };
    alerts: Alert[];
    active: AssignmentSummary[];
    reviewer_name: string;
}

export interface PageAnnotation {
    page: number;
    lines: string;
    type: 'major' | 'minor' | 'suggestion';
    text: string;
}

// Structured Major/Minor comment — location fields anchor the reviewer's
// point to a specific spot in the manuscript so the author can respond
// with precision (spec §3-4).
export interface StructuredComment {
    page: string;
    section: string;
    line: string;
    comment: string;
}

export const emptyStructuredComment = (): StructuredComment => ({
    page: '', section: '', line: '', comment: '',
});

export interface DraftPayload {
    overall_assessment: string;
    rubric_answers: Record<string, string>;
    major_comments: StructuredComment[];
    minor_comments: StructuredComment[];
    suggestions: string[];
    suggestions_to_authors: string;   // legacy free-text (still saved)
    comments_to_authors: string;
    comments_to_editor: string;
    ethics_flag: boolean;
    ethics_note: string;
    page_annotations: PageAnnotation[];
    recommendation?: string | null;
    confidence?: string | null;
    willing_to_review_revision?: boolean | null;
    coi_declared?: boolean | null;
}

export const emptyDraft = (): DraftPayload => ({
    overall_assessment: '',
    rubric_answers: {},
    major_comments: [],
    minor_comments: [],
    suggestions: [],
    suggestions_to_authors: '',
    comments_to_authors: '',
    comments_to_editor: '',
    ethics_flag: false,
    ethics_note: '',
    page_annotations: [],
    recommendation: null,
    confidence: null,
    willing_to_review_revision: null,
    coi_declared: null,
});

// ── Preview + submitted-report responses ──────────────────

export interface ReviewerReport {
    review_id: string;
    manuscript_id: string;
    paper_title: string;
    reviewer_display_name: string;
    round_number: number;
    state: string;
    submitted_at?: string | null;
    overall_assessment: string;
    rubric_answers: Record<string, string>;
    major_comments: StructuredComment[];
    minor_comments: StructuredComment[];
    suggestions: string[];
    comments_to_authors: string;
    comments_to_editor: string;
    ethics_flag: boolean;
    ethics_note: string;
    page_annotations: PageAnnotation[];
    recommendation?: string | null;
    confidence?: string | null;
    willing_to_review_revision?: boolean | null;
    editor_summary: string;
}

export interface ReportCounts {
    major: number; minor: number; suggestions: number; annotations: number;
}

export interface PreviewResponse {
    report: ReviewerReport;
    counts: ReportCounts;
    validation_ok: boolean;
    validation_blockers: string[];
    validation_warnings: string[];
}

export interface DraftResponse {
    payload: DraftPayload;
    saved_at?: string | null;
}

export interface AssistantHint {
    severity: 'info' | 'warning';
    code: string;
    message: string;
}

export interface QualityCheckResponse {
    ok: boolean;
    blockers: string[];
    warnings: string[];
}

export interface SubmitResponse {
    ok: boolean;
    review_id: string;
    editor_summary: string;
    completed_at: string;
    manuscript_id: string;
    recommendation?: string | null;
    confidence?: string | null;
    round_number: number;
    major_count: number;
    minor_count: number;
    suggestions_count: number;
    annotations_count: number;
}

export interface RubricOption { value: string; label: string; }
export interface RubricQuestion {
    key: string; prompt: string; mandatory: boolean; kind: string;
    section: string; options: RubricOption[];
}
export interface RubricResponse {
    questions: RubricQuestion[];
    recommendations: RubricOption[];
    confidences: RubricOption[];
}

export interface ProfileResponse {
    name: string; email: string;
    phone?: string | null;
    country?: string | null;
    institution?: string | null;
    department?: string | null;
    designation?: string | null;
    expertise_tags: string[];
    orcid?: string | null;
    scopus_id?: string | null;
    google_scholar?: string | null;
}

export interface AvailabilityResponse {
    available: boolean;
    current_load: number;
    max_assignments: number;
    unavailable_from?: string | null;
    unavailable_until?: string | null;
    preferred_areas: string[];
}

export interface SecurityResponse {
    email: string;
    email_verified: boolean;
    password_last_changed_at?: string | null;
    twofa_enabled: boolean;
    active_sessions: number;
}

const g = <T,>(url: string) => client.get<T>(url).then((r) => r.data);
const p = <T,>(url: string, body?: unknown) => client.post<T>(url, body ?? {}).then((r) => r.data);
const patch = <T,>(url: string, body: unknown) => client.patch<T>(url, body).then((r) => r.data);

// ── endpoints ────────────────────────────────────────────
export const fetchDashboard   = () => g<DashboardResponse>('/reviewer-portal/dashboard');
export const fetchAssignments = () => g<AssignmentSummary[]>('/reviewer-portal/assignments');
export const fetchAssignment  = (id: string) => g<AssignmentDetail>(`/reviewer-portal/assignments/${id}`);
export const acceptAssignment = (id: string, body: { coi_declared: boolean; coi_reason?: string }) =>
    p(`/reviewer-portal/assignments/${id}/accept`, body);
export const declineAssignment = (id: string, reason?: string) =>
    p(`/reviewer-portal/assignments/${id}/decline`, { reason });

export const fetchDraft = (id: string) => g<DraftResponse>(`/reviewer-portal/assignments/${id}/draft`);
export const saveDraft  = (id: string, payload: DraftPayload) =>
    p<DraftResponse>(`/reviewer-portal/assignments/${id}/draft`, payload);

export const runAssistant = (id: string, payload: DraftPayload) =>
    p<{ hints: AssistantHint[] }>(`/reviewer-portal/assignments/${id}/assistant`, payload);
export const runQualityCheck = (id: string, payload: DraftPayload) =>
    p<QualityCheckResponse>(`/reviewer-portal/assignments/${id}/quality-check`, payload);
export const submitReview = (id: string, payload: DraftPayload) =>
    p<SubmitResponse>(`/reviewer-portal/assignments/${id}/submit`, payload);
export const previewReport = (id: string, payload: DraftPayload) =>
    p<PreviewResponse>(`/reviewer-portal/assignments/${id}/preview`, payload);
export const fetchReport = (id: string) =>
    g<ReviewerReport>(`/reviewer-portal/assignments/${id}/report`);

export const fetchHistory = (params: { year?: number; recommendation?: string; state?: string } = {}) =>
    client
        .get<AssignmentSummary[]>('/reviewer-portal/history', { params })
        .then((r) => r.data);

export const fetchNotifications = () => g<Alert[]>('/reviewer-portal/notifications');
export const fetchRubric        = () => g<RubricResponse>('/reviewer-portal/rubric');

export interface AnnotationSuggestion {
    suggested_type: 'major' | 'minor' | 'suggestion';
    suggested_prompt: string;
    keyword_hits: string[];
}
export const suggestAnnotation = (id: string, selected_text: string) =>
    p<AnnotationSuggestion>(`/reviewer-portal/assignments/${id}/annotation-assistant`, { selected_text });

export const fetchProfile       = () => g<ProfileResponse>('/reviewer-portal/profile');
export const saveProfile        = (body: Partial<ProfileResponse>) =>
    patch<ProfileResponse>('/reviewer-portal/profile', body);
export const fetchAvailability  = () => g<AvailabilityResponse>('/reviewer-portal/availability');
export const saveAvailability   = (body: {
    max_assignments?: number;
    unavailable_from?: string | null;
    unavailable_until?: string | null;
    clear_unavailable?: boolean;
}) => patch<AvailabilityResponse>('/reviewer-portal/availability', body);
export const fetchSecurity      = () => g<SecurityResponse>('/reviewer-portal/security');
