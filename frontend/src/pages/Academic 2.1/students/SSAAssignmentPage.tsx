import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import MyMarksLayout from './MyMarksLayout';

type SSADetail = {
  assignment_available: boolean;
  exam_id: string;
  assignment_type: string;
  course_code: string;
  course_name: string;
  faculty_name: string;
  rubric_file_url: string | null;
  first_page_file_url: string | null;
  student_topic_file_url: string | null;
  submission_status: string;
  marks: number | null;
  feedback: string;
  submission_id: number | null;
  submitted_at: string | null;
  generated_file_url: string | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  NOT_SUBMITTED: { label: 'Not submitted', tone: 'bg-gray-100 text-gray-600 border-gray-200' },
  SUBMITTED: { label: 'Submitted', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  UNDER_EVALUATION: { label: 'Under evaluation', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  EVALUATED: { label: 'Evaluated', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function SSAAssignmentPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SSADetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const load = async () => {
    if (!examId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithAuth(
        `/api/academic-v2/ssa/student/assignment/${encodeURIComponent(examId)}/`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail || `Failed to load the assignment (HTTP ${response.status})`);
      }
      setDetail(await response.json());
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load the SSA assignment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setUploadError('');
    setUploadSuccess('');
    if (!file) {
      setUploadError('Choose a PDF file to submit.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetchWithAuth(
        `/api/academic-v2/ssa/student/assignment/${encodeURIComponent(examId || '')}/submit/`,
        { method: 'POST', body: form },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || `Upload failed (HTTP ${response.status})`);
      }
      setUploadSuccess(payload?.detail || 'Submitted successfully.');
      setFile(null);
      await load();
    } catch (submitError: any) {
      setUploadError(submitError?.message || 'Unable to submit the assignment.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading SSA assignment…</span>
      </div>
    );
  }

  const status = STATUS_LABEL[detail?.submission_status || 'NOT_SUBMITTED'] || STATUS_LABEL.NOT_SUBMITTED;
  const canSubmit =
    Boolean(detail) &&
    detail!.assignment_available &&
    !['UNDER_EVALUATION', 'EVALUATED'].includes(detail!.submission_status);

  return (
    <MyMarksLayout activeTab="courses" title="SSA Assignment" showBack>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/academic-v2/student/courses')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold" onClick={load}>Retry</button>
          </div>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
                    {detail.assignment_type} · {detail.course_code}
                  </p>
                  <h1 className="mt-1 text-xl font-bold text-gray-900">{detail.course_name}</h1>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    <UserRound className="h-3.5 w-3.5" /> {detail.faculty_name || 'Faculty'}
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${status.tone}`}>
                  {status.label}
                </span>
              </div>

              {detail.submitted_at ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <Clock className="h-3.5 w-3.5" /> Submitted on{' '}
                  {new Date(detail.submitted_at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {detail.rubric_file_url ? (
                  <a
                    href={detail.rubric_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Rubric
                  </a>
                ) : null}
                {detail.first_page_file_url ? (
                  <a
                    href={detail.first_page_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> First page template
                  </a>
                ) : null}
                {detail.student_topic_file_url ? (
                  <a
                    href={detail.student_topic_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> Topic template
                  </a>
                ) : null}
                {detail.generated_file_url ? (
                  <a
                    href={detail.generated_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Download className="h-3.5 w-3.5" /> My submission
                  </a>
                ) : null}
              </div>
            </div>

            {detail.submission_status === 'EVALUATED' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-emerald-900">Evaluation completed</h3>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Marks</p>
                    <p className="text-2xl font-black text-emerald-900">{detail.marks ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Feedback</p>
                    <p className="text-sm text-emerald-900">{detail.feedback || 'No feedback provided.'}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {canSubmit ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900">
                  {detail.submission_status === 'SUBMITTED' ? 'Resubmit assignment' : 'Upload assignment'}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Upload a single PDF. Resubmission is allowed until evaluation starts.
                </p>

                <form className="mt-4 space-y-3" onSubmit={submit}>
                  {uploadError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4" /> {uploadError}
                    </div>
                  ) : null}
                  {uploadSuccess ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" /> {uploadSuccess}
                    </div>
                  ) : null}

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-4 transition hover:border-indigo-400 hover:bg-indigo-50/40">
                    <span className="flex items-center gap-2 text-sm text-gray-700">
                      <UploadCloud className="h-5 w-5 text-indigo-600" />
                      {file ? <span className="font-semibold">{file.name}</span> : 'Choose a PDF file'}
                    </span>
                    <span className="text-[11px] text-gray-500">PDF only</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(event) => {
                        setFile(event.target.files?.[0] || null);
                        setUploadError('');
                        setUploadSuccess('');
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploading ? 'Uploading…' : detail.submission_status === 'SUBMITTED' ? 'Resubmit' : 'Submit assignment'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <Lock className="h-4 w-4" /> Submission locked
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  The submission is under evaluation and can no longer be changed.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </MyMarksLayout>
  );
}
