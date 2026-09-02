import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import client from '../api/client';

// PDF.js worker — pinned to the cdnjs mirror because unpkg has been
// unreliable (intermittent 5xx + protocol-relative URL fell back to
// plain http:// on some pages, tripping mixed-content blocks). For
// pdfjs 4.x cdnjs names the file `.mjs` (module worker); the shape
// changed from 2.x/3.x. Version tracks pdfjs.version so a package
// bump doesn't ship a mismatched worker.
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

// ── Constants ───────────────────────────────────────────
const CRITERIA = [
  { key: 'score_originality', label: 'Originality & Novelty' },
  { key: 'score_technical', label: 'Technical Quality & Methodology' },
  { key: 'score_relevance', label: 'Relevance to Journal Scope' },
  { key: 'score_clarity', label: 'Clarity & Presentation' },
  { key: 'score_references', label: 'References & Citations' },
];

const RECOMMENDATIONS = [
  { value: 'accept', label: 'Accept', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300', ring: 'ring-green-500' },
  { value: 'minor_revision', label: 'Minor Revision', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-300', ring: 'ring-blue-500' },
  { value: 'major_revision', label: 'Major Revision', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300', ring: 'ring-yellow-500' },
  { value: 'reject', label: 'Reject', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300', ring: 'ring-red-500' },
];

const MIN_COMMENT_CHARS = 100;

// ── Score Slider ────────────────────────────────────────
function ScoreSlider({ label, value, onChange }) {
  const pct = ((value - 1) / 9) * 100;
  const hue = (value - 1) * (120 / 9); // 0=red → 120=green

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span
          className="text-sm font-bold tabular-nums w-7 text-center rounded"
          style={{ color: `hsl(${hue}, 70%, 40%)` }}
        >
          {value}
        </span>
      </div>
      <div className="relative">
        <div className="h-2 rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${pct}%`, background: `hsl(${hue}, 70%, 50%)` }}
          />
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>1 – Poor</span>
        <span>10 – Excellent</span>
      </div>
    </div>
  );
}

// ── PDF Viewer ──────────────────────────────────────────
function PdfViewer({ url }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState(false);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }) => {
    setNumPages(n);
    setPageNumber(1);
  }, []);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-xl">
        <p className="text-gray-400 text-sm">No manuscript PDF available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Anonymization notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-xs text-amber-700 font-medium">
          Author information has been anonymized for double-blind review.
        </p>
      </div>

      {/* PDF frame */}
      <div className="flex-1 overflow-auto bg-gray-100 rounded-xl border border-gray-200">
        {loadError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-500">Failed to load PDF. Please try refreshing.</p>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={() => setLoadError(true)}
            loading={
              <div className="flex items-center justify-center h-96">
                <Spinner />
              </div>
            }
            className="flex justify-center py-4"
          >
            <Page
              pageNumber={pageNumber}
              width={Math.min(window.innerWidth * 0.55, 680)}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </div>

      {/* Page navigation */}
      {numPages && (
        <div className="flex items-center justify-center gap-4 py-3">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-gray-600 font-medium tabular-nums">
            Page {pageNumber} of {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(p + 1, numPages))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reusable Spinner ────────────────────────────────────
function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg className={`animate-spin text-indigo-500 ${className}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function ReviewerPortal() {
  const { token } = useParams();

  // ── State ───────────────────────────────────────────
  const [status, setStatus] = useState('loading'); // loading | valid | expired | already_submitted | error
  const [reviewData, setReviewData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [scores, setScores] = useState({
    score_originality: 5,
    score_technical: 5,
    score_relevance: 5,
    score_clarity: 5,
    score_references: 5,
  });
  const [recommendation, setRecommendation] = useState('');
  const [commentsToAuthors, setCommentsToAuthors] = useState('');
  const [commentsToEditor, setCommentsToEditor] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Validation
  const [touched, setTouched] = useState({
    recommendation: false,
    commentsToAuthors: false,
  });

  // ── Fetch review access ───────────────────────────────
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No review token provided.');
      return;
    }

    let cancelled = false;

    client
      .get(`/reviews/access/${token}`)
      .then((res) => {
        if (cancelled) return;
        setReviewData(res.data);
        setStatus('valid');
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err?.response?.status;
        const detail = err?.response?.data?.detail || '';

        if (code === 409) {
          setStatus('already_submitted');
        } else if (code === 410) {
          setStatus('expired');
        } else if (code === 404) {
          setStatus('error');
          setErrorMsg('Review link not found. Please check the URL.');
        } else {
          setStatus('error');
          setErrorMsg(typeof detail === 'string' ? detail : 'Unable to load the review. Please try again later.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Computed ──────────────────────────────────────────
  const averageScore = useMemo(() => {
    const vals = Object.values(scores);
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }, [scores]);

  const commentChars = commentsToAuthors.length;
  const commentValid = commentChars >= MIN_COMMENT_CHARS;
  const formValid = recommendation !== '' && commentValid;

  // ── Handlers ──────────────────────────────────────────
  const updateScore = useCallback((key, val) => {
    setScores((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setTouched({ recommendation: true, commentsToAuthors: true });
    if (!formValid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await client.post(`/reviews/submit/${token}`, {
        ...scores,
        overall_recommendation: recommendation,
        comments_to_authors: commentsToAuthors,
        comments_to_editor: commentsToEditor || null,
      });
      setSubmitted(true);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string') {
        setSubmitError(detail);
      } else {
        setSubmitError('Failed to submit review. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════
  // RENDER: Loading
  // ═══════════════════════════════════════════════════════
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-10 w-10 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Verifying your review link…</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Expired
  // ═══════════════════════════════════════════════════════
  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Review Link Expired</h2>
          <p className="text-gray-500 text-sm mb-6">
            This review invitation has passed its deadline. If you believe this is an error,
            please contact the editorial office.
          </p>
          <a
            href="mailto:editorial@journal.org"
            className="inline-block px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            Contact Editorial Office
          </a>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Already Submitted
  // ═══════════════════════════════════════════════════════
  if (status === 'already_submitted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Review Already Submitted</h2>
          <p className="text-gray-500 text-sm">
            Your review for this paper has already been recorded. Thank you for your contribution
            to the peer-review process.
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Error
  // ═══════════════════════════════════════════════════════
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Review</h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Thank-you (after successful submit)
  // ═══════════════════════════════════════════════════════
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-500 mb-6">
            Your review has been submitted successfully. The editorial team will consider your
            feedback in the decision-making process.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 mb-6">
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paper</span>
              <p className="text-sm text-gray-700">{reviewData?.paper_title}</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your Average Score</span>
              <p className="text-sm font-mono text-indigo-700">{averageScore} / 10</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recommendation</span>
              <p className="text-sm text-gray-700 capitalize">{recommendation.replace('_', ' ')}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">You may now close this tab.</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Valid — two-column review layout
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Peer Review Portal</h1>
          <p className="text-xs text-gray-500">Double-blind review</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">{reviewData?.reviewer_name}</p>
          <p className="text-xs text-gray-400">Reviewer</p>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)]">
        {/* ── Left: PDF viewer (60%) ─────────────────── */}
        <div className="lg:w-[60%] p-4 flex flex-col min-h-0 overflow-hidden">
          <PdfViewer url={reviewData?.redacted_pdf_url} />
        </div>

        {/* ── Right: Review form (40%) ───────────────── */}
        <div className="lg:w-[40%] border-l border-gray-200 bg-white overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Paper info */}
            <div className="space-y-2">
              <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paper Title</span>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{reviewData?.paper_title}</p>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Score sliders */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Rating Criteria</h3>
              <div className="space-y-5">
                {CRITERIA.map(({ key, label }) => (
                  <ScoreSlider
                    key={key}
                    label={label}
                    value={scores[key]}
                    onChange={(val) => updateScore(key, val)}
                  />
                ))}
              </div>

              {/* Average score badge */}
              <div className="mt-5 flex items-center justify-between bg-indigo-50 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-indigo-800">Average Score</span>
                <span className="text-xl font-bold text-indigo-700 tabular-nums">{averageScore}</span>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Recommendation */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Overall Recommendation</h3>
              <div className="grid grid-cols-2 gap-2">
                {RECOMMENDATIONS.map((rec) => {
                  const selected = recommendation === rec.value;
                  return (
                    <label
                      key={rec.value}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition text-sm font-medium ${
                        selected
                          ? `${rec.bg} ${rec.border} ${rec.color} ring-2 ${rec.ring}`
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="recommendation"
                        value={rec.value}
                        checked={selected}
                        onChange={() => {
                          setRecommendation(rec.value);
                          setTouched((t) => ({ ...t, recommendation: true }));
                        }}
                        className="sr-only"
                      />
                      <span
                        className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                          selected ? `${rec.border} bg-current` : 'border-gray-300'
                        }`}
                      />
                      {rec.label}
                    </label>
                  );
                })}
              </div>
              {touched.recommendation && !recommendation && (
                <p className="mt-1.5 text-sm text-red-600">Please select a recommendation.</p>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Comments to Authors */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Comments to Authors <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={6}
                value={commentsToAuthors}
                onChange={(e) => setCommentsToAuthors(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, commentsToAuthors: true }))}
                placeholder="Provide detailed feedback on strengths, weaknesses, and suggestions for improvement…"
                className={`w-full px-3 py-2 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  touched.commentsToAuthors && !commentValid ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              <div className="flex justify-between mt-1">
                {touched.commentsToAuthors && !commentValid && (
                  <p className="text-sm text-red-600">Minimum {MIN_COMMENT_CHARS} characters required.</p>
                )}
                <p
                  className={`text-xs ml-auto tabular-nums ${
                    commentChars < MIN_COMMENT_CHARS ? 'text-amber-500' : 'text-green-600'
                  }`}
                >
                  {commentChars}/{MIN_COMMENT_CHARS} chars
                </p>
              </div>
            </div>

            {/* Confidential Comments to Editor */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Confidential Comments to Editor{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={commentsToEditor}
                onChange={(e) => setCommentsToEditor(e.target.value)}
                placeholder="These comments will only be visible to the editor, not the authors…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {submitError}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting || submitted}
              className="w-full px-6 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {submitting && <Spinner className="h-4 w-4 text-white" />}
              {submitting ? 'Submitting Review…' : 'Submit Review'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
