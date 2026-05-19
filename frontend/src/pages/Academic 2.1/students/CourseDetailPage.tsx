import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
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

type ExamEntry = {
  exam_id: string;
  exam: string;
  exam_display: string;
  qp_type: string;
  max_marks: number;
  weight: number;
  total_mark: number | null;
  obtained_weight: number | null;
  has_payload: boolean;
  is_absent: boolean;
  published_at: string | null;
};

type CycleData = {
  cycle_id: string;
  cycle_name: string;
  cycle_desc: string;
  cycle_order: number;
  entered_exam_count: number;
  total_obtained_weight: number;
  total_entered_weight: number;
  entered_weight_pct: number | null;
  exams: ExamEntry[];
};

type CourseDetail = {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  cycles: CycleData[];
};

/* ── Donut ─────────────────────────────────────────────────── */
function Donut({ percent }: { percent: number | null }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = percent ?? 0;
    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setDisplay(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setDisplay(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const r = 60;
  const circ = 2 * Math.PI * r;
  const dash = ((display || 0) / 100) * circ;
  const tone = display >= 75 ? '#059669' : display >= 50 ? '#d97706' : '#e11d48';

  return (
    <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="14"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color: tone }}>
          {percent !== null ? `${Math.round(display)}%` : '—'}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Score
        </span>
      </div>
    </div>
  );
}

/* ── Status badge ───────────────────────────────────────────── */
function ExamStatus({ exam }: { exam: ExamEntry }) {
  if (!exam.has_payload)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
        <Clock3 className="h-3 w-3" /> Pending
      </span>
    );
  if (exam.is_absent)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
        <XCircle className="h-3 w-3" /> Absent
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> Entered
    </span>
  );
}

/* ── Main ───────────────────────────────────────────────────── */
export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCycle, setActiveCycle] = useState(0);

  useEffect(() => {
    if (!courseId) return;
    let mounted = true;
    Promise.all([
      fetchWithAuth('/api/academic-v2/student/my-marks-config/').then((res) => res.json()),
      fetchWithAuth(`/api/academic-v2/student/my-courses/${courseId}/`).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${res.status}`);
        }
        return res.json();
      }),
    ])
      .then(([cfg, data]) => {
        if (!mounted) return;
        setConfig(cfg);
        setDetail(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load course detail');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
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
        <span className="text-sm font-medium">Loading course detail…</span>
      </div>
    );
  }

  if (config && !canView) return <RequirementsPage externalConfig={config} />;

  if (error || !detail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error || 'Course detail not found'}</span>
        </div>
      </div>
    );
  }

  const cycles = detail.cycles || [];
  const cycle = cycles[activeCycle] ?? null;

  const subtitle = [
    detail.course_code,
    detail.class_type,
    detail.faculty_name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <MyMarksLayout activeTab="courses" title={detail.course_name} subtitle={subtitle} showBack>
      {cycles.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-sm text-gray-500">
          No cycle data is available for this course yet.
        </div>
      ) : (
        <>
          {/* ── Mobile: horizontal cycle pills ── */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {cycles.map((c, i) => (
              <button
                key={c.cycle_id}
                type="button"
                onClick={() => setActiveCycle(i)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  i === activeCycle
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c.cycle_name}
                {c.entered_weight_pct !== null && (
                  <span className={`ml-2 text-xs font-bold ${i === activeCycle ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {Math.round(c.entered_weight_pct)}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Layout: desktop sidebar + content ── */}
          <div className="flex gap-6">
            {/* Desktop sidebar */}
            <aside className="hidden w-52 shrink-0 lg:block">
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Cycles
                </p>
                <div className="mt-1 space-y-1">
                  {cycles.map((c, i) => (
                    <button
                      key={c.cycle_id}
                      type="button"
                      onClick={() => setActiveCycle(i)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                        i === activeCycle
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{c.cycle_name}</span>
                        <span
                          className={`text-xs font-bold ${
                            i === activeCycle ? 'text-indigo-200' : 'text-gray-400'
                          }`}
                        >
                          {c.entered_weight_pct !== null
                            ? `${Math.round(c.entered_weight_pct)}%`
                            : '—'}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          i === activeCycle ? 'text-indigo-300' : 'text-gray-400'
                        }`}
                      >
                        {c.entered_exam_count} exam{c.entered_exam_count === 1 ? '' : 's'} entered
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Content */}
            {cycle && (
              <div className="min-w-0 flex-1 space-y-4">
                {/* Cycle summary card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:p-6">
                    <Donut percent={cycle.entered_weight_pct} />
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-gray-900">{cycle.cycle_name}</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {cycle.cycle_desc ||
                          'Cycle performance based on exams that have marks entered.'}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-indigo-50 p-3 text-center">
                          <p className="text-xl font-black text-indigo-700">
                            {cycle.entered_exam_count}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                            Exams
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3 text-center">
                          <p className="text-xl font-black text-emerald-700">
                            {cycle.entered_weight_pct !== null
                              ? `${Math.round(cycle.entered_weight_pct)}%`
                              : '—'}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                            Score
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 p-3 text-center">
                          <p className="text-lg font-black text-amber-700">
                            {cycle.total_obtained_weight.toFixed(1)}
                            <span className="text-xs font-medium text-amber-500">
                              /{cycle.total_entered_weight.toFixed(1)}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                            Weight
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exam cards */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-4">
                    <h3 className="text-sm font-semibold text-gray-900">Exam-wise Details</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      All exams in {cycle.cycle_name}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {cycle.exams.map((exam, idx) => {
                      const barPct =
                        exam.obtained_weight !== null && exam.weight > 0
                          ? Math.min((exam.obtained_weight / exam.weight) * 100, 100)
                          : 0;
                      return (
                        <div
                          key={exam.exam_id}
                          className="animate-[fadeInUp_0.4s_ease_forwards] p-4 opacity-0 sm:p-5"
                          style={{ animationDelay: `${idx * 60}ms` }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {exam.exam_display}
                                </span>
                                <ExamStatus exam={exam} />
                              </div>
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    !exam.has_payload
                                      ? 'w-0'
                                      : exam.is_absent
                                        ? 'w-full bg-red-400'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={
                                    exam.has_payload && !exam.is_absent
                                      ? { width: `${barPct}%` }
                                      : undefined
                                  }
                                />
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {exam.total_mark !== null
                                    ? `${exam.total_mark} / ${exam.max_marks}`
                                    : 'Not entered'}
                                </span>
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {exam.weight.toFixed(1)} wt
                                </span>
                                {exam.qp_type && (
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                    {exam.qp_type}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-2xl font-black text-gray-900">
                                {exam.obtained_weight !== null
                                  ? exam.obtained_weight.toFixed(1)
                                  : '—'}
                              </p>
                              <p className="text-xs text-gray-400">
                                / {exam.weight.toFixed(1)} wt
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </MyMarksLayout>
  );
}
