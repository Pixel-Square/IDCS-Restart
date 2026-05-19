import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, BarChart2, ChevronRight, Loader2, AlertCircle, TrendingUp, Award, Target } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import RequirementsPage from '../../settings/RequirementsPage';

interface RequirementsConfig {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
}

interface CourseCard {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  exams_entered: number;
  obtained_weight_pct: number | null;
  total_internal_obtained: number;
  total_internal_max: number;
  total_internal_marks: number;
}

// ─── Mini Donut ──────────────────────────────────────────────────────────────
function MiniDonut({ pct }: { pct: number | null }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const d = ((pct ?? 0) / 100) * circ;
  const color = (pct ?? 0) >= 75 ? '#6366f1' : (pct ?? 0) >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg viewBox="0 0 52 52" className="-rotate-90 w-full h-full">
        <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${d} ${circ - d}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color }}>
        {pct !== null ? `${pct.toFixed(0)}%` : '—'}
      </span>
    </div>
  );
}

// ─── Summary Ring ─────────────────────────────────────────────────────────────
function SummaryRing({ avg }: { avg: number | null }) {
  const [disp, setDisp] = useState(0);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    if (avg === null) return;
    const dur = 1400;
    const start = performance.now();
    const go = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(e * avg);
      if (p < 1) ref.current = requestAnimationFrame(go);
    };
    ref.current = requestAnimationFrame(go);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [avg]);

  const r = 70;
  const circ = 2 * Math.PI * r;
  const dash = ((disp || 0) / 100) * circ;
  const color = disp >= 75 ? '#6366f1' : disp >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative">
      <svg viewBox="0 0 170 170" className="w-36 h-36 -rotate-90">
        <circle cx="85" cy="85" r={r} fill="none" stroke="#e5e7eb" strokeWidth="14" />
        <circle cx="85" cy="85" r={r} fill="none" stroke={color} strokeWidth="14"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {avg !== null ? (
          <>
            <span className="text-3xl font-extrabold leading-none" style={{ color }}>{disp.toFixed(0)}</span>
            <span className="text-sm text-gray-400">% avg</span>
          </>
        ) : (
          <span className="text-xs text-gray-400 text-center px-2">No data</span>
        )}
      </div>
    </div>
  );
}

