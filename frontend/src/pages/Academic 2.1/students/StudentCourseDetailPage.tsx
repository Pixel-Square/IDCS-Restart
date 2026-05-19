import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../../services/fetchAuth';
import { ArrowLeft, Loader2, AlertCircle, User, BookOpen, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface ExamEntry {
  exam_id: string;
  exam: string;
  exam_display: string;
  qp_type: string;
  max_marks: number;
  weight: number;
  total_mark: number | null;
  obtained_weight: number | null;
  internal_mark_max: number;
  internal_mark_obtained: number | null;
  is_absent: boolean;
  published_at: string | null;
}

interface CycleData {
  cycle_id: string;
  cycle_name: string;
  cycle_desc: string;
  exams: ExamEntry[];
  total_obtained_weight: number;
  total_max_weight: number;
  total_internal_obtained: number;
  total_internal_max: number;
  weight_pct: number | null;
}

interface CourseDetail {
  ta_id: number;
  total_internal_marks: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  cycles: CycleData[];
}

// ─── Animated Donut Chart ────────────────────────────────────────────────────
function DonutChart({
  pct, label, obtained, max,
}: { pct: number | null; label: string; obtained?: number; max?: number }) {
  const [displayPct, setDisplayPct] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (pct === null) return;
    const target = pct;
    const duration = 1200;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayPct(eased * target);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };
    setDisplayPct(0);
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pct]);

  const r = 80;
  const circumference = 2 * Math.PI * r;
  const color = displayPct >= 75 ? '#6366f1' : displayPct >= 50 ? '#f59e0b' : '#ef4444';
  const dash = ((displayPct || 0) / 100) * circumference;

  if (pct === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="w-44 h-44 rounded-full bg-gray-100 border-4 border-dashed border-gray-200 flex items-center justify-center">
          <span className="text-gray-400 text-sm font-medium text-center px-4">No marks entered</span>
        </div>
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative">
        <svg viewBox="0 0 200 200" className="w-44 h-44 -rotate-90">
          <circle cx="100" cy="100" r={r} fill="none" stroke="#e5e7eb" strokeWidth="14" />
          <circle
            cx="100" cy="100" r={r} fill="none"
            stroke={color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold" style={{ color }}>
            {displayPct.toFixed(0)}
          </span>
          <span className="text-sm text-gray-400 font-medium">%</span>
        </div>
      </div>
      {/* Internal mark totals */}
      {max !== undefined && max > 0 && (
        <div className="flex gap-5 mt-1 text-sm">
          <div className="text-center">
            <p className="font-bold text-indigo-600">{(obtained ?? 0).toFixed(1)}</p>
            <p className="text-gray-400 text-xs">obtained</p>
          </div>
          <div className="text-center border-l border-gray-200 pl-5">
            <p className="font-bold text-gray-500">{max.toFixed(1)}</p>
            <p className="text-gray-400 text-xs">max</p>
          </div>
        </div>
      )}
      <p className="text-gray-600 text-sm font-medium text-center">{label}</p>
    </div>
  );
}

