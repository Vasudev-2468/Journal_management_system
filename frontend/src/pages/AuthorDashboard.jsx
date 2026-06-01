import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { getAuthorProfile, getAuthorToken, authorLogout } from '../api/authorAuth';

/* ── Status metadata ─────────────────────────────────── */
export const STATUS_META = {
  pending_classification:         { label: 'Processing',           color: 'gray',   icon: '⏳', milestone: 0 },
  awaiting_format_check:          { label: 'Format Check',         color: 'blue',   icon: '🔍', milestone: 1 },
  awaiting_consult_review:        { label: 'Editorial Review',     color: 'blue',   icon: '📋', milestone: 1 },
  awaiting_reviewer_suggestions:  { label: 'Finding Reviewers',    color: 'purple', icon: '🔬', milestone: 1 },
  pending_assignment:             { label: 'Assigning Reviewers',  color: 'purple', icon: '👥', milestone: 2 },
  under_review:                   { label: 'Under Review',         color: 'yellow', icon: '📖', milestone: 2 },
  revision_requested:             { label: 'Revision Requested',   color: 'orange', icon: '✏️',  milestone: 3 },
  returned_to_author:             { label: 'Returned to Author',   color: 'orange', icon: '↩️',  milestone: 3 },
  accepted:                       { label: 'Accepted',             color: 'green',  icon: '✅', milestone: 4 },
  rejected:                       { label: 'Rejected',             color: 'red',    icon: '❌', milestone: 3 },
};