export default function StudentMyMarksDashboard() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<RequirementsConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [activeTab, setActiveTab] = useState<'analytics' | 'courses'>('analytics');

  useEffect(() => {
    fetchWithAuth('/api/academic-v2/student/my-marks-config/')
      .then((r) => r.json())
      .then((d) => setConfig(d))
      .catch(() => setConfig(null))
      .finally(() => setConfigLoading(false));
  }, []);

  // Fetch courses once config gate is cleared
  useEffect(() => {
    if (!config) return;
    const ok =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!ok) return;
    setCoursesLoading(true);
    fetchWithAuth('/api/academic-v2/student/my-courses/')
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => setCourses(Array.isArray(d) ? d : (d.courses ?? [])))
      .catch((e) => setCoursesError(e.message || 'Failed'))
      .finally(() => setCoursesLoading(false));
  }, [config]);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  // Gate check
  if (config) {
    const requirementsMet =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!requirementsMet) {
      return <RequirementsPage externalConfig={config} />;
    }
  }

  // Compute summary stats
  const coursesWithData = courses.filter((c) => c.obtained_weight_pct !== null);
  const overallAvg = coursesWithData.length > 0
    ? coursesWithData.reduce((s, c) => s + (c.obtained_weight_pct ?? 0), 0) / coursesWithData.length
    : null;
  const bestCourse = coursesWithData.length > 0
    ? coursesWithData.reduce((a, b) => (b.obtained_weight_pct ?? 0) > (a.obtained_weight_pct ?? 0) ? b : a)
    : null;
  const sortedForAnalytics = [...courses].sort(
    (a, b) => (b.obtained_weight_pct ?? -1) - (a.obtained_weight_pct ?? -1)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ─── TOP: visual summary ─── */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-6 text-white shadow-xl mb-6">
        <div className="flex items-center gap-6">
          {/* Ring */}
          <SummaryRing avg={overallAvg} />

          {/* Stats pills */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-3">My Marks</h1>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/15 rounded-xl px-3 py-2">
                <p className="text-2xl font-extrabold leading-none">{courses.length}</p>
                <p className="text-xs text-indigo-100 mt-0.5">Courses</p>
              </div>
              <div className="bg-white/15 rounded-xl px-3 py-2">
                <p className="text-2xl font-extrabold leading-none">{coursesWithData.length}</p>
                <p className="text-xs text-indigo-100 mt-0.5">With marks</p>
              </div>
              {bestCourse && (
                <div className="bg-white/10 rounded-xl px-3 py-2 col-span-2 flex items-center gap-2">
                  <Award size={14} className="text-yellow-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-indigo-100">Best performance</p>
                    <p className="text-sm font-semibold truncate">{bestCourse.course_code} — {bestCourse.obtained_weight_pct?.toFixed(0)}%</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tab bar ─── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {([['analytics', 'Analytics', BarChart2], ['courses', 'My Courses', BookOpen]] as const).map(
          ([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-indigo-500'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          )
        )}
      </div>

      {/* ─── Loading / Error ─── */}
      {coursesLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading courses…</span>
        </div>
      )}
      {coursesError && !coursesLoading && (
        <div className="flex items-center justify-center gap-2 text-red-400 py-8">
          <AlertCircle size={20} />
          <span>{coursesError}</span>
        </div>
      )}

      {/* ─── Analytics Tab ─── */}
      {!coursesLoading && !coursesError && activeTab === 'analytics' && (
        <div className="space-y-3">
          {sortedForAnalytics.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-gray-400 gap-2">
              <TrendingUp size={40} strokeWidth={1.2} />
              <p>No courses yet</p>
            </div>
          ) : (
            sortedForAnalytics.map((c) => {
              const pct = c.obtained_weight_pct;
              const barColor = pct === null
                ? 'bg-gray-200'
                : pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
              return (
                <button
                  key={c.ta_id}
                  onClick={() => navigate(`/academic-v2/student/course/${c.ta_id}`)}
                  className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-indigo-200 hover:shadow-sm transition-all group"
                >
                  <div className="w-16 text-left flex-shrink-0">
                    <span className="text-xs font-semibold text-indigo-600 truncate block">{c.course_code}</span>
                    {c.class_type && <span className="text-[10px] text-gray-400">{c.class_type}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate mb-1">{c.course_name}</p>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all duration-700`}
                        style={{ width: pct !== null ? `${pct}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right flex-shrink-0">
                    {pct !== null ? (
                      <span className={`text-sm font-bold ${
                        pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>{pct.toFixed(0)}%</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
                </button>
              );
            })
          )}
        </div>
      )}

      {/* ─── My Courses Tab ─── */}
      {!coursesLoading && !coursesError && activeTab === 'courses' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center py-16 text-gray-400 gap-2">
              <BookOpen size={40} strokeWidth={1.2} />
              <p>No courses found</p>
            </div>
          ) : (
            courses.map((c) => (
              <button
                key={c.ta_id}
                onClick={() => navigate(`/academic-v2/student/course/${c.ta_id}`)}
                className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-indigo-600">{c.course_code}</span>
                    {c.class_type && (
                      <span className="text-[10px] bg-indigo-50 text-indigo-400 px-1.5 py-0.5 rounded-full">{c.class_type}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-700 leading-snug line-clamp-2">{c.course_name}</p>
                  {c.faculty_name && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{c.faculty_name}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{c.exams_entered} exam{c.exams_entered !== 1 ? 's' : ''} entered</p>
                </div>
                {/* Internal mark — right side */}
                <div className="flex-shrink-0 text-right flex flex-col items-end gap-0.5">
                  {c.total_internal_max > 0 ? (
                    <>
                      <div className="flex items-baseline gap-0.5">
                        <span className={`text-xl font-extrabold ${
                          c.total_internal_obtained / c.total_internal_max >= 0.75 ? 'text-indigo-600'
                          : c.total_internal_obtained / c.total_internal_max >= 0.50 ? 'text-yellow-500'
                          : 'text-red-500'
                        }`}>{c.total_internal_obtained.toFixed(1)}</span>
                        <span className="text-sm text-gray-400">/{c.total_internal_max.toFixed(1)}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">internal</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
