import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { getAuthorProfile, getAuthorToken, authorLogout } from '../api/authorAuth';
import { STATUS_META } from './AuthorDashboard';
import ReviewerCommentsCard from '../components/authors/ReviewerCommentsCard';
import DecisionLetterCard from '../components/authors/DecisionLetterCard';
import SubmissionThread from '../components/authors/SubmissionThread';
import SubmissionTimeline from '../components/authors/SubmissionTimeline';

/* ─── Styles ─────────────────────────────────────────── */
const CSS = `
@keyframes bell-shake{0%,100%{transform:rotate(0)}10%{transform:rotate(12deg)}20%{transform:rotate(-10deg)}30%{transform:rotate(8deg)}40%{transform:rotate(-6deg)}50%{transform:rotate(4deg)}60%{transform:rotate(-2deg)}}
@keyframes progress-fill{from{width:0%}}
@keyframes pulse-ring{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(22,163,74,.5)}70%{transform:scale(1);box-shadow:0 0 0 8px rgba(22,163,74,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(22,163,74,0)}}
@keyframes float-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.bell-shake{animation:bell-shake .7s ease-in-out}
.pulse-ring{animation:pulse-ring 1.8s ease-in-out infinite}
.float-up{animation:float-up .3s ease both}
`;

/* ─── Milestones ─────────────────────────────────────── */
const MILESTONES = [
  { label: 'Submitted',      icon: '📤' },
  { label: 'Initial Check',  icon: '🔍' },
  { label: 'Under Review',   icon: '📖' },
  { label: 'Decision',       icon: '⚖️' },
  { label: 'Production',     icon: '🖨️' },
  { label: 'Published',      icon: '🌍' },
];

/* ─── Anonymised reviewer slot placeholders ────────────
 * The author never sees reviewer identities or their comments here.
 * Anonymised reviewer feedback is served by ReviewerCommentsCard once
 * the editorial decision is out. This module used to ship three fake
 * reviewer bubbles with invented comment strings — they were removed
 * so authors don't see fabricated feedback.
 */
const REVIEWER_SLOT = (initials, status, label, ring, bg) => ({
  initials, status, label, ring, bg,
});

/* ─── SVG Donut ─────────────────────────────────────── */
function DonutChart({ reviewCount }) {
  const total = Math.max(3, reviewCount);
  const done  = Math.min(reviewCount, total);
  const pct   = Math.round((done / total) * 100);
  const r     = 52, cx = 70, cy = 70;
  const circ  = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="14"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#16a34a" strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x={cx} y={cy-6}  textAnchor="middle" fontSize="22" fontWeight="800" fill="#111827">{pct}%</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="11" fill="#6b7280">{done}/{total} reviews</text>
    </svg>
  );
}

