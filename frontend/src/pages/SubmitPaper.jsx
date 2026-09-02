import React, { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { getAuthorToken, getAuthorProfile } from '../api/authorAuth';
import FileDropzone from '../components/common/FileDropzone';

// Kinds the supplementary-files step exposes in the per-row dropdown.
// Restricted to non-manuscript kinds so authors don't accidentally
// submit two "manuscript" files during the initial-submission flow.
const SUPPLEMENTARY_KINDS = ['figure', 'supplementary', 'dataset'];

const JOURNAL_SCOPE_CATEGORIES = [
  'Artificial Intelligence — Machine Learning',
  'Artificial Intelligence — Natural Language Processing',
  'Generative AI — Large Language Models',
  'Generative AI — Diffusion Models and Image Generation',
  'Generative AI — Multimodal Systems',
  'Deep Learning — Convolutional Neural Networks',
  'Deep Learning — Transformers and Attention Mechanisms',
  'Deep Learning — Reinforcement Learning',
  'Deep Learning — Federated Learning',
  'AI for Healthcare and Bioinformatics',
  'AI for Robotics and Autonomous Systems',
  'AI Ethics, Fairness and Explainability',
  'Computer Vision and Image Processing',
  'Quantum Computing and AI',
  'Edge AI and IoT Intelligence',
  'Multidisciplinary AI Research',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_KEYWORDS = 6;
const STEPS = ['Upload', 'Paper Details', 'Authors', 'Declarations'];

const EMPTY_AUTHOR = { name: '', email: '', affiliation: '', orcid: '', is_corresponding: false };

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ordinalLabel(n) {
  if (n === 1) return '1st Author';
  if (n === 2) return '2nd Author';
  if (n === 3) return '3rd Author';
  return `${n}th Author`;
}

// ── Progress Bar ──────────────────────────────────────────
function ProgressBar({ current }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div className={`flex-1 h-0.5 transition-colors duration-500 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                done ? 'bg-green-500 text-white shadow-md shadow-green-200' :
                active ? 'bg-green-700 text-white ring-4 ring-green-100 shadow-md shadow-green-200' :
                'bg-gray-100 text-gray-400'
              }`}>
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step}
              </div>
              <span className={`text-xs font-medium hidden sm:block whitespace-nowrap ${
                active ? 'text-green-700' : done ? 'text-green-500' : 'text-gray-400'
              }`}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────
function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 ml-2">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
      Auto-filled
    </span>
  );
}

function RoleBadge({ label, color = 'green' }) {
  const colors = {
    green: 'bg-green-100 text-green-800 border-green-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-0.5 border ${colors[color]}`}>
      {label}
    </span>
  );
}

