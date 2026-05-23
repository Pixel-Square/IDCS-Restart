import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, BookOpen, ChevronRight, Loader2, UserRound } from 'lucide-react';
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
  exams_entered: number;
  obtained_weight: number;
  max_weight: number;
  entered_weight_pct: number | null;
};

function pctTextColor(pct: number | null) {
  if (pct === null) return 'text-gray-400';
  if (pct >= 75) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

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

export default function CourseListPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchWithAuth('/api/academic-v2/student/my-marks-config/').then((res) => res.json()),
      fetchWithAuth('/api/academic-v2/student/my-courses/').then(async (res) => {
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
        setError(err instanceof Error ? err.message : 'Failed to load courses');
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading courses…</span>
      </div>
    );
  }

  if (config && !canView) {
    return <RequirementsPage externalConfig={config} />;
  }

  return (
    <MyMarksLayout
      activeTab="courses"
      title="My Courses"
      subtitle="Percentages are calculated from entered exams only: obtained entered weight ÷ entered max weight."
    >
      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white text-center">
          <BookOpen className="h-10 w-10 text-gray-300" />
          <p className="mt-4 text-base font-semibold text-gray-800">No courses found</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Once course assignments and published marks are available for this student, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <button
              key={course.ta_id}
              type="button"
              onClick={() => navigate(`/academic-v2/student/course/${course.ta_id}`)}
              className="group w-full rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              {/* Top row: name + percentage */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-gray-900 group-hover:text-indigo-700 sm:text-lg">
                    {course.course_name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                      {course.course_code}
                    </span>
                    {course.class_type && (
                      <span className="text-xs text-gray-400">{course.class_type}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`inline-block rounded-lg px-3 py-1.5 text-2xl font-black sm:text-3xl ${pctBadgeBg(course.entered_weight_pct)}`}
                  >
                    {course.entered_weight_pct !== null
                      ? `${Math.round(course.entered_weight_pct)}%`
                      : '—'}
                  </span>
                  <p className="mt-1 text-[11px] text-gray-400">entered score</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
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

              {/* Bottom row: faculty + weight + CTA */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-gray-600">
                  <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{course.faculty_name || 'Faculty not assigned'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-gray-400 sm:inline">
                    {course.exams_entered} exam{course.exams_entered === 1 ? '' : 's'} · {course.obtained_weight.toFixed(1)}/{course.max_weight.toFixed(1)} wt
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition group-hover:bg-indigo-700 group-hover:shadow-md">
                    View Marks
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </MyMarksLayout>
  );
}
