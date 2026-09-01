import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  fetchAnalyticsOverview,
  fetchNotificationLog,
  fetchReviewers,
  inviteReviewer,
  getReviewerInvitationLink,
  resendReviewerInvitation,
  revokeReviewerInvitation,
  deleteReviewer,
  fetchOverdueReviews,
  requestAdditionalReview,
  fetchEditorBadges,
  bulkUpdateSubmissions,
} from '../api/editor';
import { useJournal } from '../context/JournalContext';
import NotificationBell from '../components/editor/NotificationBell';
import PageActionBar from '../components/common/PageActionBar';

// Canonical, human-readable labels for the structured reject-reason codes
// the backend accepts. Kept next to the top-level imports so both the
// decision dropdown and any future analytics view render the same
// user-facing strings from a single source of truth.
const REJECT_REASON_OPTIONS = [
  { code: 'out_of_scope', label: 'Out of scope' },
  { code: 'insufficient_novelty', label: 'Insufficient novelty' },
  { code: 'methodology_flawed', label: 'Methodology flawed' },
  { code: 'inconclusive_results', label: 'Inconclusive results' },
  { code: 'poor_writing', label: 'Poor writing' },
  { code: 'ethics_concern', label: 'Ethics concern' },
  { code: 'plagiarism_suspected', label: 'Plagiarism suspected' },
  { code: 'duplicate_submission', label: 'Duplicate submission' },
];

// Statuses an editor can bulk-apply via the SubmissionsPanel floating bar.
// Kept short on purpose — bulk state changes are for triage, not decisions.
const BULK_STATUS_OPTIONS = [
  '',
  'pending_classification',
  'awaiting_format_check',
  'pending_assignment',
  'under_review',
  'revision_requested',
  'returned_to_author',
  'accepted',
  'rejected',
];

// JG-101 — dismissible banner shown to editors while the journal has not yet
// been ISSN-registered. Public site omits the ISSN line entirely in that state;
// the editor gets a nudge with a direct link to the identity edit page.
const IssnNotRegisteredBanner = () => {
  const { journal } = useJournal();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !journal || journal.issn_online) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-amber-900">ISSN not registered</p>
        <p className="text-amber-800 mt-0.5">
          The journal has no online ISSN on file. Indexers (Scholar, Index Copernicus, DOAJ) will not accept the journal until an ISSN is recorded.{' '}
          <Link to="/editor/journal-identity" className="font-medium underline hover:no-underline">
            Set it now
          </Link>
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-700 hover:text-amber-900 text-sm font-medium px-2"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

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

// `countKey` names a field on the /editor-badges/counts payload; the sidebar
// looks that key up on every render and renders a small red circle when the
// value is > 0. Entries without a `countKey` never show a badge.
const SIDEBAR_ITEMS = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'pending', label: 'Pending Actions', icon: '⏳', badge: true, countKey: 'pending_actions' },
  { key: 'submissions', label: 'All Submissions', icon: '📄' },
  { key: 'reviewers', label: 'Reviewers', icon: '👥' },
  { key: 'notifications', label: 'Notifications Log', icon: '🔔', countKey: 'notifications_unread' },
  { key: 'analytics', label: 'Analytics', icon: '📈' },
];

const SIDEBAR_LINKS = [
  { to: '/editor/production', label: 'Production Queue', icon: '⚙️', countKey: 'production_queue' },
  { to: '/editor/issues', label: 'Volumes & Issues', icon: '📚' },
  { to: '/editor/special-issues', label: 'Special Issues', icon: '✨' },
  { to: '/editor/editorial-board', label: 'Editorial Board', icon: '🧑‍🎓' },
  { to: '/editor/announcements', label: 'Announcements', icon: '📣' },
  { to: '/editor/policies', label: 'Policy Pages', icon: '📜' },
  { to: '/editor/contact-inbox', label: 'Contact Inbox', icon: '📬', countKey: 'contact_inbox_unread' },
  { to: '/editor/journal-identity', label: 'Journal Identity', icon: '🏛️' },
  { to: '/editor/email-templates', label: 'Email Templates', icon: '✉️' },
  { to: '/editor/users', label: 'User Management', icon: '👤' },
  { to: '/editor/audit-log', label: 'Audit Log', icon: '📋' },
];

// Small red-circle counter used next to any sidebar entry with a matching
// `countKey`. Hidden when the count is falsy so idle rows stay clean.
const CountBadge = ({ count }) => {
  if (!count) return null;
  return (
    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
      {count > 99 ? '99+' : count}
    </span>
  );
};

