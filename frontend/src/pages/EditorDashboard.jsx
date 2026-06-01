import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchSubmissions,
  overrideClassification,
  suggestReviewers,
  assignReviewers,
  fetchSubmissionReviews,
  submitDecision,
  getAgentStatus,
  getSuggestedReviewers,
  triggerAgentPipeline,
  editorAssignReviewers,
} from '../api/editor';

/* ═══════════════════════════════════════════════════════════
   Tiny sub-components
   ═══════════════════════════════════════════════════════════ */

const StatusBadge = ({ status }) => {
  const colors = {
    pending_classification: 'bg-gray-100 text-gray-700',
    awaiting_format_check: 'bg-purple-100 text-purple-800',
    awaiting_consult_review: 'bg-indigo-100 text-indigo-800',
    awaiting_reviewer_suggestions: 'bg-cyan-100 text-cyan-800',
    pending_assignment: 'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    revision_requested: 'bg-orange-100 text-orange-800',
    returned_to_author: 'bg-pink-100 text-pink-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
};

const ConfidenceBar = ({ value }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-10 text-right">{pct}%</span>
    </div>
  );
};

const StarRating = ({ score }) => {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const full = Math.round(score);
  return (
    <span className="text-yellow-500 text-sm tracking-tight" title={`${score}/10`}>
      {'★'.repeat(full)}{'☆'.repeat(10 - full)}
    </span>
  );
};

const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const SkeletonRows = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full" />
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════
   Main Dashboard
   ═══════════════════════════════════════════════════════════ */

const SIDEBAR_ITEMS = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'pending', label: 'Pending Actions', icon: '⏳', badge: true },
  { key: 'submissions', label: 'All Submissions', icon: '📄' },
  { key: 'reviewers', label: 'Reviewers', icon: '👥' },
  { key: 'notifications', label: 'Notifications Log', icon: '🔔' },
  { key: 'analytics', label: 'Analytics', icon: '📈' },
];