/* ─── Timeline ──────────────────────────────────────── */
function Timeline({ current }) {
  return (
    <div className="relative pl-7">
      <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-gray-200"/>
      <div className="absolute left-3.5 top-3 w-0.5 bg-green-500 transition-all duration-1000"
        style={{ height: `${Math.max(0, (current / (MILESTONES.length - 1)) * 100)}%` }}/>
      {MILESTONES.map((m, i) => {
        const past   = i < current;
        const active = i === current;
        return (
          <div key={i} className="relative flex items-start gap-3 mb-5 last:mb-0">
            <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold transition-all
              ${past   ? 'bg-green-500 text-white shadow-md shadow-green-200' : ''}
              ${active ? 'bg-green-600 text-white ring-4 ring-green-100 shadow-lg' : ''}
              ${!past && !active ? 'bg-gray-100 text-gray-400 border border-gray-200' : ''}`}>
              {past ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              ) : <span>{m.icon}</span>}
              {active && <span className="absolute inset-0 rounded-full pulse-ring opacity-50"/>}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${active ? 'text-green-700' : past ? 'text-gray-700' : 'text-gray-400'}`}>
                  {m.label}
                </span>
                {active && <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 font-semibold">Current step</span>}
                {past    && <span className="text-xs text-green-500 font-semibold">✓ Done</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── QR mock ────────────────────────────────────────── */
function QRMock() {
  const rows = [
    [1,1,1,1,1,1,1,0,1,0,0,1,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,1,1,0,0,1,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,0,1,1,0,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,1,1,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0],
    [1,0,1,1,0,0,1,1,0,1,1,0,1,0,1,1,0,0,1,1],
    [0,1,0,0,1,0,0,1,0,0,1,1,0,0,1,0,0,1,0,0],
    [1,1,0,1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,0,1],
    [0,0,1,0,0,1,0,0,1,0,0,0,1,1,0,0,1,0,0,1],
    [1,0,1,1,0,0,1,1,0,1,1,0,1,0,1,1,0,0,1,0],
    [0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,1,0,0,1],
    [1,1,1,1,1,1,1,0,0,0,1,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,0,1,0,0,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,0,0,0,0,1],
    [1,0,0,0,0,0,1,0,0,1,0,1,0,1,0,0,1,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,1,0,0,1,0,0,0,1,0],
  ];
  const cell = 8;
  return (
    <svg width={20*cell} height={18*cell} viewBox={`0 0 ${20*cell} ${18*cell}`}>
      {rows.map((row, r) => row.map((v, c) => v
        ? <rect key={`${r}-${c}`} x={c*cell} y={r*cell} width={cell-1} height={cell-1} fill="#1B4332" rx="1"/>
        : null
      ))}
    </svg>
  );
}

/* ─── Video Card ─────────────────────────────────────── */
function VideoCard({ title, subtitle, gradient, onPlay }) {
  const [h, setH] = useState(false);
  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer"
      style={{ background: gradient, minHeight: 120 }}
      onClick={onPlay}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-white">
        <div className={`w-11 h-11 rounded-full bg-white/20 flex items-center justify-center transition-all ${h ? 'bg-white/35 scale-110' : ''}`}>
          <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <p className="text-xs font-bold text-center leading-tight">{title}</p>
        <p className="text-xs opacity-70 text-center">{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── PDF Thumbnail ─────────────────────────────────── */
function PDFThumb({ onOpen }) {
  return (
    <div onClick={onOpen} className="cursor-pointer rounded-xl border-2 border-gray-200 hover:border-green-400 transition-all shadow hover:shadow-lg overflow-hidden w-24 group" title="Preview submitted manuscript">
      <div className="bg-red-600 px-2 py-1 flex items-center gap-1">
        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/></svg>
        <span className="text-white text-xs font-bold">PDF</span>
      </div>
      <div className="bg-white px-1.5 py-2 space-y-0.5">
        <div className="h-1.5 bg-gray-700 rounded w-full"/>
        <div className="h-1.5 bg-gray-400 rounded w-4/5"/>
        <div className="h-1.5 bg-gray-300 rounded w-full"/>
        {[90,80,100,85,75,100,90].map((w,i) => <div key={i} className="h-1 bg-gray-200 rounded" style={{width:`${w}%`}}/>)}
      </div>
      <div className="bg-gray-50 py-1 text-center">
        <span className="text-xs text-green-700 font-semibold">Preview</span>
      </div>
    </div>
  );
}

/* ─── PDF Preview Modal ─────────────────────────────── */
function PDFModal({ title, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full float-up overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
          <span className="text-white font-bold text-sm truncate">📄 {title}</span>
          <button onClick={onClose} className="text-white/80 hover:text-white ml-2 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 bg-gray-50 min-h-[280px]">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-3">
            <div className="text-center space-y-1">
              <div className="h-3 bg-gray-800 rounded w-3/4 mx-auto"/>
              <div className="h-2 bg-gray-500 rounded w-1/2 mx-auto"/>
            </div>
            <div className="text-xs font-bold text-gray-700">Abstract</div>
            {[100,90,95,85,88,78].map((w,i) => <div key={i} className="h-1.5 bg-gray-200 rounded" style={{width:`${w}%`}}/>)}
            <div className="text-xs font-bold text-gray-700 mt-2">1. Introduction</div>
            {[100,92,88,95,80].map((w,i) => <div key={i} className="h-1.5 bg-gray-200 rounded" style={{width:`${w}%`}}/>)}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800">Close</button>
          <button className="px-4 py-2 text-sm bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors">Download PDF</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Help Modal ─────────────────────────────────────── */
function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full float-up" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 px-6 py-5 rounded-t-3xl flex items-center justify-between">
          <span className="text-white font-bold">Help & Tutorials</span>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div
            className="relative rounded-2xl overflow-hidden cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#1e40af,#7c3aed)', height: 130 }}
            onClick={() => alert('▶ Playing: 60-second Submission Portal Walkthrough')}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
              <div className="w-12 h-12 bg-white/25 rounded-full flex items-center justify-center hover:bg-white/40 transition">
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <p className="text-sm font-bold">1-Min Portal Walkthrough</p>
            </div>
          </div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">FAQs</p>
          <div className="space-y-1.5">
            {['How long does peer review take?','How do I contact my editor?','What happens after the decision?','How do I revise and resubmit?','When will my DOI be assigned?'].map((q,i) => (
              <button key={i} onClick={() => alert(q)} className="w-full text-left flex items-center gap-2 p-2.5 rounded-xl hover:bg-blue-50 transition-colors group">
                <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">Q</span>
                <span className="text-sm text-gray-700 group-hover:text-blue-700">{q}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ════════════════════════════════════════════════════
   SUBMISSION DETAIL PAGE
════════════════════════════════════════════════════ */
export default function AuthorSubmissionDetail() {
  const { submissionId } = useParams();
  const navigate = useNavigate();

  const [profile,    setProfile]    = useState(null);
  const [sub,        setSub]        = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [barFilled,  setBarFilled]  = useState(false);
  const [pdfOpen,    setPdfOpen]    = useState(false);
  const [helpOpen,   setHelpOpen]   = useState(false);

  useEffect(() => {
    if (!getAuthorToken()) {
      navigate('/author-login', { replace: true });
      return;
    }
    async function load() {
      try {
        const [prof, res] = await Promise.all([
          getAuthorProfile(),
          client.get(`/submissions/my-submissions/${submissionId}`, {
            headers: { Authorization: `Bearer ${getAuthorToken()}` },
          }),
        ]);
        setProfile(prof);
        setSub(res.data);
      } catch (e) {
        if (e?.response?.status === 401) {
          navigate('/author-login', { replace: true });
        } else {
          setError(e?.response?.status === 404 ? 'Submission not found.' : 'Could not load submission details.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    // navigate is stable — safe to omit from deps; only the id should re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  useEffect(() => {
    if (sub) { const t = setTimeout(() => setBarFilled(true), 200); return () => clearTimeout(t); }
  }, [sub]);

  const handleLogout = () => { authorLogout(); navigate('/author-login'); };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"/>
          <p className="text-sm text-green-700 font-medium">Loading submission…</p>
        </div>
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="min-h-screen bg-[#f0f7f0] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{error || 'Submission not found'}</h2>
          <button onClick={() => navigate('/author-dashboard')} className="mt-4 px-5 py-2.5 bg-green-700 text-white rounded-2xl font-semibold text-sm hover:bg-green-800 transition-colors">
            ← Back to My Submissions
          </button>
        </div>
      </div>
    );
  }

  const meta      = STATUS_META[sub.status] || { label: sub.status, color: 'gray', icon: '•', milestone: 0 };
  const progress  = Math.round((meta.milestone / 4) * 100);
  const paperId   = sub.paper_id_code || sub.id.slice(0, 8).toUpperCase();
  const authorName = profile?.full_name || 'Author';

  /* Reviewer slots: assigned count from DB (anonymised), then pending
     placeholders up to 3. No comment strings — real anonymised feedback
     lands via ReviewerCommentsCard once the decision is out. */
  const assigned = Math.max(0, Math.min(sub.review_count || 0, 3));
  const reviewers = [
    ...Array.from({ length: assigned }, (_, i) =>
      REVIEWER_SLOT(`R${i + 1}`, 'assigned', 'Review in progress', 'ring-blue-400', 'bg-blue-500'),
    ),
    ...Array.from({ length: Math.max(0, 3 - assigned) }, () =>
      REVIEWER_SLOT('?', 'pending', 'Awaiting reviewer', 'ring-gray-300', 'bg-gray-300'),
    ),
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen bg-[#f0f7f0] pb-24">

        {/* ── Nav ─────────────────────────────────────── */}
        <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/author-dashboard')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                My Submissions
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-bold text-green-700 truncate max-w-[160px]">{paperId}</span>
            </div>
            <div className="flex items-center gap-3">
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

          {/* ── Author-facing decision surfaces ─────────── */}
          <DecisionLetterCard
            submissionId={sub.id}
            status={sub.status}
            paperTitle={sub.paper_title}
            authorName={profile?.full_name || 'Author'}
            paperIdCode={sub.paper_id_code || null}
          />
          <ReviewerCommentsCard
            submissionId={sub.id}
            status={sub.status}
          />
          {/* Aggregated per-manuscript event stream — submissions +
              review assignments/completions + decisions + revisions +
              production stages, stitched together server-side. Sits
              directly under the reviewer-comments / decision-letter
              cards so the reader has full editorial context in one
              scroll. */}
          <SubmissionTimeline submissionId={sub.id} />
          <SubmissionThread submissionId={sub.id} viewerRole="author" />

          {/* ── Hero card ─────────────────────────────── */}
          <div className="bg-gradient-to-r from-green-900 via-green-800 to-emerald-800 rounded-3xl p-6 sm:p-8 text-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full border border-white/20 backdrop-blur-sm font-mono">
                    📋 {paperId}
                  </span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border backdrop-blur-sm
                    ${meta.color === 'green'  ? 'bg-green-400/25  text-green-200  border-green-400/30'  : ''}
                    ${meta.color === 'yellow' ? 'bg-yellow-400/25 text-yellow-200 border-yellow-400/30' : ''}
                    ${meta.color === 'red'    ? 'bg-red-400/25    text-red-200    border-red-400/30'    : ''}
                    ${!['green','yellow','red'].includes(meta.color) ? 'bg-white/15 text-white/80 border-white/20' : ''}
                  `}>
                    {meta.icon} {meta.label}
                  </span>
                </div>
                <h1 className="text-base sm:text-xl font-black text-white leading-snug mb-2 line-clamp-2">
                  {sub.paper_title}
                </h1>
                <p className="text-green-300 text-xs">
                  {sub.classified_field || 'Category pending'} · Submitted {formatDate(sub.submitted_at)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link to="/submit" className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors no-underline">
                  + New Submission
                </Link>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-200">Overall Progress</span>
                <span className="text-sm font-black text-white">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-1000"
                  style={{ width: barFilled ? `${progress}%` : '0%' }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                {['Submitted','Check','Review','Decision','Published'].map((s, i) => (
                  <span key={i} className={`text-xs font-medium ${i <= meta.milestone ? 'text-green-300' : 'text-white/30'}`}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ── 4-card status grid ─────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '📋', label: 'Status',         value: meta.label,           sub: `Updated ${formatDate(sub.updated_at)}`,  color: meta.color },
              { icon: '🔬', label: 'Peer Reviews',   value: `${sub.review_count} submitted`, sub: `of 3 expected`,   color: sub.review_count >= 3 ? 'green' : 'yellow' },
              { icon: '⚖️', label: 'Decision',        value: meta.milestone >= 3 ? meta.label : 'Pending', sub: meta.milestone >= 3 ? 'See details below' : 'Awaiting all reviews', color: meta.milestone >= 3 ? meta.color : 'gray' },
              { icon: '📊', label: 'Category',        value: (sub.classified_field || 'Pending').split('—')[0].trim(), sub: sub.classification_confidence ? `${(sub.classification_confidence * 100).toFixed(0)}% confidence` : 'AI classification', color: 'blue' },
            ].map((card) => {
              const cc = { green: 'border-green-200 bg-green-50', yellow: 'border-yellow-200 bg-yellow-50', gray: 'border-gray-200 bg-gray-50', blue: 'border-blue-200 bg-blue-50', orange: 'border-orange-200 bg-orange-50', red: 'border-red-200 bg-red-50', purple: 'border-purple-200 bg-purple-50' };
              const tc = { green: 'text-green-700', yellow: 'text-yellow-700', gray: 'text-gray-600', blue: 'text-blue-700', orange: 'text-orange-700', red: 'text-red-700', purple: 'text-purple-700' };
              return (
                <div key={card.label} className={`rounded-2xl border p-4 ${cc[card.color] || cc.gray}`}>
                  <div className="text-2xl mb-2">{card.icon}</div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
                  <p className={`text-sm font-black ${tc[card.color] || tc.gray}`}>{card.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
                </div>
              );
            })}
          </div>

          {/* ── Timeline + Donut + Reviewers ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Editorial Timeline</p>
                  <p className="text-xs text-gray-400">Submission milestones</p>
                </div>
              </div>
              <Timeline current={meta.milestone} />
            </div>

            {/* Donut */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 self-start">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Review Progress</p>
                  <p className="text-xs text-gray-400">Peer review completion</p>
                </div>
              </div>
              <DonutChart reviewCount={sub.review_count} />
              <div className="grid grid-cols-3 gap-2 w-full text-center">
                {[
                  { label: 'Completed', val: Math.min(sub.review_count, 3), color: 'text-green-600' },
                  { label: 'In Progress', val: sub.review_count < 3 ? 1 : 0, color: 'text-yellow-600' },
                  { label: 'Pending',    val: Math.max(0, 3 - sub.review_count - (sub.review_count < 3 ? 1 : 0)), color: 'text-gray-400' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-2">
                    <p className={`text-base font-black ${item.color}`}>{item.val}</p>
                    <p className="text-xs text-gray-400">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviewers */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Reviewers (Blind)</p>
                  <p className="text-xs text-gray-400">Identities are anonymous</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {reviewers.map((rv, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 p-2 rounded-2xl"
                  >
                    <div className={`w-14 h-14 rounded-full ${rv.bg} ring-3 ring-offset-2 ${rv.ring} flex items-center justify-center text-white text-sm font-black shadow-md`}>
                      {rv.initials}
                    </div>
                    <div className={`text-center px-1.5 py-0.5 rounded-lg border text-xs font-semibold
                      ${rv.status === 'assigned' ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
                      ${rv.status === 'pending'  ? 'bg-gray-50 border-gray-200 text-gray-500' : ''}
                    `}>{rv.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mt-3">
                Anonymised reviewer feedback appears below once the editorial decision is out.
              </p>
            </div>
          </div>

          {/* ── Abstract + Keywords ───────────────────── */}
          {sub.abstract && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm font-bold text-gray-900 mb-3">Abstract</p>
              <p className="text-sm text-gray-700 leading-relaxed">{sub.abstract}</p>
              {sub.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {sub.keywords.map((k, i) => (
                    <span key={i} className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Explainer videos ─────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-sm font-bold text-gray-900 mb-1">Explainer Videos</p>
            <p className="text-xs text-gray-400 mb-4">Understand each stage of the editorial process</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <VideoCard title="Peer Review Flow" subtitle="30 sec" gradient="linear-gradient(135deg,#1B4332,#2D6A4F)" onPlay={() => alert('▶ Peer Review Flow Explainer (30 sec)')}/>
              <VideoCard title="Decision Letter Download" subtitle="45 sec" gradient="linear-gradient(135deg,#1e40af,#3b82f6)" onPlay={() => alert('▶ Decision Letter Download Tutorial (45 sec)')}/>
              <VideoCard title="Production Process" subtitle="60 sec" gradient="linear-gradient(135deg,#7c3aed,#a78bfa)" onPlay={() => alert('▶ Production Process Explainer (60 sec)')}/>
            </div>
          </div>

          {/* ── PDF + QR ──────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm font-bold text-gray-900 mb-1">Submitted Manuscript</p>
              <p className="text-xs text-gray-400 mb-4">Click the thumbnail to preview your uploaded PDF</p>
              <div className="flex items-start gap-4">
                <PDFThumb onOpen={() => setPdfOpen(true)} />
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Manuscript ID</p>
                    <p className="text-xs font-mono font-bold text-green-800">{paperId}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Submitted</p>
                    <p className="text-xs text-gray-700">{formatDate(sub.submitted_at)}</p>
                  </div>
                  <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5 hover:bg-green-100 transition-colors">
                    Open Preview
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm font-bold text-gray-900 mb-1">Article DOI & QR Code</p>
              <p className="text-xs text-gray-400 mb-4">Assigned upon acceptance and publication</p>
              <div className="flex items-center gap-4">
                <div className="border-2 border-gray-200 rounded-xl p-2 bg-white shadow-sm shrink-0">
                  <QRMock />
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">DOI</p>
                    <p className="text-xs font-mono text-blue-600 break-all">https://doi.org/10.1234/jnl.2026.{paperId.split('-').pop()}</p>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">Scan to view article once published</p>
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2.5 py-0.5 font-semibold">
                    ⏳ Pending publication
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Floating Help ─────────────────────────────── */}
      <button
        onClick={() => setHelpOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center text-xl font-black transition-all hover:scale-110"
        title="Help"
      >?</button>

      {pdfOpen  && <PDFModal  title={`${paperId}-manuscript.pdf`} onClose={() => setPdfOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}