// ── Tag Input ─────────────────────────────────────────────
function TagInput({ value = [], onChange, error }) {
  const [input, setInput] = useState('');
  const add = () => {
    const tag = input.trim().replace(/,$/, '');
    if (!tag || value.length >= MAX_KEYWORDS) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) { setInput(''); return; }
    onChange([...value, tag]);
    setInput('');
  };
  return (
    <div>
      <div className={`min-h-[3rem] flex flex-wrap gap-2 p-3 rounded-xl border bg-white transition-all ${
        error ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100'
      }`}>
        {value.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-green-50 text-green-800 text-sm font-medium rounded-lg px-2.5 py-1 border border-green-200">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-green-500 hover:text-red-500 transition-colors leading-none">×</button>
          </span>
        ))}
        {value.length < MAX_KEYWORDS && (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
            onBlur={add}
            placeholder={value.length === 0 ? 'Type a keyword and press Enter…' : 'Add more…'}
            className="flex-1 min-w-[140px] outline-none text-sm bg-transparent text-gray-800 placeholder-gray-400"
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <p className="text-xs text-gray-400">{value.length}/{MAX_KEYWORDS} keywords · Enter or comma to add</p>
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────
function Field({ label, badge, error, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{badge && <AutoBadge />}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `w-full rounded-xl border px-4 py-3 text-sm text-gray-800 outline-none transition-all bg-white ${
    err ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200 focus:border-green-400 focus:ring-2 focus:ring-green-100'
  }`;

const miniInputCls = (err) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-gray-800 outline-none transition-all bg-white ${
    err ? 'border-red-400' : 'border-gray-200 focus:border-green-400'
  }`;

// ── Author Card ───────────────────────────────────────────
function AuthorCard({ index, register, errors, watch, setValue, remove, autoExtracted, isOnly, totalAuthors }) {
  const isCorresponding = watch(`authors.${index}.is_corresponding`);
  const nameVal = watch(`authors.${index}.name`);

  const setAsCorresponding = () => {
    // Unmark all, then mark this one
    for (let i = 0; i < totalAuthors; i++) {
      setValue(`authors.${i}.is_corresponding`, i === index);
    }
  };

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      isCorresponding ? 'border-green-400 shadow-sm shadow-green-100' : 'border-gray-200'
    }`}>
      {/* Card header */}
      <div className={`flex items-center justify-between px-4 py-3 ${isCorresponding ? 'bg-green-50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            isCorresponding ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            {index + 1}
          </div>
          <span className="text-sm font-semibold text-gray-800">{nameVal || `Author ${index + 1}`}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {index === 0 && <RoleBadge label="1st Author" color="blue" />}
            {index === 1 && <RoleBadge label="2nd Author" color="gray" />}
            {index > 1 && <RoleBadge label={ordinalLabel(index + 1)} color="gray" />}
            {isCorresponding && <RoleBadge label="✉ Corresponding" color="green" />}
            {autoExtracted && <RoleBadge label="AI Extracted" color="amber" />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCorresponding && (
            <button
              type="button"
              onClick={setAsCorresponding}
              title="Set as corresponding author"
              className="text-xs text-green-700 font-semibold hover:text-green-900 border border-green-200 bg-white rounded-lg px-2 py-1 transition-colors"
            >
              Set Corresponding
            </button>
          )}
          {!isOnly && (
            <button type="button" onClick={() => remove(index)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            {...register(`authors.${index}.name`, { required: 'Name is required' })}
            placeholder="Dr. Jane Smith"
            className={miniInputCls(errors.authors?.[index]?.name)}
          />
          {errors.authors?.[index]?.name && (
            <p className="text-xs text-red-600 mt-0.5">{errors.authors[index].name.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Email {isCorresponding && <span className="text-red-400">*</span>}
          </label>
          <input
            type="email"
            {...register(`authors.${index}.email`, {
              validate: (v) => {
                if (isCorresponding && !v) return 'Email required for corresponding author';
                if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Invalid email';
                return true;
              }
            })}
            placeholder="jane@university.edu"
            className={miniInputCls(errors.authors?.[index]?.email)}
          />
          {errors.authors?.[index]?.email && (
            <p className="text-xs text-red-600 mt-0.5">{errors.authors[index].email.message}</p>
          )}
        </div>

        {/* Affiliation */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Institution / Affiliation</label>
          <input
            {...register(`authors.${index}.affiliation`)}
            placeholder="Department of Computer Science, University of Technology"
            className={miniInputCls(false)}
          />
        </div>

        {/* ORCID */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            ORCID iD
            <span className="text-gray-400 font-normal ml-1">optional</span>
          </label>
          <input
            {...register(`authors.${index}.orcid`, {
              validate: (v) => !v || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v) || 'Format: 0000-0000-0000-0000',
            })}
            placeholder="0000-0000-0000-0000"
            className={miniInputCls(errors.authors?.[index]?.orcid)}
          />
          {errors.authors?.[index]?.orcid && (
            <p className="text-xs text-red-600 mt-0.5">{errors.authors[index].orcid.message}</p>
          )}
        </div>

        {/* Corresponding toggle */}
        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register(`authors.${index}.is_corresponding`)}
              onChange={() => setAsCorresponding()}
              checked={isCorresponding}
              className="w-4 h-4 accent-green-600"
            />
            <span className="text-xs font-semibold text-gray-700">Corresponding Author</span>
          </label>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function SubmitPaper() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [success, setSuccess] = useState(null);

  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [autoFilled, setAutoFilled] = useState({ title: false, abstract: false, keywords: false, authors: false });
  const [extractedAuthorCount, setExtractedAuthorCount] = useState(0);

  // Supplementary uploads (figures, datasets, extra files) — optional.
  // The manuscript PDF is still the required deliverable and goes through
  // /submissions/submit; these ride along as a JSON blob until the backend
  // grows a first-class field for them.
  const [supplementaryFiles, setSupplementaryFiles] = useState([]);

  // Auth
  const [authorProfile, setAuthorProfile] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    getAuthorProfile()
      .then((p) => { if (p) setAuthorProfile(p); })
      .catch(() => {})
      .finally(() => setAuthChecking(false));
  }, []);

  const {
    register, handleSubmit, control, trigger, watch, setValue,
    formState: { errors }, setError,
  } = useForm({
    mode: 'onTouched',
    defaultValues: {
      title: '', abstract: '', keywords: [], category: '',
      authors: [{ ...EMPTY_AUTHOR, is_corresponding: true }],
      cover_letter: '',
      original_work: false, open_access_terms: false,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'authors' });
  const abstractValue = watch('abstract');
  const abstractWords = countWords(abstractValue);
  const titleValue = watch('title');
  const authorsValue = watch('authors');

  // Pre-fill first author from profile if no extraction
  useEffect(() => {
    if (authorProfile && !autoFilled.authors) {
      setValue('authors.0.name', authorProfile.full_name || '');
      setValue('authors.0.email', authorProfile.email || '');
      setValue('authors.0.affiliation', authorProfile.institution || '');
      setValue('authors.0.orcid', authorProfile.orcid || '');
      setValue('authors.0.is_corresponding', true);
    }
  }, [authorProfile, autoFilled.authors, setValue]);

  // ── PDF Drop & AI Auto-Extract ────────────────────────
  const onDrop = useCallback(async (accepted, rejected) => {
    if (rejected.length > 0) {
      const code = rejected[0].errors[0]?.code;
      setPdfError(
        code === 'file-too-large' ? 'File exceeds 10 MB.' :
        code === 'file-invalid-type' ? 'Only PDF files are accepted.' : 'Invalid file.'
      );
      return;
    }
    if (!accepted.length) return;
    const file = accepted[0];
    setPdfFile(file);
    setPdfError(null);
    setExtractError(null);
    setExtracting(true);

    try {
      const fd = new FormData();
      fd.append('pdf_file', file);
      const { data } = await client.post('/submissions/parse-metadata', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      const filled = { title: false, abstract: false, keywords: false, authors: false };

      if (data.title) { setValue('title', data.title, { shouldValidate: false }); filled.title = true; }
      if (data.abstract) { setValue('abstract', data.abstract, { shouldValidate: false }); filled.abstract = true; }
      if (data.keywords?.length) { setValue('keywords', data.keywords, { shouldValidate: false }); filled.keywords = true; }

      if (data.authors?.length) {
        // Ensure exactly one corresponding author
        let hasCorr = data.authors.some((a) => a.is_corresponding);
        const mappedAuthors = data.authors.map((a, i) => ({
          name: a.name || '',
          email: a.email || '',
          affiliation: a.affiliation || '',
          orcid: a.orcid || '',
          is_corresponding: hasCorr ? !!a.is_corresponding : i === 0,
        }));
        replace(mappedAuthors);
        filled.authors = true;
        setExtractedAuthorCount(mappedAuthors.length);
      }

      setAutoFilled(filled);
    } catch {
      setExtractError('Could not extract metadata — please fill in the details manually.');
    } finally {
      setExtracting(false);
    }
  }, [setValue, replace]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  // ── Navigation ────────────────────────────────────────
  const goNext = async () => {
    if (step === 1) {
      if (!pdfFile) { setPdfError('Please upload your manuscript PDF first.'); return; }
      setStep(2); return;
    }
    const fieldsMap = {
      2: ['title', 'abstract', 'keywords', 'category'],
      3: ['authors'],
    };
    const ok = fieldsMap[step] ? await trigger(fieldsMap[step]) : true;
    if (ok) setStep((s) => Math.min(s + 1, 4));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  // ── Submit ────────────────────────────────────────────
  const onSubmit = async (data) => {
    if (!pdfFile) { setPdfError('Please upload your manuscript PDF.'); setStep(1); return; }
    if (!data.original_work) { setError('original_work', { message: 'You must confirm originality.' }); return; }
    if (!data.open_access_terms) { setError('open_access_terms', { message: 'You must agree to the open-access terms.' }); return; }

    // Find corresponding author for backend fields
    const corrAuthor = data.authors.find((a) => a.is_corresponding) || data.authors[0] || {};

    setSubmitting(true);
    setServerError(null);
    try {
      const fd = new FormData();
      fd.append('paper_title', data.title);
      fd.append('abstract', data.abstract);
      fd.append('keywords', data.keywords.join(', '));
      fd.append('research_category', data.category);
      fd.append('author_name', corrAuthor.name || data.authors[0]?.name || '');
      fd.append('author_email', corrAuthor.email || data.authors[0]?.email || '');
      // Backend still requires ai_usage_disclosure as a Form field even
      // though the author-facing checkbox is gone; send false unconditionally.
      fd.append('ai_usage_disclosure', 'false');
      // Send full author list as JSON
      fd.append('authors_json', JSON.stringify(data.authors));
      fd.append('pdf_file', pdfFile);

      // Supplementary files ride along as a JSON blob. The current
      // /submissions/submit endpoint ignores unknown form fields, so this
      // is a no-op backend-side until the field is added. Logged in the
      // meantime so QA can confirm the collected list looks right.
      if (supplementaryFiles.length > 0) {
        fd.append('supplementary_files', JSON.stringify(supplementaryFiles));
        // eslint-disable-next-line no-console
        console.info('[SubmitPaper] supplementary files ready:', supplementaryFiles);
      }

      const token = getAuthorToken();
      const res = await client.post('/submissions/submit', fd, {
        headers: { 'Content-Type': 'multipart/form-data', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        timeout: 60000,
      });
      setSuccess(res.data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        detail.forEach((d) => { const f = d.loc?.[d.loc.length - 1]; if (f) setError(f, { message: d.msg }); });
      } else if (typeof detail === 'string') {
        setServerError(detail);
      } else if (!err?.response) {
        // No response at all → network error, backend down, or the frontend
        // 60s timeout fired. Surface something the author can act on.
        const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
        setServerError(
          isTimeout
            ? 'The submission timed out. Your paper may still have been received — please check "My Submissions" before retrying.'
            : `Could not reach the server (${err?.message || 'network error'}). Check your connection and try again.`,
        );
      } else {
        setServerError(`Submission failed (HTTP ${err.response.status}). Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#f0f7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-100 border-t-green-600 rounded-full animate-spin" />
          <p className="text-sm text-green-700 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  // ── Success Screen ────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#f0f7f0] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-green-800 to-emerald-700 px-8 py-10 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 ring-4 ring-white/20">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Manuscript Submitted!</h2>
            <p className="text-green-200 text-sm mt-1">Your work is now in our editorial pipeline.</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="bg-green-50 rounded-2xl border border-green-100 p-5 space-y-3">
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Submission ID</p>
                <p className="font-mono text-sm font-bold text-green-900">{success.submission_id}</p>
              </div>
              <div className="border-t border-green-100 pt-3">
                <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Estimated Timeline</p>
                <p className="text-sm text-gray-700">{success.estimated_timeline || 'Initial screening: 3–5 business days · Full review: 4–8 weeks'}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">A confirmation email has been sent. Save your submission ID for reference.</p>
            <button onClick={() => navigate('/author-dashboard')} className="w-full py-3 rounded-2xl bg-green-700 hover:bg-green-800 text-white font-semibold text-sm transition-colors">
              Track Your Submission
            </button>
            <button onClick={() => navigate('/')} className="w-full py-2 rounded-2xl text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Extraction summary text ───────────────────────────
  const extractedFields = [
    autoFilled.title && 'title',
    autoFilled.abstract && 'abstract',
    autoFilled.keywords && 'keywords',
    autoFilled.authors && `${extractedAuthorCount} author${extractedAuthorCount !== 1 ? 's' : ''}`,
  ].filter(Boolean);

  // ── Main Form ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f7f0]">

      {/* Header */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-emerald-800">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-base">Submit Your Manuscript</p>
              <p className="text-green-300 text-xs">Open Access · AI-Assisted IDP Pipeline · Peer Reviewed</p>
            </div>
          </div>
          {authorProfile && (
            <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <div className="w-6 h-6 rounded-full bg-green-400 flex items-center justify-center text-xs font-bold text-green-900">
                {authorProfile.full_name?.[0]?.toUpperCase() || 'A'}
              </div>
              <span className="text-white text-xs font-medium">{authorProfile.full_name || 'Author'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Form Card */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-3xl shadow-sm border border-green-100 overflow-hidden">

          {/* Progress */}
          <div className="px-8 pt-8 pb-4 border-b border-gray-100">
            <ProgressBar current={step} />
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-8 py-7">

              {/* ────────────── STEP 1: UPLOAD ────────────── */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Upload Your Manuscript</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Drop your PDF — our AI IDP engine automatically extracts the title, abstract, keywords, and all authors.
                    </p>
                  </div>

                  {/* JG-103 — surface the two headline commitments up-front
                      so authors don't hit an APC surprise later. Prose lives
                      in the /open-access and /copyright policy pages; this
                      is the reader-facing summary linked to them. */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    <p className="font-semibold">Free to publish · Authors retain copyright</p>
                    <p className="mt-1 text-blue-800">
                      There are no article processing charges. Accepted articles are published under{' '}
                      <a href="/copyright" className="underline font-medium hover:no-underline">CC BY 4.0</a>{' '}
                      — you keep the copyright. See our{' '}
                      <a href="/open-access" className="underline hover:no-underline">Open Access statement</a>{' '}
                      and{' '}
                      <a href="/publication-ethics" className="underline hover:no-underline">Publication Ethics</a>.
                    </p>
                  </div>

                  {/* Dropzone */}
                  <div
                    {...getRootProps()}
                    className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 ${
                      isDragActive ? 'border-green-500 bg-green-50 scale-[1.01]' :
                      pdfFile ? 'border-green-400 bg-green-50/50' :
                      'border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50/40'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <div className="p-10 flex flex-col items-center text-center gap-4">
                      {pdfFile ? (
                        <>
                          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-base">{pdfFile.name}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{formatBytes(pdfFile.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPdfFile(null);
                              setAutoFilled({ title: false, abstract: false, keywords: false, authors: false });
                              setExtractedAuthorCount(0);
                              setValue('title', '');
                              setValue('abstract', '');
                              setValue('keywords', []);
                              replace([{
                                name: authorProfile?.full_name || '',
                                email: authorProfile?.email || '',
                                affiliation: authorProfile?.institution || '',
                                orcid: authorProfile?.orcid || '',
                                is_corresponding: true,
                              }]);
                            }}
                            className="text-sm text-red-500 hover:text-red-700 font-semibold transition-colors"
                          >
                            Remove & re-upload
                          </button>
                        </>
                      ) : (
                        <>
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDragActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                            <svg className={`w-8 h-8 transition-colors ${isDragActive ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-700 text-base">
                              {isDragActive ? 'Release to upload…' : 'Drag & drop your PDF here'}
                            </p>
                            <p className="text-sm text-gray-400 mt-1">or <span className="text-green-700 font-semibold">click to browse</span> · PDF only · Max 10 MB</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {pdfError && <p className="text-sm text-red-600 -mt-2">{pdfError}</p>}

                  {/* Extraction progress */}
                  {extracting && (
                    <div className="flex items-start gap-3 p-4 bg-green-50 rounded-2xl border border-green-200">
                      <div className="w-5 h-5 border-2 border-green-200 border-t-green-600 rounded-full animate-spin shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">AI IDP Engine processing your manuscript…</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {['Title', 'Abstract', 'Keywords', 'Authors'].map((label, i) => (
                            <span key={label} className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-700 rounded-full px-2.5 py-0.5 font-medium">
                              <span className="w-3 h-3 border border-green-300 border-t-green-600 rounded-full animate-spin" style={{ animationDelay: `${i * 150}ms` }} />
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Extraction success */}
                  {!extracting && pdfFile && extractedFields.length > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-green-50 rounded-2xl border border-green-200">
                      <div className="w-8 h-8 bg-green-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-800">IDP Extraction complete</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Auto-filled: <strong>{extractedFields.join(', ')}</strong>.
                          {' '}Review and edit on the next steps.
                        </p>
                        {autoFilled.authors && (
                          <p className="text-xs text-green-600 mt-1">
                            Detected author roles: 1st Author, Corresponding Author, and {extractedAuthorCount - 1} co-author{extractedAuthorCount - 1 !== 1 ? 's' : ''}.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {extractError && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                      <span className="text-amber-500 text-base shrink-0">⚠</span>
                      <p className="text-sm text-amber-800">{extractError}</p>
                    </div>
                  )}

                  {/* IDP feature hints */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: '📄', text: 'Title' },
                      { icon: '📝', text: 'Abstract' },
                      { icon: '🏷️', text: 'Keywords' },
                      { icon: '👥', text: 'Authors' },
                    ].map((item) => (
                      <div key={item.text} className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="text-lg">{item.icon}</span>
                        <p className="text-xs text-gray-500 text-center font-medium">AI extracts {item.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Supplementary files — optional. Authors can skip this
                      section entirely; the section is presentational and
                      never blocks step 1 → step 2 navigation. */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Supplementary files <span className="text-xs font-medium text-gray-400">(optional)</span></h3>
                        <p className="text-xs text-gray-500 mt-0.5">Figures, datasets, or extra materials that go with your manuscript.</p>
                      </div>
                      {supplementaryFiles.length > 0 && (
                        <span className="text-[11px] font-semibold text-green-700">
                          {supplementaryFiles.length} attached
                        </span>
                      )}
                    </div>
                    <FileDropzone
                      kinds={SUPPLEMENTARY_KINDS}
                      onUploaded={setSupplementaryFiles}
                      maxSizeMB={25}
                    />
                  </div>
                </div>
              )}

              {/* ────────────── STEP 2: PAPER DETAILS ────────────── */}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Paper Details</h2>
                    <p className="text-sm text-gray-500 mt-1">Review and complete the information below. Fields marked <strong>Auto-filled</strong> were extracted by the IDP engine.</p>
                  </div>

                  <Field label="Paper Title" badge={autoFilled.title} error={errors.title?.message}>
                    <input
                      {...register('title', { required: 'Title is required.', maxLength: { value: 200, message: 'Max 200 characters.' } })}
                      className={inputCls(errors.title)}
                      placeholder="Enter the full title of your paper"
                    />
                  </Field>

                  <Field label="Abstract" badge={autoFilled.abstract} error={errors.abstract?.message}
                    hint="Summarize your research in 150–300 words.">
                    <textarea
                      {...register('abstract', {
                        required: 'Abstract is required.',
                        validate: {
                          min: (v) => countWords(v) >= 150 || 'Minimum 150 words.',
                          max: (v) => countWords(v) <= 300 || 'Maximum 300 words.',
                        },
                      })}
                      rows={6}
                      className={inputCls(errors.abstract) + ' resize-none'}
                      placeholder="Provide a concise summary of your research findings and methodology…"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span />
                      <span className={`text-xs font-semibold ${
                        abstractWords === 0 ? 'text-gray-400' :
                        abstractWords < 150 || abstractWords > 300 ? 'text-red-500' : 'text-green-600'
                      }`}>
                        {abstractWords} / 300 words
                      </span>
                    </div>
                  </Field>

                  <Field label="Keywords" badge={autoFilled.keywords} error={errors.keywords?.message}
                    hint="Add 2–6 keywords that best describe your paper.">
                    <Controller
                      name="keywords"
                      control={control}
                      rules={{ validate: (v) => (v && v.length >= 2) || 'Add at least 2 keywords.' }}
                      render={({ field }) => (
                        <TagInput value={field.value} onChange={field.onChange} error={errors.keywords?.message} />
                      )}
                    />
                  </Field>

                  <Field label="Research Category" error={errors.category?.message}>
                    <select
                      {...register('category', { required: 'Please select a research category.' })}
                      className={inputCls(errors.category) + ' cursor-pointer'}
                    >
                      <option value="">— Select the category that best fits your paper —</option>
                      {JOURNAL_SCOPE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {/* ────────────── STEP 3: AUTHORS ────────────── */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Author Information</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {autoFilled.authors
                        ? `IDP detected ${extractedAuthorCount} author${extractedAuthorCount !== 1 ? 's' : ''} from your PDF. Review roles and details below.`
                        : 'Add all authors in order. Mark the corresponding author who will handle communications.'}
                    </p>
                  </div>

                  {/* AI extraction notice */}
                  {autoFilled.authors && (
                    <div className="flex items-start gap-3 p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-amber-800">
                        <strong>IDP auto-extracted authors</strong> — please verify all names, emails, affiliations, and roles before continuing. The AI may occasionally miss or misread names.
                      </p>
                    </div>
                  )}

                  {/* Author cards */}
                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <AuthorCard
                        key={field.id}
                        index={idx}
                        register={register}
                        errors={errors}
                        watch={watch}
                        setValue={setValue}
                        remove={remove}
                        autoExtracted={autoFilled.authors && idx < extractedAuthorCount}
                        isOnly={fields.length === 1}
                        totalAuthors={fields.length}
                      />
                    ))}
                  </div>

                  {/* Add author button */}
                  <button
                    type="button"
                    onClick={() => append({ ...EMPTY_AUTHOR, is_corresponding: false })}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-green-200 text-green-700 hover:border-green-400 hover:bg-green-50 text-sm font-semibold transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Author
                  </button>

                  {/* Author count */}
                  <p className="text-xs text-gray-400 text-center">
                    {fields.length} author{fields.length !== 1 ? 's' : ''} · One must be marked as Corresponding Author
                  </p>

                  {/* Cover Letter */}
                  <Field label="Cover Letter" hint="Optional message to the editorial team.">
                    <textarea
                      {...register('cover_letter')}
                      rows={4}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 resize-none bg-white transition-all"
                      placeholder="Briefly describe the significance of your work and why it is a good fit for this journal…"
                    />
                  </Field>
                </div>
              )}

              {/* ────────────── STEP 4: DECLARATIONS ────────────── */}
              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Declarations</h2>
                    <p className="text-sm text-gray-500 mt-1">Please confirm all declarations before submitting.</p>
                  </div>

                  {serverError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                      <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <p className="text-sm text-red-700">{serverError}</p>
                    </div>
                  )}

                  {/* Originality */}
                  <label className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-colors hover:bg-gray-50 ${errors.original_work ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <input type="checkbox" {...register('original_work')} className="mt-0.5 w-4 h-4 accent-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Originality Confirmation <span className="text-red-500">*</span></p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">This manuscript is original work. It has not been previously published and is not currently under review at any other venue.</p>
                      {errors.original_work && <p className="text-xs text-red-600 mt-1">{errors.original_work.message}</p>}
                    </div>
                  </label>

                  {/* Open Access */}
                  <label className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-colors hover:bg-gray-50 ${errors.open_access_terms ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <input type="checkbox" {...register('open_access_terms')} className="mt-0.5 w-4 h-4 accent-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Open Access Agreement <span className="text-red-500">*</span></p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">I agree to publish under the CC BY 4.0 license, making this work freely available and allowing reuse with attribution.</p>
                      {errors.open_access_terms && <p className="text-xs text-red-600 mt-1">{errors.open_access_terms.message}</p>}
                    </div>
                  </label>

                  {/* Summary */}
                  <div className="bg-green-50 rounded-2xl border border-green-100 p-5">
                    <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3">Submission Summary</p>
                    <dl className="space-y-2 text-sm">
                      {[
                        { label: 'File', value: pdfFile?.name },
                        { label: 'Title', value: titleValue || '—' },
                        { label: 'Category', value: watch('category') || '—' },
                        { label: 'Keywords', value: watch('keywords')?.join(', ') || '—' },
                      ].map((row) => (
                        <div key={row.label} className="flex gap-3">
                          <dt className="text-gray-500 shrink-0 w-16">{row.label}</dt>
                          <dd className="text-gray-800 font-medium truncate">{row.value}</dd>
                        </div>
                      ))}
                      {/* Authors summary */}
                      <div className="flex gap-3">
                        <dt className="text-gray-500 shrink-0 w-16">Authors</dt>
                        <dd className="text-gray-800 font-medium">
                          <div className="space-y-0.5">
                            {authorsValue?.map((a, i) => (
                              <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                <span>{a.name || `Author ${i + 1}`}</span>
                                {i === 0 && <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0 border border-blue-200">1st</span>}
                                {a.is_corresponding && <span className="text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0 border border-green-200">✉ Corresponding</span>}
                              </div>
                            ))}
                          </div>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

            </div>

            {/* Footer Navigation */}
            <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200 disabled:opacity-0 disabled:pointer-events-none transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-1.5 px-7 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-2xl text-sm transition-colors shadow-sm shadow-green-200"
                >
                  Continue
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-8 py-2.5 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-2xl text-sm transition-colors disabled:opacity-60 shadow-sm shadow-green-200"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      Submit Manuscript
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
