import client from './client';

// ── Submissions ─────────────────────────────────────────

export const fetchSubmissions = (params) =>
  client.get('/submissions/', { params }).then((r) => r.data);

export const fetchSubmissionStatus = (id) =>
  client.get(`/submissions/${id}/status`).then((r) => r.data);

export const overrideClassification = (id, data) =>
  client.patch(`/submissions/${id}/override-classification`, data).then((r) => r.data);

// ── Reviewers ───────────────────────────────────────────

export const fetchReviewers = (params) =>
  client.get('/reviewers/', { params }).then((r) => r.data);

export const suggestReviewers = (submissionId) =>
  client.get(`/reviewers/suggest/${submissionId}`).then((r) => r.data);

export const assignReviewers = (data) =>
  client.post('/reviewers/assign', data).then((r) => r.data);

export const inviteReviewer = (data) =>
  client.post('/reviewers/invite', data).then((r) => r.data);

// Editor Reviewers panel — per-row invitation lifecycle.
//
// ``getReviewerInvitationLink`` mints a fresh 48-hour activation URL
// the editor can copy; ``resendReviewerInvitation`` re-dispatches the
// activation email (also clearing any prior revoke);
// ``revokeReviewerInvitation`` invalidates outstanding activation
// tokens without deleting the reviewer row; ``deleteReviewer`` hard-
// deletes a reviewer that carries no review history (409 otherwise).

export const getReviewerInvitationLink = (reviewerId) =>
  client
    .get(`/reviewers/${reviewerId}/invitation-link`)
    .then((r) => r.data);

export const resendReviewerInvitation = (reviewerId) =>
  client
    .post(`/reviewers/${reviewerId}/resend-invitation`)
    .then((r) => r.data);

export const revokeReviewerInvitation = (reviewerId) =>
  client
    .post(`/reviewers/${reviewerId}/revoke-invitation`)
    .then((r) => r.data);

export const deleteReviewer = (reviewerId) =>
  client.delete(`/reviewers/${reviewerId}`).then((r) => r.data);

// ── Structured Reviewer Report + multi-reviewer views ───

export const fetchReviewerReport = (reviewId) =>
  client.get(`/editor-portal/reviews/${reviewId}/report`).then((r) => r.data);

export const fetchReviewerReports = (submissionId, params = {}) =>
  client
    .get(`/editor-portal/submissions/${submissionId}/reviewer-reports`, { params })
    .then((r) => r.data);

export const fetchReviewerConsensus = (submissionId, params = {}) =>
  client
    .get(`/editor-portal/submissions/${submissionId}/reviewer-consensus`, { params })
    .then((r) => r.data);

export const fetchRevisionChecklist = (submissionId) =>
  client
    .get(`/editor-portal/submissions/${submissionId}/revision-checklist`)
    .then((r) => r.data);

// Round-N automation — opens a new review round on a submission.
// options: { carry_previous?: boolean, new_reviewer_ids?: string[] }
export const openReviewRound = (submissionId, options = {}) =>
  client
    .post(`/editor-portal/submissions/${submissionId}/open-round`, options)
    .then((r) => r.data);

// Editor Decision Letter Drafter — synthesises a draft letter from
// reviewer reports + editor decision + optional editor note.
// Under Review manuscript list — powers the dashboard's Under Review
// panel with the "N/M Reviews Received" progress column + consensus
// recommendation + ethics flag per submission.
export const fetchUnderReviewManuscripts = () =>
  client.get('/editor-portal/under-review').then((r) => r.data);

// Handling-editor delegation
export const fetchHandlingEditor = (submissionId) =>
  client.get(`/editor-portal/submissions/${submissionId}/handling-editor`).then((r) => r.data);
export const assignHandlingEditor = (submissionId, editor_id) =>
  client.post(`/editor-portal/submissions/${submissionId}/handling-editor`, { editor_id }).then((r) => r.data);
export const fetchEditorMe = () =>
  client.get('/editor-auth/me').then((r) => r.data);

// Detection agents (deterministic — spec §14, §15).
export const runDuplicateCheck = (submissionId) =>
  client.get(`/editor-portal/submissions/${submissionId}/duplicate-check`).then((r) => r.data);
export const runPanelBalance = (submissionId) =>
  client.get(`/editor-portal/submissions/${submissionId}/panel-balance`).then((r) => r.data);
export const runCrossRoundConsistency = (submissionId) =>
  client.get(`/editor-portal/submissions/${submissionId}/cross-round-consistency`).then((r) => r.data);