export default function EditorDashboard() {
  const [activePanel, setActivePanel] = useState('overview');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerSubmission, setDrawerSubmission] = useState(null);
  // Overdue review IDs feed the "Overdue" filter chip in the submissions
  // list. We keep the raw ID list AND the count so the chip badge stays
  // accurate even before the submissions payload has arrived.
  const [overdueIds, setOverdueIds] = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  // Sidebar badge counts — polled from /editor-badges/counts. Missing keys
  // are treated as zero, so a partial payload never crashes the render.
  const [badgeCounts, setBadgeCounts] = useState({});

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

  const loadOverdue = useCallback(async () => {
    try {
      const data = await fetchOverdueReviews();
      setOverdueIds(Array.isArray(data?.submission_ids) ? data.submission_ids : []);
      setOverdueCount(typeof data?.count === 'number' ? data.count : 0);
    } catch (e) {
      // Non-fatal: chip simply reports zero if the endpoint hiccups.
      console.error('Failed to load overdue reviews', e);
    }
  }, []);

  const loadBadgeCounts = useCallback(async () => {
    try {
      const data = await fetchEditorBadges();
      setBadgeCounts(data && typeof data === 'object' ? data : {});
    } catch (e) {
      // Non-fatal — a hiccup just leaves the previous counts on screen.
      console.error('Failed to load editor badge counts', e);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
    loadOverdue();
  }, [loadSubmissions, loadOverdue]);

  // Poll badge counts every 60s. Ticks pause while the tab is hidden — the
  // browser throttles setInterval on background tabs and that's fine here.
  useEffect(() => {
    loadBadgeCounts();
    const id = setInterval(loadBadgeCounts, 60000);
    return () => clearInterval(id);
  }, [loadBadgeCounts]);

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
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-blue-800">Journal Editor</h1>
            <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
          </div>
          {/* Floating notification bell — polls /editor-portal/notifications */}
          <NotificationBell />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => {
            // Sidebar entries with a `countKey` show the polled backend count.
            // The legacy pending badge falls back to the locally-computed
            // pendingCount when the /editor-badges/counts response is not in
            // yet, so first render still shows the number the user sees below.
            const polledCount = item.countKey ? badgeCounts[item.countKey] : 0;
            const shownCount =
              item.countKey === 'pending_actions'
                ? polledCount ?? pendingCount
                : polledCount;
            return (
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
                <CountBadge count={shownCount} />
              </button>
            );
          })}
          <div className="pt-3 mt-3 border-t border-gray-100">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Journal admin
            </p>
            {SIDEBAR_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 no-underline"
              >
                <span>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.countKey && (
                  <CountBadge count={badgeCounts[item.countKey]} />
                )}
              </Link>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <IssnNotRegisteredBanner />
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
              overdueIds={overdueIds}
              overdueCount={overdueCount}
            />
          )}
          {activePanel === 'reviewers' && <ReviewersPanel />}
          {activePanel === 'notifications' && <NotificationsLogPanel />}
          {activePanel === 'analytics' && <AnalyticsPanel />}
        </div>
      </main>

      {/* Detail Drawer */}
      {drawerSubmission && (
        <SubmissionDrawer
          submission={drawerSubmission}
          onClose={() => setDrawerSubmission(null)}
          onRefresh={() => {
            loadSubmissions();
            loadOverdue();
          }}
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

  useEffect(() => {
    let cancelled = false;
    if (submission.status === 'pending_assignment') {
      setLoadingSuggestions(true);
      suggestReviewers(submission.id)
        .then((data) => {
          if (!cancelled) setSuggestions(data);
        })
        .catch((e) => {
          if (!cancelled) console.error(e);
        })
        .finally(() => {
          if (!cancelled) setLoadingSuggestions(false);
        });
    }
    return () => {
      cancelled = true;
    };
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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationLog({ limit: 20 })
      .then((data) => {
        if (!cancelled) setEntries(data?.entries || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load activity.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
        Loading activity…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="bg-white rounded-xl border border-red-200 px-6 py-6 text-sm text-red-600"
      >
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center">
        <p className="text-sm text-gray-500">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {entries.map((entry) => (
        <div key={entry.id} className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-800">{entry.trigger_event}</span>
            <span
              className={
                entry.status === 'sent'
                  ? 'text-xs px-2 py-0.5 rounded bg-green-100 text-green-700'
                  : entry.status === 'failed'
                  ? 'text-xs px-2 py-0.5 rounded bg-red-100 text-red-700'
                  : 'text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700'
              }
            >
              {entry.status}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {entry.channel} · {entry.recipient || 'unknown recipient'}
            {entry.sent_at ? ` · ${new Date(entry.sent_at).toLocaleString()}` : ''}
          </div>
          {entry.preview && (
            <p className="mt-1 text-gray-600 line-clamp-2">{entry.preview}</p>
          )}
          {entry.error_message && (
            <p className="mt-1 text-red-600 text-xs">Error: {entry.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Submissions Panel (table)
   ═══════════════════════════════════════════════════════════ */

function SubmissionsPanel({
  submissions,
  loading,
  title,
  onOpenDrawer,
  onRefresh,
  overdueIds = [],
  overdueCount = 0,
}) {
  const [filterStatus, setFilterStatus] = useState('');
  const [filterField, setFilterField] = useState('');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // ── Bulk selection state ────────────────────────────
  // A Set of submission ids the editor has checked in the table. The
  // floating action bar appears while at least one row is selected.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState(null);

  // O(1) lookup against the overdue set the backend returned.
  const overdueSet = React.useMemo(() => new Set(overdueIds || []), [overdueIds]);

  const filtered = submissions.filter((s) => {
    if (overdueOnly && !overdueSet.has(s.id)) return false;
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

  // ── Bulk selection helpers ─────────────────────────
  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredIds = filtered.map((s) => s.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await bulkUpdateSubmissions(Array.from(selectedIds), { status: bulkStatus });
      clearSelection();
      setBulkStatus('');
      onRefresh?.();
    } catch (e) {
      setBulkError(
        e?.response?.data?.detail || e?.message || 'Bulk update failed.',
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const submissionColumns = [
    { header: 'Paper ID', accessor: (s) => s.paper_id_code || s.id },
    { header: 'Title', accessor: (s) => s.paper_title },
    { header: 'Author', accessor: (s) => s.author_name },
    { header: 'Email', accessor: (s) => s.author_email },
    { header: 'Status', accessor: (s) => (s.status || '').replace(/_/g, ' ') },
    { header: 'Field', accessor: (s) => s.classified_field || '' },
    { header: 'Submitted', accessor: (s) => new Date(s.submitted_at).toLocaleDateString() },
    { header: 'Reviews', accessor: (s) => s.reviewer_count ?? 0 },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <PageActionBar
          download={{
            filenameBase: title.toLowerCase().replace(/\s+/g, '-'),
            rows: filtered,
            columns: submissionColumns,
            pdfTitle: title,
          }}
          share={{ subject: `${title} — Journal Editor` }}
        />
      </div>

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
        {/*
          "Overdue" chip filter — highlights submissions with any pending
          review past its expiry. Amber-500 accent per design spec.
        */}
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
          title="Filter to submissions with expired pending reviews"
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            overdueOnly
              ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
              : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
          }`}
        >
          Overdue ({overdueCount})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden relative">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all filtered submissions"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  className="rounded border-gray-300 text-blue-600"
                />
              </th>
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
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No submissions match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onOpenDrawer(s)}
                  className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                    selectedIds.has(s.id) ? 'bg-blue-50/60' : ''
                  }`}
                >
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.paper_title}`}
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleRow(s.id)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                  </td>
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

      {/*
        Floating action bar — appears while at least one row is checked.
        Sticky-bottom position keeps it in view as the editor scrolls a
        long submissions table. Non-fixed layout so it doesn't overlap
        the sidebar or other panels.
      */}
      {selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-white shadow-lg px-4 py-3"
        >
          <span className="text-sm font-semibold text-gray-800">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500" htmlFor="bulk-status-select">
              Bulk update status
            </label>
            <select
              id="bulk-status-select"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              disabled={bulkBusy}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
            >
              {BULK_STATUS_OPTIONS.map((s) => (
                <option key={s || 'empty'} value={s}>
                  {s ? s.replace(/_/g, ' ') : '— pick a status —'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyBulkStatus}
              disabled={!bulkStatus || bulkBusy}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded disabled:opacity-50"
            >
              {bulkBusy ? '…' : 'Apply'}
            </button>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkBusy}
            className="px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded disabled:opacity-50"
          >
            Clear selection
          </button>
          {bulkError && (
            <span role="alert" className="text-xs text-red-600 ml-2">
              {bulkError}
            </span>
          )}
        </div>
      )}
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
  // Which decision the editor has queued up for submission. Drives whether
  // the "Reason (optional)" dropdown is shown (only for `rejected`).
  const [pendingDecision, setPendingDecision] = useState(null);
  const [rejectReasonCode, setRejectReasonCode] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [requestingAdditional, setRequestingAdditional] = useState(false);
  // Simple inline toast — a lightweight banner within the drawer so the
  // action's outcome is visible without pulling in a new toast library.
  const [additionalToast, setAdditionalToast] = useState(null);

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
      const payload = { decision, editor_comments: decisionComments };
      // Only ship the structured reason when the editor picked one AND
      // the outgoing decision is `rejected` — anything else the backend
      // ignores, but we drop it here too to keep payloads honest.
      if (decision === 'rejected' && rejectReasonCode) {
        payload.reject_reason_code = rejectReasonCode;
      }
      await submitDecision(submission.id, payload);
      onRefresh();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setDecidingAs(null);
    }
  };

  const handleDecisionClick = (decision) => {
    // Clicking a decision immediately submits — except for `rejected`,
    // where we first give the editor a chance to pick a reason from the
    // canonical list. A second click on the same button confirms.
    if (decision === 'rejected' && pendingDecision !== 'rejected') {
      setPendingDecision('rejected');
      return;
    }
    setPendingDecision(decision);
    handleDecision(decision);
  };

  const handleRequestAdditionalReview = async () => {
    setRequestingAdditional(true);
    setAdditionalToast(null);
    try {
      const result = await requestAdditionalReview(submission.id);
      setAdditionalToast({
        kind: 'success',
        text:
          result?.message ||
          'Submission reopened for one additional reviewer assignment.',
      });
      onRefresh();
    } catch (e) {
      setAdditionalToast({
        kind: 'error',
        text:
          e?.response?.data?.detail ||
          e?.message ||
          'Could not request additional review.',
      });
    } finally {
      setRequestingAdditional(false);
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
                { key: 'minor_revision', label: 'Minor Revision', color: 'bg-yellow-500 hover:bg-yellow-600' },
                { key: 'major_revision', label: 'Major Revision', color: 'bg-orange-500 hover:bg-orange-600' },
                { key: 'rejected', label: 'Reject', color: 'bg-red-600 hover:bg-red-700' },
              ].map((d) => (
                <button
                  key={d.label}
                  onClick={() => handleDecisionClick(d.key)}
                  disabled={decidingAs !== null}
                  className={`py-2.5 text-white font-semibold rounded-lg text-sm ${d.color} disabled:opacity-50`}
                >
                  {decidingAs === d.key
                    ? '…'
                    : d.key === 'rejected' && pendingDecision === 'rejected'
                    ? 'Confirm Reject'
                    : d.label}
                </button>
              ))}
            </div>

            {/*
              Structured reject-reason picker — only visible after the
              editor stages a `rejected` decision. Optional field: the
              backend ignores it for anything but a reject, and empty is
              accepted here too. Click Reject again to confirm.
            */}
            {pendingDecision === 'rejected' && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <label
                  htmlFor="reject-reason-select"
                  className="block text-xs font-semibold text-red-800 uppercase tracking-wider mb-2"
                >
                  Reason (optional)
                </label>
                <select
                  id="reject-reason-select"
                  value={rejectReasonCode}
                  onChange={(e) => setRejectReasonCode(e.target.value)}
                  disabled={decidingAs !== null}
                  className="w-full px-3 py-2 border border-red-300 rounded text-sm bg-white"
                >
                  <option value="">— no specific reason —</option>
                  {REJECT_REASON_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-red-700">
                  Click <span className="font-semibold">Reject</span> once more to confirm.
                </p>
              </div>
            )}

            {/*
              Second-opinion escape hatch — reopens the submission for one
              more reviewer assignment (POST /reviews/{id}/request-additional-review).
              Kept below the decision buttons so it doesn't compete for
              attention with accept/reject.
            */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleRequestAdditionalReview}
                disabled={requestingAdditional || decidingAs !== null}
                className="w-full sm:w-auto px-4 py-2 bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 font-semibold rounded-lg text-sm disabled:opacity-50"
              >
                {requestingAdditional ? 'Requesting…' : 'Request additional review'}
              </button>
              {additionalToast && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                    additionalToast.kind === 'success'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {additionalToast.text}
                </div>
              )}
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

/* ═══════════════════════════════════════════════════════════
   Reviewers Panel
   ═══════════════════════════════════════════════════════════ */

function InviteReviewerModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [expertise, setExpertise] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canSubmit =
    name.trim().length >= 2 &&
    /.+@.+\..+/.test(email.trim()) &&
    expertise.trim().length > 0 &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const tags = expertise
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await inviteReviewer({
        name: name.trim(),
        email: email.trim(),
        institution: institution.trim() || null,
        whatsapp_number: whatsapp.trim() || null,
        expertise_tags: tags,
      });
      setSuccess(result?.message || 'Invitation sent.');
      // Give the editor a beat to see the confirmation before the list refreshes.
      setTimeout(onSuccess, 900);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not send the invitation.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-reviewer-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="invite-reviewer-title" className="text-lg font-bold text-gray-900">
              Invite reviewer
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              The reviewer receives an email with auto-generated login
              credentials and Accept / Reject buttons. They have 21 days
              to respond — after that, the agent auto-revokes the invite.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Full name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
              minLength={2}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Email *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Institution</span>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">
              WhatsApp number (optional, E.164)
            </span>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+919876543210"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">
              Expertise tags * (comma-separated)
            </span>
            <input
              type="text"
              value={expertise}
              onChange={(e) => setExpertise(e.target.value)}
              placeholder="machine learning, computer vision, remote sensing"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <span className="mt-1 block text-[11px] text-gray-500">
              Used for expertise-based reviewer suggestions on new submissions.
            </span>
          </label>

          {error && (
            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Status pill for a Reviewer row ────────────────────
 *
 * Collapses the new panel-membership lifecycle into the pill shown in
 * the Reviewers table. The invitation flow is:
 *   editor invites → reviewer receives email with credentials +
 *   Accept/Reject buttons → 21-day window → auto-revoke agent runs.
 *
 *   inactive  — editor deactivated the reviewer entirely.
 *   declined  — reviewer clicked Reject; row parked for the audit trail.
 *   revoked   — invitation invalidated (editor revoke or auto-revoke
 *               agent after 21 days).
 *   accepted  — reviewer clicked Accept; login is unlocked.
 *   pending   — invited but no response yet; window still open.
 *   active    — legacy row (self-registered or pre-migration) with no
 *               formal invitation-flow footprint.
 */
function reviewerStatus(r) {
  if (!r.is_active) return 'inactive';
  if (r.invitation_declined_at) return 'declined';
  if (r.invitation_revoked_at) return 'revoked';
  if (r.invitation_accepted_at) return 'accepted';
  if (r.invitation_expires_at || r.invitation_sent_at) return 'pending';
  return 'active';
}

const REVIEWER_STATUS_STYLES = {
  active:   { cls: 'bg-green-100 text-green-700',       label: 'active' },
  accepted: { cls: 'bg-emerald-100 text-emerald-700',   label: 'accepted' },
  pending:  { cls: 'bg-amber-100 text-amber-800',       label: 'pending' },
  revoked:  { cls: 'bg-rose-100 text-rose-700',         label: 'revoked' },
  declined: { cls: 'bg-slate-200 text-slate-700',       label: 'declined' },
  inactive: { cls: 'bg-gray-200 text-gray-600',         label: 'inactive' },
};

function ReviewerStatusPill({ status }) {
  const style = REVIEWER_STATUS_STYLES[status] || REVIEWER_STATUS_STYLES.active;
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${style.cls}`}>{style.label}</span>
  );
}

// Copyable invitation link modal. Rendered when the editor clicks
// "Show invite link" on a pending or revoked reviewer.
function InvitationLinkModal({ reviewer, url, expiresAt, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — user can still select the field and copy.
    }
  };
  const expires = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog" aria-modal="true" aria-labelledby="invite-link-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 id="invite-link-title" className="text-lg font-bold text-gray-900">
              Accept link for {reviewer.name}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Share this link out-of-band (chat, phone). Opening it
              records the reviewer's Accept — after that they sign in
              with the credentials from their invitation email.
              {expires ? <> Expires <strong>{expires}</strong>.</> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >×</button>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-50"
            aria-label="Activation URL"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation modal for delete / revoke. Small and single-purpose so
// each destructive action gets its own explicit review step.
function ConfirmModal({ title, body, confirmLabel, confirmClass, onCancel, onConfirm, busy }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog" aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <div className="text-sm text-gray-600 mb-5">{body}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${confirmClass} disabled:bg-gray-300 disabled:cursor-not-allowed`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Per-row inline action buttons. Rendered as small text pills so
// every available action is visible at a glance — a kebab menu hides
// the surface area and, worse, the popover gets clipped by the
// table wrapper's rounded-corner overflow. Options adapt to the
// reviewer's status: any reviewer that has NOT yet set a password
// still lives in the invitation flow (pending, revoked, or a legacy
// "active" row without a stamped invitation_sent_at) and gets the
// invite-link / resend controls; only currently-pending reviewers can
// be revoked; delete is hidden when the reviewer has any current load
// (server also enforces).
function ReviewerRowActions({ reviewer, busy, onAction }) {
  const status = reviewerStatus(reviewer);
  // Invite-flow actions are meaningful while the reviewer has not yet
  // accepted. Once the reviewer accepts, they own the account and the
  // panel switches to deactivate/delete controls.
  const canInviteOps = !reviewer.invitation_accepted_at;
  const canRevoke = status === 'pending';
  const canDelete = reviewer.current_load === 0;

  const btn = (label, action, extraCls) => (
    <button
      type="button"
      onClick={() => onAction(action)}
      disabled={busy}
      className={
        'px-2 py-1 text-xs font-semibold rounded border transition-colors ' +
        'disabled:opacity-50 disabled:cursor-not-allowed ' +
        extraCls
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {canInviteOps && btn(
        'Show link',
        'link',
        'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100',
      )}
      {canInviteOps && btn(
        'Resend',
        'resend',
        'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100',
      )}
      {canRevoke && btn(
        'Revoke',
        'revoke',
        'border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100',
      )}
      {canDelete
        ? btn(
            'Delete',
            'delete',
            'border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100',
          )
        : (
          <span
            className="px-2 py-1 text-xs text-gray-400"
            title="Delete disabled — reviewer has active assignments."
          >
            Delete —
          </span>
        )}
    </div>
  );
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'pending',  label: 'Pending response' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'revoked',  label: 'Revoked' },
  { value: 'inactive', label: 'Inactive' },
];

function ReviewersPanel() {
  const [reviewers, setReviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // Row-level UI state — the invite-link modal, a pending confirm
  // dialog (revoke / delete), and per-row transient "working…" flags
  // so the kebab menu can disable itself while a request is in flight.
  const [linkModal, setLinkModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  // The status pill is derived client-side too so the filter can
  // remain snappy even before the next server round-trip lands.
  // ``inactive`` and ``revoked`` are still sent as a server-side
  // filter (backend supports it) so the count stays honest for
  // filtered exports.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // The default view hides inactive — legacy behaviour. Passing
    // ``status`` narrows to the exact pill; ``all`` still hides
    // inactive so the panel doesn't grow noisy over time.
    const params =
      statusFilter === 'all'
        ? { is_active: true }
        : statusFilter === 'inactive'
        ? { is_active: false }
        : { status: statusFilter };
    fetchReviewers(params)
      .then((data) => {
        if (!cancelled) setReviewers(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail || err?.message || 'Failed to load reviewers.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, reloadTick]);

  const filtered = reviewers.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.institution?.toLowerCase().includes(q) ||
      (r.expertise_tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const showToast = (message, tone = 'success') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3200);
  };

  const handleShowLink = async (reviewer) => {
    setBusyId(reviewer.id);
    try {
      const data = await getReviewerInvitationLink(reviewer.id);
      setLinkModal({
        reviewer,
        url: data.invitation_url,
        expiresAt: data.expires_at,
      });
    } catch (err) {
      showToast(
        err?.response?.data?.detail || 'Could not fetch invitation link.',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (reviewer) => {
    setBusyId(reviewer.id);
    try {
      const data = await resendReviewerInvitation(reviewer.id);
      showToast(data.message || 'Invitation resent.');
      setReloadTick((t) => t + 1);
    } catch (err) {
      showToast(
        err?.response?.data?.detail || 'Could not resend invitation.',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = (reviewer) => {
    setConfirm({
      kind: 'revoke',
      reviewer,
      title: `Revoke invitation for ${reviewer.name}?`,
      body:
        'The activation link in their inbox will stop working. You can resend a fresh invitation later — the reviewer row stays on the list.',
      confirmLabel: 'Revoke invitation',
      confirmClass: 'bg-amber-600 hover:bg-amber-700',
    });
  };

  const handleDelete = (reviewer) => {
    setConfirm({
      kind: 'delete',
      reviewer,
      title: `Delete ${reviewer.name}?`,
      body:
        'This removes the reviewer from the panel. Reviewers with review history cannot be deleted — deactivate them instead.',
      confirmLabel: 'Delete reviewer',
      confirmClass: 'bg-rose-600 hover:bg-rose-700',
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { reviewer, kind } = confirm;
    setBusyId(reviewer.id);
    try {
      if (kind === 'revoke') {
        await revokeReviewerInvitation(reviewer.id);
        showToast('Invitation revoked.');
      } else if (kind === 'delete') {
        await deleteReviewer(reviewer.id);
        showToast('Reviewer deleted.');
      }
      setConfirm(null);
      setReloadTick((t) => t + 1);
    } catch (err) {
      showToast(
        err?.response?.data?.detail ||
          (kind === 'delete'
            ? 'Could not delete reviewer.'
            : 'Could not revoke invitation.'),
        'error',
      );
      setConfirm(null);
    } finally {
      setBusyId(null);
    }
  };

  const dispatchRowAction = (reviewer, action) => {
    if (action === 'link') return handleShowLink(reviewer);
    if (action === 'resend') return handleResend(reviewer);
    if (action === 'revoke') return handleRevoke(reviewer);
    if (action === 'delete') return handleDelete(reviewer);
    return undefined;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Reviewers</h2>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
        >
          <span aria-hidden>+</span> Invite reviewer
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, institution, or expertise…"
          className="flex-1 min-w-[240px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
          aria-label="Search reviewers"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Filter reviewers by status"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {toast && (
        <div
          role="status"
          className={`mb-3 px-3 py-2 rounded-lg text-sm border ${
            toast.tone === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {inviteOpen && (
        <InviteReviewerModal
          onClose={() => setInviteOpen(false)}
          onSuccess={() => {
            setInviteOpen(false);
            setReloadTick((t) => t + 1);
          }}
        />
      )}

      {linkModal && (
        <InvitationLinkModal
          reviewer={linkModal.reviewer}
          url={linkModal.url}
          expiresAt={linkModal.expiresAt}
          onClose={() => setLinkModal(null)}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          confirmClass={confirm.confirmClass}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          busy={busyId === confirm.reviewer.id}
        />
      )}

      {loading ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <div role="alert" className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-600">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
          {reviewers.length === 0
            ? 'No reviewers match this filter yet.'
            : 'No reviewers match your search.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 rounded-tl-xl">Name</th>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Expertise</th>
                <th className="px-4 py-3">Load</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.institution || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.expertise_tags || []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {(r.expertise_tags || []).length > 4 && (
                        <span className="text-xs text-gray-500">
                          +{r.expertise_tags.length - 4} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.current_load}/{r.max_assignments}
                  </td>
                  <td className="px-4 py-3">
                    <ReviewerStatusPill status={reviewerStatus(r)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ReviewerRowActions
                      reviewer={r}
                      busy={busyId === r.id}
                      onAction={(action) => dispatchRowAction(r, action)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Notifications Log Panel
   ═══════════════════════════════════════════════════════════ */

// ── Notification event catalog ──────────────────────────
// Maps the backend's snake_case trigger_event codes to a designer-facing
// label, an emoji-icon glyph, and a Tailwind color family. Anything not
// listed falls back to a neutral "Notification" card so an unknown event
// name still renders cleanly.
const NOTIF_EVENT_CATALOG = {
  editor_mfa_otp_email:    { label: 'Editor sign-in code',      icon: '🔐', color: 'indigo' },
  author_mfa_otp_email:    { label: 'Author sign-in code',      icon: '🔐', color: 'indigo' },
  reviewer_mfa_otp_email:  { label: 'Reviewer sign-in code',    icon: '🔐', color: 'indigo' },
  password_reset_request:  { label: 'Password reset link',      icon: '🔑', color: 'slate' },
  reviewer_invitation:     { label: 'Reviewer invitation',      icon: '📨', color: 'blue' },
  reviewer_welcome:        { label: 'Reviewer welcome',         icon: '✨', color: 'emerald' },
  reviewer_reminder:       { label: 'Reviewer reminder',        icon: '⏰', color: 'amber' },
  author_acknowledgment:   { label: 'Submission received',      icon: '✅', color: 'emerald' },
  editor_new_submission:   { label: 'New submission',           icon: '📄', color: 'blue' },
  editor_escalation:       { label: 'Escalation',               icon: '⚠️', color: 'rose' },
  decision_to_author:      { label: 'Decision sent to author',  icon: '⚖️', color: 'purple' },
  contact_message:         { label: 'Contact message',          icon: '💬', color: 'cyan' },
};

const NOTIF_COLOR_STYLES = {
  indigo:  { chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',   icon: 'bg-indigo-100 text-indigo-700' },
  slate:   { chip: 'bg-slate-50 text-slate-700 border-slate-200',      icon: 'bg-slate-100 text-slate-700' },
  blue:    { chip: 'bg-blue-50 text-blue-700 border-blue-200',         icon: 'bg-blue-100 text-blue-700' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',icon: 'bg-emerald-100 text-emerald-700' },
  amber:   { chip: 'bg-amber-50 text-amber-800 border-amber-200',      icon: 'bg-amber-100 text-amber-700' },
  rose:    { chip: 'bg-rose-50 text-rose-700 border-rose-200',         icon: 'bg-rose-100 text-rose-700' },
  purple:  { chip: 'bg-purple-50 text-purple-700 border-purple-200',   icon: 'bg-purple-100 text-purple-700' },
  cyan:    { chip: 'bg-cyan-50 text-cyan-700 border-cyan-200',         icon: 'bg-cyan-100 text-cyan-700' },
  gray:    { chip: 'bg-gray-50 text-gray-700 border-gray-200',         icon: 'bg-gray-100 text-gray-700' },
};

function describeEvent(code) {
  if (!code) return { label: 'Notification', icon: '📬', color: 'gray' };
  if (NOTIF_EVENT_CATALOG[code]) return NOTIF_EVENT_CATALOG[code];
  // Prettify an unknown snake_case code as a fallback: "some_event" → "Some event".
  const pretty = code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
  return { label: pretty, icon: '📬', color: 'gray' };
}

function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1 min ago';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function NotificationStatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const map = {
    sent:    { cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', label: 'Delivered' },
    failed:  { cls: 'bg-rose-100 text-rose-800 ring-rose-200',          dot: 'bg-rose-500',    label: 'Failed' },
    pending: { cls: 'bg-amber-100 text-amber-800 ring-amber-200',       dot: 'bg-amber-500 animate-pulse', label: 'Pending' },
  };
  const spec = map[s] || { cls: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400', label: s || 'unknown' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${spec.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${spec.dot}`} aria-hidden />
      {spec.label}
    </span>
  );
}

function NotificationsLogPanel() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // full-message modal
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 100 };
    if (channelFilter) params.channel = channelFilter;
    if (statusFilter) params.status = statusFilter;
    fetchNotificationLog(params)
      .then((data) => {
        if (!cancelled) {
          setEntries(data?.entries || []);
          setTotal(data?.total || 0);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail || err?.message || 'Failed to load notifications.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelFilter, statusFilter, reloadTick]);

  // Derive the event-code choices from what's in view so the filter
  // dropdown never advertises an event the current dataset can't show.
  const uniqueEvents = React.useMemo(() => {
    const seen = new Set();
    for (const e of entries) if (e.trigger_event) seen.add(e.trigger_event);
    return Array.from(seen).sort();
  }, [entries]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (eventFilter && e.trigger_event !== eventFilter) return false;
      if (!q) return true;
      return (
        (e.recipient || '').toLowerCase().includes(q) ||
        (e.trigger_event || '').toLowerCase().includes(q) ||
        (describeEvent(e.trigger_event).label || '').toLowerCase().includes(q) ||
        (e.preview || '').toLowerCase().includes(q)
      );
    });
  }, [entries, search, eventFilter]);

  const counts = React.useMemo(() => {
    const acc = { sent: 0, failed: 0, pending: 0 };
    for (const e of entries) if (acc[e.status] !== undefined) acc[e.status] += 1;
    return acc;
  }, [entries]);

  return (
    <div>
      {/* ── Header + summary tiles ─────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-sm text-gray-500 mt-1">
            Every automated email and message sent from JGAIR, newest first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadTick((t) => t + 1)}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 bg-white rounded-lg px-3 py-2"
          aria-label="Reload notifications"
        >
          <span aria-hidden>↻</span> Reload
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryTile label="Total" value={total} tone="gray" />
        <SummaryTile label="Delivered" value={counts.sent} tone="emerald" />
        <SummaryTile label="Failed" value={counts.failed} tone="rose" />
        <SummaryTile label="Pending" value={counts.pending} tone="amber" />
      </div>

      {/* ── Filter bar ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient, event, or message…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search notifications"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Filter by event"
          >
            <option value="">All events</option>
            {uniqueEvents.map((code) => (
              <option key={code} value={code}>
                {describeEvent(code).label}
              </option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Filter by channel"
          >
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="sent">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────── */}
      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <div role="alert" className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="text-4xl mb-2" aria-hidden>📭</div>
          <p className="text-gray-600 font-medium">No notifications match the current filters.</p>
          <p className="text-xs text-gray-400 mt-1">Try clearing the search or filter selections above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const meta = describeEvent(entry.trigger_event);
            const styles = NOTIF_COLOR_STYLES[meta.color] || NOTIF_COLOR_STYLES.gray;
            return (
              <button
                type="button"
                key={entry.id}
                onClick={() => setSelected(entry)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-none w-10 h-10 rounded-lg flex items-center justify-center text-lg ${styles.icon}`}
                    aria-hidden
                  >
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-gray-900">{meta.label}</span>
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border ${styles.chip}`}>
                        {entry.channel}
                      </span>
                      <NotificationStatusPill status={entry.status} />
                      <span
                        className="text-xs text-gray-400 ml-auto"
                        title={entry.sent_at ? new Date(entry.sent_at).toLocaleString() : ''}
                      >
                        {relativeTime(entry.sent_at)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-700 truncate">
                      <span className="text-gray-500">To:</span>{' '}
                      <span className="font-medium">{entry.recipient || '—'}</span>
                    </div>
                    {entry.preview && (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {entry.preview}
                      </p>
                    )}
                    {entry.error_message && (
                      <p className="mt-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 inline-block">
                        Delivery error: {entry.error_message}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <NotificationDetailModal
          entry={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }) {
  const bg = {
    gray:    'bg-gray-50 border-gray-200 text-gray-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    rose:    'bg-rose-50 border-rose-200 text-rose-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
  }[tone] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function NotificationDetailModal({ entry, onClose }) {
  const meta = describeEvent(entry.trigger_event);
  const styles = NOTIF_COLOR_STYLES[meta.color] || NOTIF_COLOR_STYLES.gray;
  // Render the raw HTML in a sandboxed iframe so its inline CSS cannot
  // leak into the dashboard's own styling. srcdoc keeps everything
  // self-contained — no network requests, no scripts.
  const srcDoc = React.useMemo(() => {
    const html = entry.body_html || entry.preview || '';
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f5f5;padding:12px;}</style></head><body>${html}</body></html>`;
  }, [entry]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className={`flex-none w-10 h-10 rounded-lg flex items-center justify-center text-lg ${styles.icon}`} aria-hidden>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900">{meta.label}</h3>
              <NotificationStatusPill status={entry.status} />
              <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border ${styles.chip}`}>
                {entry.channel}
              </span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              <span className="text-gray-500">To </span>
              <span className="font-medium">{entry.recipient || '—'}</span>
              <span className="text-gray-400"> · </span>
              <span title={entry.sent_at ? new Date(entry.sent_at).toLocaleString() : ''}>
                {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : 'not sent'}
              </span>
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
              event: {entry.trigger_event}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {entry.error_message && (
          <div className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <span className="font-semibold">Delivery error: </span>
            {entry.error_message}
          </div>
        )}

        <div className="flex-1 overflow-hidden p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Message
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <iframe
              title="Notification message body"
              sandbox=""
              srcDoc={srcDoc}
              className="w-full h-[55vh] block bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Analytics Panel
   Editorial analytics: stat cards, submissions-over-time,
   and status funnel. Data comes from
   GET /editor-portal/analytics/overview?range=this_year|all_time
   ═══════════════════════════════════════════════════════════ */

const FUNNEL_COLORS = {
  submitted: 'bg-blue-500',
  under_review: 'bg-indigo-500',
  revision_requested: 'bg-amber-500',
  accepted: 'bg-emerald-500',
  rejected: 'bg-rose-500',
};

function AnalyticsPanel() {
  const [range, setRange] = useState('this_year');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAnalyticsOverview(range)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || 'Failed to load analytics'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">
            Editorial pipeline health at a glance.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          {[
            { key: 'this_year', label: 'This year' },
            { key: 'all_time', label: 'All time' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRange(opt.key)}
              className={`px-3 py-1 rounded-md transition font-medium ${
                range === opt.key
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {loading || !data
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          : data.stat_cards.map((s) => (
              <div
                key={s.key}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  {s.label}
                </p>
                <p className="text-3xl font-bold mt-2 text-gray-900">{s.value}</p>
                {s.hint && (
                  <p className="text-xs text-gray-400 mt-1">{s.hint}</p>
                )}
              </div>
            ))}
      </div>

      {/* Submissions over time */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Submissions Over Time</h3>
          <span className="text-xs text-gray-400">
            {range === 'this_year' ? 'Jan → current month' : 'Rolling 12 months'}
          </span>
        </div>
        {loading || !data ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <SubmissionsBarChart buckets={data.submissions_over_time} />
        )}
      </div>

      {/* Status funnel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Pipeline Snapshot</h3>
          <span className="text-xs text-gray-400">Count at each stage</span>
        </div>
        {loading || !data ? (
          <SkeletonRows rows={5} />
        ) : (
          <StatusFunnel stages={data.status_funnel} />
        )}
      </div>
    </div>
  );
}

function SubmissionsBarChart({ buckets }) {
  const width = 800;
  const height = 240;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 42;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  // Round the axis up to a friendly integer.
  const axisMax = Math.max(5, Math.ceil(maxCount / 5) * 5);
  const gridLines = 4;

  if (buckets.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No submissions in this range yet.
      </div>
    );
  }

  const barGap = 6;
  const barSlot = chartW / buckets.length;
  const barW = Math.max(4, barSlot - barGap);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56" role="img" aria-label="Submissions over time">
        {/* Y grid + labels */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padTop + (chartH * i) / gridLines;
          const value = Math.round(axisMax - (axisMax * i) / gridLines);
          return (
            <g key={i}>
              <line
                x1={padLeft} x2={width - padRight} y1={y} y2={y}
                stroke="#e5e7eb" strokeWidth="1"
              />
              <text
                x={padLeft - 6} y={y + 4}
                textAnchor="end" fontSize="11" fill="#9ca3af"
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const h = (b.count / axisMax) * chartH;
          const x = padLeft + i * barSlot + barGap / 2;
          const y = padTop + chartH - h;
          return (
            <g key={b.month}>
              <rect
                x={x} y={y} width={barW} height={h}
                fill="#4f46e5" rx="3"
              >
                <title>{`${b.label}: ${b.count} submission${b.count === 1 ? '' : 's'}`}</title>
              </rect>
              <text
                x={x + barW / 2} y={padTop + chartH + 16}
                textAnchor="middle" fontSize="10" fill="#6b7280"
                transform={
                  buckets.length > 8
                    ? `rotate(-40 ${x + barW / 2} ${padTop + chartH + 16})`
                    : undefined
                }
              >
                {b.label.split(' ')[0]}
              </text>
              {b.count > 0 && (
                <text
                  x={x + barW / 2} y={y - 4}
                  textAnchor="middle" fontSize="10" fill="#374151" fontWeight="600"
                >
                  {b.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StatusFunnel({ stages }) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-3">
      {stages.map((s) => {
        const pct = (s.count / maxCount) * 100;
        const color = FUNNEL_COLORS[s.key] || 'bg-gray-400';
        return (
          <div key={s.key} className="flex items-center gap-4">
            <div className="w-40 shrink-0 text-sm font-medium text-gray-700">
              {s.label}
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
              <div
                className={`h-full ${color} rounded-full transition-all duration-300`}
                style={{ width: `${Math.max(pct, s.count > 0 ? 2 : 0)}%` }}
              />
              <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-gray-800">
                {s.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
