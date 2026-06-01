import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getFormatReport, submitConsultPartyDecision, getAgentStatus } from '../api/editor';

/* ── Status icons ────────────────────────────────────────── */
const CheckIcon = ({ status }) => {
  const map = {
    pass: { icon: '✅', color: 'text-green-600', bg: 'bg-green-50' },
    warning: { icon: '⚠️', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    fail: { icon: '❌', color: 'text-red-600', bg: 'bg-red-50' },
  };
  const s = map[status] || map.fail;
  return <span className={`${s.color} text-lg`}>{s.icon}</span>;
};

const OverallBadge = ({ overall }) => {
  const map = {
    pass: { label: 'PASSED', bg: 'bg-green-100 text-green-800 border-green-300' },
    warning: { label: 'WARNINGS', bg: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    fail: { label: 'FAILED', bg: 'bg-red-100 text-red-800 border-red-300' },
  };
  const s = map[overall] || map.fail;
  return (
    <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold border ${s.bg}`}>
      {s.label}
    </span>
  );
};

/* ── Reviewer Suggestion Form ────────────────────────────── */
const emptyReviewer = { name: '', email: '', orcid: '', affiliation: '', expertise: '' };

function ReviewerForm({ reviewers, setReviewers }) {
  const addReviewer = () => {
    if (reviewers.length < 4) setReviewers([...reviewers, { ...emptyReviewer }]);
  };
  const removeReviewer = (idx) => setReviewers(reviewers.filter((_, i) => i !== idx));
  const update = (idx, field, value) => {
    const updated = [...reviewers];
    updated[idx] = { ...updated[idx], [field]: value };
    setReviewers(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Suggest Reviewers (at least 2, max 4)</h3>
        {reviewers.length < 4 && (
          <button onClick={addReviewer} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            + Add Reviewer
          </button>
        )}
      </div>
      {reviewers.map((r, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500">Reviewer {idx + 1}</span>
            {reviewers.length > 0 && (
              <button onClick={() => removeReviewer(idx)} className="text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text" placeholder="Full Name *" value={r.name}
              onChange={(e) => update(idx, 'name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="email" placeholder="Email *" value={r.email}
              onChange={(e) => update(idx, 'email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text" placeholder="ORCID (optional)" value={r.orcid}
              onChange={(e) => update(idx, 'orcid', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text" placeholder="Affiliation" value={r.affiliation}
              onChange={(e) => update(idx, 'affiliation', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <input
            type="text" placeholder="Areas of Expertise" value={r.expertise}
            onChange={(e) => update(idx, 'expertise', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export default function ConsultPartyDashboard() {
  const { submissionId } = useParams();
  const [searchParams] = useSearchParams();
  const preAction = searchParams.get('action');

  const [report, setReport] = useState(null);
  const [agentStatus, setAgentStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState(preAction || '');
  const [comments, setComments] = useState('');
  const [reviewers, setReviewers] = useState([{ ...emptyReviewer }, { ...emptyReviewer }]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportData, statusData] = await Promise.all([
        getFormatReport(submissionId),
        getAgentStatus(submissionId),
      ]);
      setReport(reportData);
      setAgentStatus(statusData);
      if (statusData.consult_party_decision) {
        setSubmitted(true);
        setDecision(statusData.consult_party_decision);
      }
    } catch (e) {
      setError('Failed to load submission data');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async () => {
    if (!decision) { setError('Please select a decision'); return; }
    if (decision === 'approve') {
      const validReviewers = reviewers.filter(r => r.name && r.email);
      if (validReviewers.length < 2) {
        setError('Please provide at least 2 reviewers with name and email');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const validReviewers = reviewers.filter(r => r.name && r.email);
      await submitConsultPartyDecision(submissionId, {
        decision,
        comments,
        suggested_reviewers: decision === 'approve' ? validReviewers : [],
      });
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg text-center">
          <div className="text-5xl mb-4">{decision === 'approve' ? '✅' : '↩️'}</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {decision === 'approve' ? 'Paper Approved for Review' : 'Paper Returned to Author'}
          </h2>
          <p className="text-gray-600">
            {decision === 'approve'
              ? 'The reviewer suggestion agent is now finding suitable reviewers. The editor will finalize the assignment.'
              : 'The author has been notified to revise and resubmit their manuscript.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Format Check Review</h1>
              <p className="text-sm text-gray-500">
                Paper ID: <span className="font-mono font-semibold text-blue-700">{report?.paper_id_code || 'N/A'}</span>
              </p>
            </div>
            {report?.overall && <OverallBadge overall={report.overall} />}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Format Check Report */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900">Format Check Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              {report?.passed || 0} passed · {report?.warnings || 0} warnings · {report?.failures || 0} failures
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {(report?.checks || []).map((check, idx) => (
              <div key={idx} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                <CheckIcon status={check.status} />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{check.name}</span>
                  <p className="text-sm text-gray-500">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Decision Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-bold text-gray-900">Your Decision</h2>

          <div className="flex gap-4">
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-4 text-center transition-all ${
                decision === 'approve'
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <input
                type="radio" name="decision" value="approve"
                checked={decision === 'approve'} onChange={() => setDecision('approve')}
                className="sr-only"
              />
              <div className="text-2xl mb-1">✅</div>
              <div className="font-semibold">Approve for Peer Review</div>
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-4 text-center transition-all ${
                decision === 'reject'
                  ? 'border-red-500 bg-red-50 text-red-800'
                  : 'border-gray-200 hover:border-red-300'
              }`}
            >
              <input
                type="radio" name="decision" value="reject"
                checked={decision === 'reject'} onChange={() => setDecision('reject')}
                className="sr-only"
              />
              <div className="text-2xl mb-1">↩️</div>
              <div className="font-semibold">Return to Author</div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
            <textarea
              value={comments} onChange={(e) => setComments(e.target.value)}
              rows={3} placeholder="Any notes for the editorial team..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* Reviewer Suggestion (only if approve) */}
        {decision === 'approve' && (
          <section id="reviewers" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <ReviewerForm reviewers={reviewers} setReviewers={setReviewers} />
          </section>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || !decision}
            className={`px-8 py-3 rounded-lg font-semibold text-white transition-all ${
              submitting || !decision
                ? 'bg-gray-400 cursor-not-allowed'
                : decision === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {submitting ? 'Submitting...' : decision === 'approve' ? 'Submit & Proceed to Review' : 'Return to Author'}
          </button>
        </div>
      </main>
    </div>
  );
}
