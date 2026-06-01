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
