import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, History, Loader2, UserRound } from 'lucide-react';
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

type CourseItem = {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  semester_name?: string;
  semester_number?: number | null;
  exams_entered: number;
  obtained_weight: number;
  max_weight: number;
  entered_weight_pct: number | null;
};

function pctBarColor(pct: number | null) {
  if (pct === null) return 'bg-gray-300';
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function pctBadgeBg(pct: number | null) {
  if (pct === null) return 'bg-gray-100 text-gray-500';
  if (pct >= 75) return 'bg-emerald-50 text-emerald-700';
  if (pct >= 50) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

export default function PastCoursesPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string>('ALL');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchWithAuth('/api/academic-v2/student/my-marks-config/').then((res) => res.json()),
      fetchWithAuth('/api/academic-v2/student/my-past-courses/').then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }
        return res.json();
      }),
    ])
      .then(([cfg, data]) => {
        if (!mounted) return;
        setConfig(cfg);
        setCourses(Array.isArray(data?.courses) ? data.courses : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load past courses');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const canView = useMemo(() => {
    if (!config) return true;
    return (
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number)
    );
  }, [config]);

  // Unique semesters for filtering
  const semesterOptions = useMemo(() => {
    const sems = new Set<string>();
    courses.forEach((c) => {
      if (c.semester_name) sems.add(c.semester_name);
    });
    return Array.from(sems).sort();
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (selectedSemester === 'ALL') return courses;
    return courses.filter((c) => c.semester_name === selectedSemester);
  }, [courses, selectedSemester]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading past courses…</span>
      </div>
    );
  }

  if (config && !canView) {
    return <RequirementsPage externalConfig={config} />;
  }

  return (
    <MyMarksLayout
      activeTab="past-courses"
      title="Past Courses"
      subtitle="View courses and internal marks from your previous semesters and past batches."
    >
      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white text-center">
          <History className="h-10 w-10 text-gray-300" />
          <p className="mt-4 text-base font-semibold text-gray-800">No past courses found</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Courses from your previous semesters will appear here once you advance to subsequent semesters.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Semester Filter Tabs if multiple semesters exist */}
          {semesterOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => setSelectedSemester('ALL')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  selectedSemester === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                All Semesters ({courses.length})
              </button>
              {semesterOptions.map((sem) => {
                const count = courses.filter((c) => c.semester_name === sem).length;
                return (
                  <button
                    key={sem}
                    type="button"
                    onClick={() => setSelectedSemester(sem)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                      selectedSemester === sem
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {sem} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            {filteredCourses.map((course) => (
              <button
                key={course.ta_id}
                type="button"
                onClick={() => navigate(`/academic-v2/student/course/${course.ta_id}`)}
                className="group w-full rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md text-left"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                        {course.course_code}
                      </span>
                      {course.semester_name && (
                        <span className="rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-[11px] font-bold tracking-wide text-purple-700">
                          {course.semester_name}
                        </span>
                      )}
                      {course.class_type && (
                        <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {course.class_type}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-lg font-bold text-gray-900 group-hover:text-indigo-700 sm:text-xl">
                      {course.course_name}
                    </h2>
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                      <UserRound className="h-4 w-4 text-gray-400" />
                      <span>{course.faculty_name || 'Faculty not assigned'}</span>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
                    <div
                      className={`rounded-full px-3 py-1.5 text-2xl font-black sm:text-3xl ${pctBadgeBg(
                        course.entered_weight_pct,
                      )}`}
                    >
                      {course.entered_weight_pct !== null
                        ? `${Math.round(course.entered_weight_pct)}%`
                        : '—'}
                    </div>
                    <p className="text-[11px] text-gray-400">entered score</p>
                  </div>
                </div>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${pctBarColor(course.entered_weight_pct)}`}
                    style={{
                      width:
                        course.entered_weight_pct !== null
                          ? `${Math.min(course.entered_weight_pct, 100)}%`
                          : '0%',
                    }}
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-500">
                    {course.exams_entered} exam{course.exams_entered === 1 ? '' : 's'} · {course.obtained_weight.toFixed(1)}/{course.max_weight.toFixed(1)} wt
                  </div>
                  <div className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition group-hover:bg-indigo-700 sm:w-auto">
                    View Past Marks
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </MyMarksLayout>
  );
}