export default function EditorDashboard() {
  const [activePanel, setActivePanel] = useState('overview');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerSubmission, setDrawerSubmission] = useState(null);

  // ── Data fetching ───────────────────────────────────────

  const loadSubmissions = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const data = await fetchSubmissions({ page: 1, page_size: 50, ...params });
      setSubmissions(data.items || []);
    } catch (e) {
      console.error('Failed to load submissions', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Derived data
  const pendingClassification = submissions.filter(
    (s) => ['pending_classification', 'pending_assignment', 'awaiting_format_check',
            'awaiting_consult_review', 'awaiting_reviewer_suggestions'].includes(s.status)
  );
  const underReview = submissions.filter((s) => s.status === 'under_review');
  const awaitingDecision = submissions.filter(
    (s) => s.status === 'under_review' && s.reviewer_count > 0
  );
  const acceptedThisMonth = submissions.filter((s) => {
    if (s.status !== 'accepted') return false;
    const d = new Date(s.submitted_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const pendingCount = pendingClassification.length;

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-blue-800">Journal Editor</h1>
          <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActivePanel(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activePanel === item.key
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {activePanel === 'overview' && (
            <OverviewPanel
              submissions={submissions}
              loading={loading}
              pendingClassification={pendingClassification}
              underReview={underReview}
              awaitingDecision={awaitingDecision}
              acceptedThisMonth={acceptedThisMonth}
              onRefresh={loadSubmissions}
            />
          )}
          {(activePanel === 'pending' || activePanel === 'submissions') && (
            <SubmissionsPanel
              submissions={activePanel === 'pending' ? pendingClassification : submissions}
              loading={loading}
              title={activePanel === 'pending' ? 'Pending Actions' : 'All Submissions'}
              onOpenDrawer={setDrawerSubmission}
              onRefresh={loadSubmissions}
            />
          )}
          {activePanel === 'reviewers' && <PlaceholderPanel title="Reviewers" />}
          {activePanel === 'notifications' && <PlaceholderPanel title="Notifications Log" />}
          {activePanel === 'analytics' && <PlaceholderPanel title="Analytics" />}
        </div>
      </main>

      {/* Detail Drawer */}
      {drawerSubmission && (
        <SubmissionDrawer
          submission={drawerSubmission}
          onClose={() => setDrawerSubmission(null)}
          onRefresh={loadSubmissions}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Overview Panel
   ═══════════════════════════════════════════════════════════ */

function OverviewPanel({
  submissions,
  loading,
  pendingClassification,
  underReview,
  awaitingDecision,
  acceptedThisMonth,
  onRefresh,
}) {
  const stats = [
    { label: 'Total Submissions', value: submissions.length, color: 'bg-blue-500' },
    { label: 'Under Review', value: underReview.length, color: 'bg-indigo-500' },
    { label: 'Awaiting Decision', value: awaitingDecision.length, color: 'bg-yellow-500' },
    { label: 'Published This Month', value: acceptedThisMonth.length, color: 'bg-green-500' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Overview</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          : stats.map((s) => (
              <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-3xl font-bold mt-1">{s.value}</p>
                <div className={`h-1 w-12 ${s.color} rounded mt-3`} />
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending actions — 2 cols */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Pending Your Action
            {pendingClassification.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({pendingClassification.length})
              </span>
            )}
          </h3>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : pendingClassification.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              All caught up — no pending actions.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingClassification.map((s) => (
                <PendingActionCard key={s.id} submission={s} onRefresh={onRefresh} />
              ))}
            </div>
          )}
        </div>

        {/* Activity feed — 1 col */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h3>
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

/* ── Pending Action Card ─────────────────────────────────── */

function PendingActionCard({ submission, onRefresh }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [acting, setActing] = useState(false);

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const data = await suggestReviewers(submission.id);
      setSuggestions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (submission.status === 'pending_assignment') loadSuggestions();
  }, [submission.id, submission.status]);

  const handleApprove = async () => {
    if (submission.status === 'pending_assignment' && suggestions?.length) {
      setActing(true);
      try {
        await assignReviewers({
          submission_id: submission.id,
          reviewer_ids: suggestions.slice(0, 3).map((r) => r.reviewer_id),
        });
        onRefresh();
      } catch (e) {
        console.error(e);
      } finally {
        setActing(false);
      }
    }
  };

  const handleOverrideField = async () => {
    const field = prompt('Enter the correct field classification:');
    if (!field) return;
    const confidence = parseFloat(prompt('Confidence (0–1):', '0.9') || '0.9');
    setActing(true);
    try {
      await overrideClassification(submission.id, {
        classified_field: field,
        classification_confidence: confidence,
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{submission.paper_title}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {submission.author_name} · {submission.classified_field || 'Unclassified'}
          </p>
          {submission.classification_confidence != null && (
            <div className="mt-2 max-w-xs">
              <ConfidenceBar value={submission.classification_confidence} />
            </div>
          )}
          {/* Reviewer suggestions */}
          {submission.status === 'pending_assignment' && (
            <div className="mt-3">
              {loadingSuggestions ? (
                <Skeleton className="h-6 w-48" />
              ) : suggestions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 3).map((r) => (
                    <span
                      key={r.reviewer_id}
                      className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                    >
                      {r.name}
                      <span className="text-blue-400">
                        ({Math.round(r.similarity_score * 100)}%)
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={submission.status} />
          <button
            onClick={handleApprove}
            disabled={acting}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            {acting ? '…' : 'APPROVE'}
          </button>
          <button
            onClick={handleOverrideField}
            disabled={acting}
            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            OVERRIDE
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Activity Feed ───────────────────────────────────────── */

function ActivityFeed() {
  // Placeholder — replace with real notification fetch
  const items = [
    { id: 1, text: 'New submission received', time: '2 min ago' },
    { id: 2, text: 'Reviewer Dr. Chen completed review', time: '15 min ago' },
    { id: 3, text: 'Classification override applied', time: '1 hr ago' },
    { id: 4, text: 'Decision sent: Accepted', time: '2 hrs ago' },
    { id: 5, text: 'New reviewer registered', time: '3 hrs ago' },
    { id: 6, text: 'Deadline reminder sent (3 reviews)', time: '5 hrs ago' },
    { id: 7, text: 'Submission escalated for manual review', time: '6 hrs ago' },
    { id: 8, text: 'Reviewer invitation sent', time: '8 hrs ago' },
    { id: 9, text: 'New submission received', time: '10 hrs ago' },
    { id: 10, text: 'Decision sent: Major Revision', time: '12 hrs ago' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {items.map((item) => (
        <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
          <p className="text-sm text-gray-800">{item.text}</p>
          <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Submissions Panel (table)
   ═══════════════════════════════════════════════════════════ */

function SubmissionsPanel({ submissions, loading, title, onOpenDrawer, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('');
  const [filterField, setFilterField] = useState('');
  const [search, setSearch] = useState('');

  const filtered = submissions.filter((s) => {
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterField && s.classified_field !== filterField) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !s.paper_title?.toLowerCase().includes(q) &&
        !s.author_name?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const allStatuses = [...new Set(submissions.map((s) => s.status))].sort();
  const allFields = [...new Set(submissions.map((s) => s.classified_field).filter(Boolean))].sort();

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search title or author…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={filterField}
          onChange={(e) => setFilterField(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Fields</option>
          {allFields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Field</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3 text-center">Reviews</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No submissions match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onOpenDrawer(s)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                    {s.paper_title}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.author_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                    {s.classified_field || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {s.reviewer_count ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Submission Drawer (right side detail panel)
   ═══════════════════════════════════════════════════════════ */

function SubmissionDrawer({ submission, onClose, onRefresh }) {
  const [reviews, setReviews] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [decisionComments, setDecisionComments] = useState('');
  const [decidingAs, setDecidingAs] = useState(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingReviews(true);
      try {
        const data = await fetchSubmissionReviews(submission.id);
        if (!cancelled) setReviews(data);
      } catch {
        if (!cancelled) setReviews(null);
      } finally {
        if (!cancelled) setLoadingReviews(false);
      }
    })();

    (async () => {
      setLoadingSuggestions(true);
      try {
        const data = await suggestReviewers(submission.id);
        if (!cancelled) setSuggestions(data);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();

    return () => { cancelled = true; };
  }, [submission.id]);

  const handleAssign = async (reviewerIds) => {
    setAssigning(true);
    try {
      await assignReviewers({ submission_id: submission.id, reviewer_ids: reviewerIds });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setAssigning(false);
    }
  };

  const handleDecision = async (decision) => {
    setDecidingAs(decision);
    try {
      await submitDecision(submission.id, { decision, editor_comments: decisionComments });
      onRefresh();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setDecidingAs(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{submission.paper_title}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {submission.author_name} · <StatusBadge status={submission.status} />
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          {/* Submission details */}
          <Section title="Submission Details">
            <DetailRow label="Submitted">{new Date(submission.submitted_at).toLocaleString()}</DetailRow>
            <DetailRow label="Field">{submission.classified_field || '—'}</DetailRow>
            <DetailRow label="Email">{submission.author_email}</DetailRow>
          </Section>

          {/* AI Classification */}
          <Section title="AI Classification">
            <div className="flex items-center gap-4">
              <span className="font-medium text-gray-900">{submission.classified_field || 'Pending'}</span>
              {submission.classification_confidence != null && (
                <div className="w-40">
                  <ConfidenceBar value={submission.classification_confidence} />
                </div>
              )}
            </div>
          </Section>

          {/* Agent Pipeline Status */}
          <AgentPipelinePanel submission={submission} onRefresh={onRefresh} />

          {/* Suggested Reviewers */}
          <Section title="Suggested Reviewers">
            {loadingSuggestions ? (
              <SkeletonRows rows={3} />
            ) : !suggestions?.length ? (
              <p className="text-gray-400 text-sm">No suggestions available.</p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((r) => (
                  <div key={r.reviewer_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-500">
                        {(r.expertise_tags || []).join(', ')} · Load: {r.current_load}/{r.max_assignments}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-blue-700">
                        {Math.round(r.similarity_score * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => handleAssign(suggestions.slice(0, 3).map((r) => r.reviewer_id))}
                  disabled={assigning}
                  className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
                >
                  {assigning ? 'Assigning…' : `Assign Top ${Math.min(suggestions.length, 3)} Reviewers`}
                </button>
              </div>
            )}
          </Section>

          {/* Reviews */}
          <Section title="Reviews">
            {loadingReviews ? (
              <SkeletonRows rows={3} />
            ) : !reviews?.reviews?.length ? (
              <p className="text-gray-400 text-sm">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {/* Averages */}
                {reviews.average_scores && (
                  <div className="bg-blue-50 rounded-lg p-4 mb-2">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-2">
                      Average Scores ({reviews.completed_count}/{reviews.total_count} completed)
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(reviews.average_scores).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-gray-600 capitalize">{k.replace('score_', '')}:</span>
                          <StarRating score={v} />
                          {v != null && <span className="text-xs text-gray-400">({v})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reviews.reviews.map((r) => (
                  <div key={r.review_id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">{r.reviewer_name || 'Anonymous'}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.status === 'completed' && (
                      <>
                        <div className="grid grid-cols-2 gap-1 text-sm mb-3">
                          {['originality', 'technical', 'relevance', 'clarity', 'references'].map((dim) => (
                            <div key={dim} className="flex items-center gap-2">
                              <span className="text-gray-500 capitalize w-24">{dim}:</span>
                              <StarRating score={r[`score_${dim}`]} />
                            </div>
                          ))}
                        </div>
                        {r.overall_recommendation && (
                          <p className="text-sm mb-2">
                            <span className="font-medium">Recommendation:</span>{' '}
                            <span className="capitalize">{r.overall_recommendation.replace(/_/g, ' ')}</span>
                          </p>
                        )}
                        {r.comments_to_authors && (
                          <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 mt-2">
                            <p className="font-medium text-xs text-gray-500 mb-1">Comments to Authors:</p>
                            {r.comments_to_authors}
                          </div>
                        )}
                        {r.comments_to_editor && (
                          <div className="bg-yellow-50 rounded p-3 text-sm text-gray-700 mt-2">
                            <p className="font-medium text-xs text-yellow-600 mb-1">Confidential — Editor Only:</p>
                            {r.comments_to_editor}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Decision panel */}
          <Section title="Final Decision">
            <textarea
              rows={3}
              placeholder="Editor comments to the author…"
              value={decisionComments}
              onChange={(e) => setDecisionComments(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'accepted', label: 'Accept', color: 'bg-green-600 hover:bg-green-700' },
                { key: 'revision_requested', label: 'Minor Revision', color: 'bg-yellow-500 hover:bg-yellow-600' },
                { key: 'revision_requested', label: 'Major Revision', color: 'bg-orange-500 hover:bg-orange-600' },
                { key: 'rejected', label: 'Reject', color: 'bg-red-600 hover:bg-red-700' },
              ].map((d) => (
                <button
                  key={d.label}
                  onClick={() => handleDecision(d.key)}
                  disabled={decidingAs !== null}
                  className={`py-2.5 text-white font-semibold rounded-lg text-sm ${d.color} disabled:opacity-50`}
                >
                  {decidingAs === d.key ? '…' : d.label}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Agent Pipeline Status Panel (inside SubmissionDrawer)
   ═══════════════════════════════════════════════════════════ */

function AgentPipelinePanel({ submission, onRefresh }) {
  const [agentData, setAgentData] = useState(null);
  const [suggestedReviewers, setSuggestedReviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [triggeringPipeline, setTriggeringPipeline] = useState(false);
  const [consultEmail, setConsultEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [status, reviewerData] = await Promise.all([
          getAgentStatus(submission.id),
          getSuggestedReviewers(submission.id).catch(() => ({ suggestions: [] })),
        ]);
        if (!cancelled) {
          setAgentData(status);
          setSuggestedReviewers(reviewerData.suggestions || []);
        }
      } catch {
        if (!cancelled) setAgentData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submission.id]);

  const handleTriggerPipeline = async () => {
    setTriggeringPipeline(true);
    try {
      await triggerAgentPipeline(submission.id, { consult_party_email: consultEmail || null });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setTriggeringPipeline(false);
    }
  };

  const toggleReviewer = (id) => {
    setSelectedReviewerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const handleAssignViaAgents = async () => {
    if (selectedReviewerIds.length < 2) return;
    setAssigning(true);
    try {
      await editorAssignReviewers(submission.id, { reviewer_ids: selectedReviewerIds });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <Section title="Agent Pipeline"><SkeletonRows rows={3} /></Section>;

  const pipelineSteps = [
    { agent: 'Agent 1', label: 'Acknowledgement', done: !!agentData?.paper_id_code },
    { agent: 'Agent 2', label: 'Format Check', done: !!agentData?.format_check_report },
    { agent: 'Agent 3', label: 'Reviewer Suggestion', done: suggestedReviewers.length > 0 },
    { agent: 'Agent 4', label: 'Review Links', done: submission.status === 'under_review' },
    { agent: 'Agent 5', label: 'Notifications', done: submission.status === 'under_review' },
  ];

  return (
    <Section title="Agent Pipeline">
      {/* Pipeline Progress */}
      <div className="flex items-center gap-1 mb-4">
        {pipelineSteps.map((step, idx) => (
          <React.Fragment key={step.agent}>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              step.done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
            }`}>
              <span>{step.done ? '✅' : '⏳'}</span>
              <span>{step.label}</span>
            </div>
            {idx < pipelineSteps.length - 1 && <span className="text-gray-300">→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Paper ID */}
      {agentData?.paper_id_code && (
        <div className="bg-blue-50 rounded-lg px-4 py-2 mb-3 text-sm">
          <span className="text-gray-500">Paper ID:</span>{' '}
          <span className="font-mono font-bold text-blue-700">{agentData.paper_id_code}</span>
        </div>
      )}

      {/* Format Check Summary */}
      {agentData?.format_check_report && (
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Format Check</p>
          <div className="flex gap-3 text-xs">
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
              ✅ {agentData.format_check_report.passed} passed
            </span>
            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
              ⚠️ {agentData.format_check_report.warnings} warnings
            </span>
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded">
              ❌ {agentData.format_check_report.failures} failures
            </span>
          </div>
        </div>
      )}

      {/* Consult Party Decision */}
      {agentData?.consult_party_decision && (
        <div className={`rounded-lg px-4 py-2 mb-3 text-sm ${
          agentData.consult_party_decision === 'approve' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          Consult Party: <strong>{agentData.consult_party_decision === 'approve' ? 'Approved' : 'Rejected'}</strong>
        </div>
      )}

      {/* Trigger Pipeline Button */}
      {!agentData?.paper_id_code && submission.status === 'pending_assignment' && (
        <div className="space-y-2 mb-4">
          <input
            type="email" placeholder="Consult party email (optional)"
            value={consultEmail} onChange={(e) => setConsultEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <button
            onClick={handleTriggerPipeline}
            disabled={triggeringPipeline}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
          >
            {triggeringPipeline ? 'Triggering…' : '🚀 Trigger Agent Pipeline'}
          </button>
        </div>
      )}

      {/* Suggested Reviewers from Agent 3 */}
      {suggestedReviewers.length > 0 && submission.status !== 'under_review' && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Agent-Suggested Reviewers ({suggestedReviewers.length})
          </p>
          <div className="space-y-2">
            {suggestedReviewers.map((r, idx) => (
              <label
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedReviewerIds.includes(r.reviewer_id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                {r.reviewer_id && (
                  <input
                    type="checkbox"
                    checked={selectedReviewerIds.includes(r.reviewer_id)}
                    onChange={() => toggleReviewer(r.reviewer_id)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {r.affiliation} {r.expertise && `· ${r.expertise}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-blue-700">
                    {Math.round((r.match_score || 0) * 100)}%
                  </span>
                  <p className="text-xs text-gray-400">{r.source}</p>
                </div>
              </label>
            ))}
          </div>
          {selectedReviewerIds.length >= 2 && (
            <button
              onClick={handleAssignViaAgents}
              disabled={assigning}
              className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {assigning ? 'Assigning via Agents…' : `Assign ${selectedReviewerIds.length} Reviewers (Agent 4+5)`}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Utility sub-components
   ═══════════════════════════════════════════════════════════ */

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex gap-3 text-sm py-1">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-gray-900">{children}</span>
    </div>
  );
}

function PlaceholderPanel({ title }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        {title} panel — coming soon.
      </div>
    </div>
  );
}