export const runReviewerBiasCheck = (submissionId, reviewer_id) =>
  client.post(`/editor-portal/submissions/${submissionId}/reviewer-bias-check`, { reviewer_id }).then((r) => r.data);

export const draftDecisionLetter = (submissionId, editor_decision, editor_note = '') =>
  client
    .post(`/editor-portal/submissions/${submissionId}/decision-letter-draft`, {
      editor_decision,
      editor_note,
    })
    .then((r) => r.data);

// ── Reviews ─────────────────────────────────────────────

export const fetchSubmissionReviews = (submissionId) =>
  client.get(`/reviews/${submissionId}`).then((r) => r.data);

export const submitDecision = (submissionId, data) =>
  client.post(`/reviews/${submissionId}/decision`, data).then((r) => r.data);

export const requestAdditionalReview = (submissionId) =>
  client.post(`/reviews/${submissionId}/request-additional-review`).then((r) => r.data);

// ── Editor Portal (Agent Pipeline) ──────────────────────

export const triggerAgentPipeline = (submissionId, data) =>
  client.post(`/editor-portal/trigger-pipeline/${submissionId}`, data).then((r) => r.data);

export const getFormatReport = (submissionId) =>
  client.get(`/editor-portal/format-report/${submissionId}`).then((r) => r.data);

export const getAgentStatus = (submissionId) =>
  client.get(`/editor-portal/agent-status/${submissionId}`).then((r) => r.data);

export const getSuggestedReviewers = (submissionId) =>
  client.get(`/editor-portal/suggested-reviewers/${submissionId}`).then((r) => r.data);

export const submitConsultPartyDecision = (submissionId, data) =>
  client.post(`/editor-portal/consult-party-decision/${submissionId}`, data).then((r) => r.data);

export const editorAssignReviewers = (submissionId, data) =>
  client.post(`/editor-portal/assign-reviewers/${submissionId}`, data).then((r) => r.data);

// ── Analytics ───────────────────────────────────────────

export const fetchAnalyticsOverview = (range = 'this_year') =>
  client.get('/editor-portal/analytics/overview', { params: { range } }).then((r) => r.data);

// Detailed throughput / decision-distribution / avg-turnaround card
export const fetchEditorialAnalytics = (days = 180) =>
  client.get('/editor-portal/analytics/editorial-overview', { params: { days } }).then((r) => r.data);

// ── Notification log (JG-304) ───────────────────────────

export const fetchNotificationLog = (params = {}) =>
  client.get('/editor-portal/notifications', { params }).then((r) => r.data);

// ── Overdue reviews (editor dashboard chip) ─────────────

export const fetchOverdueReviews = () =>
  client.get('/editor-portal/overdue-reviews').then((r) => r.data);

// ── Sidebar badge counts ────────────────────────────────
// Aggregate endpoint powering the small red-circle counters next to
// sidebar entries. Polled every 60s from EditorDashboard.

export const fetchEditorBadges = () =>
  client.get('/editor-badges/counts').then((r) => r.data);

// ── Bulk operations & CSV export ────────────────────────
//
// These endpoints live at /bulk-ops/* and /csv-export/* — outside the
// /editor-* prefix that client.ts's tokenForUrl routes to the editor
// token. We attach the editor Bearer explicitly so both calls authenticate
// without needing to broaden the client's URL routing.

const editorAuthHeader = () => {
  const t = localStorage.getItem('editor_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const bulkUpdateSubmissions = (ids, patch) =>
  client
    .post('/bulk-ops/submissions/update', { ids, patch }, { headers: editorAuthHeader() })
    .then((r) => r.data);

export const bulkPublishAnnouncements = (ids, is_published) =>
  client
    .post(
      '/bulk-ops/announcements/publish',
      { ids, is_published },
      { headers: editorAuthHeader() },
    )
    .then((r) => r.data);

export const bulkDeleteAnnouncements = (ids) =>
  client
    .post('/bulk-ops/announcements/delete', { ids }, { headers: editorAuthHeader() })
    .then((r) => r.data);

// CSV export — fetches the file as a blob and pushes it through an
// invisible <a download> so the browser saves it. Filename comes from
// the Content-Disposition header the backend sets.
export const exportCsv = async (kind) => {
  const response = await client.get(`/csv-export/${kind}`, {
    responseType: 'blob',
    headers: editorAuthHeader(),
  });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cd = response.headers?.['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/i.exec(cd);
  const filename = match ? match[1] : `${kind}-${stamp}.csv`;
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  return { filename };
};