const COLOR_CLS = {
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   border: 'border-gray-200'   },
  blue:   { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   border: 'border-blue-200'   },
  purple: { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  yellow: { bg: 'bg-yellow-50',  text: 'text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-200' },
  orange: { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-orange-200' },
  green:  { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200'  },
  red:    { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200'    },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'gray', icon: '•' };
  const c = COLOR_CLS[m.color];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {m.icon} {m.label}
    </span>
  );
}

function MiniProgress({ milestone }) {
  const steps = 5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: steps }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${i < milestone ? 'bg-green-500' : i === milestone ? 'bg-yellow-400' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ icon, label, value, color = 'green' }) {
  const colors = {
    green:  'from-green-50 to-emerald-50 border-green-100 text-green-700',
    yellow: 'from-yellow-50 to-amber-50 border-yellow-100 text-yellow-700',
    blue:   'from-blue-50 to-sky-50 border-blue-100 text-blue-700',
    purple: 'from-purple-50 to-violet-50 border-purple-100 text-purple-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-black">{value}</p>
        <p className="text-xs font-semibold opacity-80">{label}</p>
      </div>
    </div>
  );
}

/* ─── Notification Bell ─────────────────────────────── */
const NOTIFS = [
  { id: 1, icon: '📋', text: 'Paper JNL-2026-045 moved to peer review', time: '2 days ago', unread: true },
  { id: 2, icon: '📬', text: 'Decision letter available for JNL-2026-045', time: '5 days ago', unread: true },
  { id: 3, icon: '✅', text: 'Initial check passed for JNL-2026-032', time: 'Apr 10', unread: false },
];

const CSS = `
@keyframes bell-shake{0%,100%{transform:rotate(0)}10%{transform:rotate(12deg)}20%{transform:rotate(-10deg)}30%{transform:rotate(8deg)}40%{transform:rotate(-6deg)}50%{transform:rotate(4deg)}60%{transform:rotate(-2deg)}}
@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.bell-shake{animation:bell-shake .7s ease-in-out}
.fade-in{animation:fade-in .25s ease both}
`;

/* ═══════════════════════════════════════════════════════
   DASHBOARD — list of all author submissions
═══════════════════════════════════════════════════════ */
export default function AuthorDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile]       = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [notifOpen, setNotifOpen]   = useState(false);
  const [bellShake, setBellShake]   = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setBellShake(true); setTimeout(() => setBellShake(false), 1500); }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Guard: no token → send to sign-in immediately
    if (!getAuthorToken()) {
      navigate('/author-login', { replace: true });
      return;
    }
    async function load() {
      try {
        const [prof, subRes] = await Promise.all([
          getAuthorProfile(),
          client.get('/submissions/my-submissions', {
            headers: { Authorization: `Bearer ${getAuthorToken()}` },
          }),
        ]);
        setProfile(prof);
        setSubmissions(subRes.data.items || []);
      } catch (e) {
        if (e?.response?.status === 401) {
          navigate('/author-login', { replace: true });
        } else {
          setError('Could not load your submissions. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const handleLogout = () => { authorLogout(); navigate('/author-login'); };

  /* Derived stats */
  const stats = {
    total:      submissions.length,
    underReview: submissions.filter(s => ['under_review','pending_assignment','awaiting_reviewer_suggestions'].includes(s.status)).length,
    decisions:  submissions.filter(s => ['revision_requested','returned_to_author'].includes(s.status)).length,
    accepted:   submissions.filter(s => s.status === 'accepted').length,
  };

  /* Filter + search */
  const visible = submissions.filter(s => {
    const matchSearch = !search || s.paper_title.toLowerCase().includes(search.toLowerCase()) || (s.paper_id_code || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const authorName = profile?.full_name || 'Author';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
          <p className="text-sm text-green-700 font-medium">Loading your submissions…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      <div className="min-h-screen bg-[#f0f7f0] pb-16">

        {/* ── Nav ──────────────────────────────────────── */}
        <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2 no-underline">
                <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                </div>
                <span className="font-bold text-gray-900 text-sm hidden sm:block">Journal of AI Research</span>
              </Link>
              <span className="text-gray-300 hidden sm:block">|</span>
              <span className="text-sm font-semibold text-green-700 hidden sm:block">My Submissions</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Bell */}
              <div className="relative" ref={notifRef}>
                <button onClick={() => { setNotifOpen(v => !v); setBellShake(false); }} className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
                  <svg className={`w-5 h-5 text-gray-600 ${bellShake ? 'bell-shake' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">2</span>
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 fade-in overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="font-bold text-gray-900 text-sm">Notifications</span>
                      <span className="text-xs text-green-700 font-semibold cursor-pointer">Mark all read</span>
                    </div>
                    {NOTIFS.map(n => (
                      <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 ${n.unread ? 'bg-green-50/40' : ''}`}>
                        <span className="text-lg shrink-0">{n.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${n.unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.text}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                        </div>
                        {n.unread && <span className="w-2 h-2 bg-green-500 rounded-full shrink-0 mt-1.5" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-full px-3 py-1.5">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {authorName[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-green-800 hidden sm:block max-w-[120px] truncate">{authorName}</span>
              </div>

              <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-600 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* ── Header ─────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-gray-900">My Submissions</h1>
              <p className="text-sm text-gray-500 mt-0.5">Track every paper you've submitted, all in one place.</p>
            </div>
            <Link
              to="/submit"
              className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold text-sm px-5 py-2.5 rounded-2xl transition-colors shadow-sm shadow-green-200 no-underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Submit New Paper
            </Link>
          </div>

          {/* ── Stats row ──────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon="📄" label="Total Submissions" value={stats.total}       color="green"  />
            <StatCard icon="📖" label="Under Review"      value={stats.underReview} color="yellow" />
            <StatCard icon="✏️"  label="Action Required"  value={stats.decisions}   color="purple" />
            <StatCard icon="✅" label="Accepted"           value={stats.accepted}    color="blue"   />
          </div>

          {/* ── Search + Filter ─────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title or manuscript ID…"
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-2xl outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition-all"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-green-400 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_META).map(([val, m]) => (
                <option key={val} value={val}>{m.icon} {m.label}</option>
              ))}
            </select>
          </div>

          {/* ── Error ────────────────────────────────────── */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
              {error}
            </div>
          )}

          {/* ── Submission Cards ────────────────────────── */}
          {visible.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              {submissions.length === 0 ? (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No submissions yet</h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                    Share your research with the world. Submit your first manuscript to get started.
                  </p>
                  <Link to="/submit" className="inline-flex items-center gap-2 bg-green-700 text-white font-semibold text-sm px-6 py-3 rounded-2xl hover:bg-green-800 transition-colors no-underline">
                    Submit Your First Paper
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No results found</h3>
                  <p className="text-sm text-gray-500">Try adjusting your search or filter.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {visible.map((sub, idx) => {
                const meta = STATUS_META[sub.status] || { label: sub.status, color: 'gray', icon: '•', milestone: 0 };
                const c    = COLOR_CLS[meta.color];
                const isNew = idx === 0 && submissions.length === 1;
                return (
                  <div
                    key={sub.id}
                    onClick={() => navigate(`/author-dashboard/${sub.paper_id_code || sub.id}`)}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-green-200 cursor-pointer transition-all group p-5 space-y-4"
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
                            {sub.paper_id_code || sub.id.slice(0, 8).toUpperCase()}
                          </span>
                          <StatusBadge status={sub.status} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-green-800 transition-colors">
                          {sub.paper_title}
                        </h3>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-green-500 transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-medium">Submission Progress</span>
                        <span className="text-xs font-bold text-gray-600">{Math.round((meta.milestone / 4) * 100)}%</span>
                      </div>
                      <MiniProgress milestone={meta.milestone} />
                      <div className="flex justify-between">
                        {['Submitted','Check','Review','Decision','Published'].map((s, i) => (
                          <span key={i} className={`text-xs ${i <= meta.milestone ? 'text-green-600 font-semibold' : 'text-gray-300'}`}>{s}</span>
                        ))}
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-50 flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        {sub.classified_field && (
                          <span className="text-xs text-gray-500 truncate max-w-[160px]" title={sub.classified_field}>
                            🏷 {sub.classified_field.split('—')[0].trim()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {sub.review_count > 0 && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            {sub.review_count} review{sub.review_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span>📅 {formatDate(sub.submitted_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Count footer ──────────────────────────── */}
          {visible.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              Showing {visible.length} of {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
