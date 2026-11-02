import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import RequirementsPage from '../../settings/RequirementsPage';
import MyMarksLayout from './MyMarksLayout';

type MyMarksConfig = {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
};

type ExamRow = {
  exam_id: string;
  exam: string;
  exam_display: string;
  is_ssa: boolean;
  qp_type?: string;
  max_marks: number;
  weight: number;
  total_mark: number | null;
  obtained_weight: number | null;
  has_payload: boolean;
  is_absent: boolean;
  published_at: string | null;
};

type Cycle = {
  cycle_id: string;
  cycle_name: string;
  cycle_desc?: string;
  cycle_order?: number;
  entered_exam_count: number;
  total_obtained_weight: number;
  total_entered_weight: number;
  entered_weight_pct: number | null;
  exams: ExamRow[];
};

type CourseDetail = {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  cycles: Cycle[];
};

function pctTone(pct: number | null) {
  if (pct === null) return 'text-gray-500 bg-gray-100 border-gray-200';
  if (pct >= 75) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (pct >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const [configResponse, detailResponse] = await Promise.all([
        fetchWithAuth('/api/academic-v2/student/my-marks-config/'),
        fetchWithAuth(`/api/academic-v2/student/my-courses/${encodeURIComponent(courseId)}/`),
      ]);
      const configData = await configResponse.json().catch(() => ({}));
      if (!detailResponse.ok) {
        const payload = await detailResponse.json().catch(() => ({}));
        throw new Error(payload?.detail || `Failed to load course (HTTP ${detailResponse.status})`);
      }
      setConfig(configData);
      setDetail(await detailResponse.json());
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load the course.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const canView = useMemo(() => {
    if (!config) return true;
    return (
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number)
    );
  }, [config]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading course marks…</span>
      </div>
    );
  }

  if (config && !canView) {
    return <RequirementsPage externalConfig={config} />;
  }

  return (
    <MyMarksLayout activeTab="courses" title={detail?.course_name || 'Course'} showBack>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{detail.course_code}</p>
                  <h1 className="mt-1 text-xl font-bold text-gray-900">{detail.course_name}</h1>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    <UserRound className="h-3.5 w-3.5" /> {detail.faculty_name || 'Faculty not assigned'}
                    <span className="mx-1 text-gray-300">·</span>
                    <BookOpen className="h-3.5 w-3.5" /> {detail.class_type || 'Theory'}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {detail.cycles.length} cycle{detail.cycles.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {detail.cycles.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 py-16 text-center">
                <FileText className="mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm font-semibold text-gray-700">No exam cycles yet</p>
                <p className="mt-1 text-xs text-gray-500">Marks will appear here once your faculty publishes them.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {detail.cycles.map((cycle) => (
                  <div key={cycle.cycle_id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{cycle.cycle_name}</h3>
                        {cycle.cycle_desc ? <p className="text-[11px] text-gray-500">{cycle.cycle_desc}</p> : null}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">
                          {cycle.entered_exam_count} exam{cycle.entered_exam_count === 1 ? '' : 's'} ·{' '}
                          {cycle.total_obtained_weight}/{cycle.total_entered_weight} weight
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pctTone(cycle.entered_weight_pct)}`}>
                          {cycle.entered_weight_pct === null ? '—' : `${Math.round(cycle.entered_weight_pct)}%`}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            <th className="px-4 py-2">Exam</th>
                            <th className="px-4 py-2 text-right">Max marks</th>
                            <th className="px-4 py-2 text-right">Weight</th>
                            <th className="px-4 py-2 text-right">Obtained</th>
                            <th className="px-4 py-2 text-right">Weighted</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cycle.exams.map((exam) => (
                            <tr key={exam.exam_id} className="hover:bg-gray-50/60">
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-gray-900">{exam.exam_display || exam.exam}</p>
                                {exam.qp_type ? <p className="text-[11px] text-gray-500">{exam.qp_type}</p> : null}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{exam.max_marks}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{exam.weight}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                                {exam.is_absent ? 'Absent' : exam.total_mark ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-700">
                                {exam.obtained_weight ?? '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {exam.has_payload ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                    <CheckCircle2 className="h-3 w-3" /> Published
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                                    <Clock className="h-3 w-3" /> Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {exam.is_ssa ? (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/academic-v2/student/ssa/${exam.exam_id}`)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                  >
                                    <UploadCloud className="h-3.5 w-3.5" /> Submit SSA
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </MyMarksLayout>
  );
}
