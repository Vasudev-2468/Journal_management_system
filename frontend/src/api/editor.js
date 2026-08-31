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