// ─── Exam Row ────────────────────────────────────────────────────────────────
function ExamRow({ exam, delay }: { exam: ExamEntry; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const pct = exam.total_mark !== null && exam.max_marks > 0
    ? (exam.total_mark / exam.max_marks) * 100
    : null;

  const barColor = pct !== null
    ? pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
    : 'bg-gray-200';

  return (
    <div
      className={`transition-all duration-500 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
    >
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 transition-colors">
        {/* Status icon */}
        <div className="flex-shrink-0">
          {exam.is_absent ? (
            <XCircle size={18} className="text-red-400" />
          ) : exam.total_mark !== null ? (
            <CheckCircle size={18} className="text-green-500" />
          ) : (
            <MinusCircle size={18} className="text-gray-300" />
          )}
        </div>

        {/* Exam name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700 truncate">{exam.exam_display}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {exam.is_absent ? (
              <span className="text-xs text-red-400">Absent</span>
            ) : exam.total_mark !== null ? (
              <span className="text-xs text-gray-500">{exam.total_mark}/{exam.max_marks}</span>
            ) : (
              <span className="text-xs text-gray-400">Pending</span>
            )}
            {exam.weight > 0 && (
              <span className="text-xs text-indigo-400">wt: {exam.weight}%</span>
            )}
          </div>
          {/* Progress bar */}
          {pct !== null && (
            <div className="mt-1.5 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} rounded-full transition-all duration-700`}
                style={{ width: `${pct}%`, transitionDelay: `${delay}ms` }}
              />
            </div>
          )}
        </div>

        {/* Internal mark contribution */}
        {exam.internal_mark_max > 0 && (
          <div className="flex-shrink-0 text-right min-w-[64px]">
            {exam.internal_mark_obtained !== null ? (
              <div>
                <span className="text-sm font-bold text-indigo-600">{exam.internal_mark_obtained.toFixed(1)}</span>
                <span className="text-xs text-gray-400"> / {exam.internal_mark_max.toFixed(1)}</span>
              </div>
            ) : exam.is_absent ? (
              <span className="text-xs text-red-400">Absent</span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
            <p className="text-[10px] text-gray-400 leading-tight">internal</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudentCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCycleIdx, setActiveCycleIdx] = useState(0);

  useEffect(() => {
    if (!courseId) return;
    fetchWithAuth(`/api/academic-v2/student/my-courses/${courseId}/`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail || `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setDetail(data))
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={28} />
        <span className="text-gray-500 text-lg">Loading course…</span>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="text-red-400" size={40} />
        <p className="text-red-500 font-medium">{error || 'Course not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="text-indigo-500 underline text-sm"
        >
          Go back
        </button>
      </div>
    );
  }

  const cycles = detail.cycles;
  const activeCycle = cycles[activeCycleIdx] ?? null;
  const outOf = detail.total_internal_marks || 40;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back + Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Back to Courses
        </button>

        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <BookOpen size={24} className="mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                  {detail.course_code}
                </span>
                {detail.class_type && (
                  <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full">
                    {detail.class_type}
                  </span>
                )}
                <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">
                  /{outOf} internal
                </span>
              </div>
              <h1 className="text-xl font-bold leading-tight">{detail.course_name}</h1>
              <div className="flex items-center gap-1.5 mt-1.5 text-indigo-100 text-sm">
                <User size={13} />
                <span>{detail.faculty_name || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {cycles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
          <BookOpen size={48} strokeWidth={1.2} />
          <p className="text-base">No published marks yet.</p>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Left sidebar — cycles */}
          <div className="w-44 flex-shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 px-1">
              Cycles
            </p>
            <div className="flex flex-col gap-1.5">
              {cycles.map((c, idx) => (
                <button
                  key={c.cycle_id}
                  onClick={() => setActiveCycleIdx(idx)}
                  className={`text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    idx === activeCycleIdx
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  <span className="block truncate">{c.cycle_name}</span>
                  {c.total_internal_max > 0 ? (
                    <span
                      className={`text-xs mt-0.5 block font-semibold ${
                        idx === activeCycleIdx ? 'text-indigo-100' : 'text-gray-400'
                      }`}
                    >
                      {c.total_internal_obtained.toFixed(1)} / {c.total_internal_max.toFixed(1)}
                    </span>
                  ) : c.weight_pct !== null && (
                    <span
                      className={`text-xs mt-0.5 block ${
                        idx === activeCycleIdx ? 'text-indigo-100' : 'text-gray-400'
                      }`}
                    >
                      {c.weight_pct.toFixed(0)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: detail panel */}
          {activeCycle && (
            <div className="flex-1 min-w-0">
              {/* Donut */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-col items-center">
                <DonutChart
                  key={activeCycle.cycle_id}
                  pct={activeCycle.weight_pct}
                  label={`${activeCycle.cycle_name} — Internal Mark`}
                  obtained={activeCycle.total_internal_obtained}
                  max={activeCycle.total_internal_max}
                />
              </div>

              {/* Exams */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Exams in this cycle
                </h3>
                <div className="flex flex-col gap-2">
                  {activeCycle.exams.map((exam, i) => (
                    <ExamRow key={exam.exam_id} exam={exam} delay={i * 80} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
