import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, BookOpen, Loader2, RefreshCw, UserRound } from 'lucide-react';
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

export type MyCourse = {
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

function pctBadge(pct: number | null) {
  if (pct === null) return 'bg-gray-100 text-gray-500 border-gray-200';
  if (pct >= 75) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (pct >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function barColor(pct: number | null) {
  if (pct === null) return 'bg-gray-300';
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function CourseListPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [configResponse, coursesResponse] = await Promise.all([
        fetchWithAuth('/api/academic-v2/student/my-marks-config/'),
        fetchWithAuth('/api/academic-v2/student/my-courses/'),
      ]);
      const configData = await configResponse.json().catch(() => ({}));
      if (!coursesResponse.ok) {
        const payload = await coursesResponse.json().catch(() => ({}));
        throw new Error(payload?.detail || `Failed to load courses (HTTP ${coursesResponse.status})`);
      }
      const coursesData = await coursesResponse.json();
      setConfig(configData);
      setCourses(Array.isArray(coursesData?.courses) ? coursesData.courses : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canView = useMemo(() => {
    if (!config) return true;
    return (
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number)
    );
  }, [config]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter(
      (course) =>
        course.course_code.toLowerCase().includes(term) ||
        course.course_name.toLowerCase().includes(term) ||
        String(course.faculty_name || '').toLowerCase().includes(term),
    );
  }, [courses, search]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading your courses…</span>
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
      subtitle="Active courses assigned to you and your entered internal marks."
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Active courses</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {courses.length} course{courses.length === 1 ? '' : 's'} in the current academic term
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="Search course or faculty"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold" onClick={load}>Retry</button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 py-16 text-center">
            <BookOpen className="mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">No active courses</p>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              Courses appear here once your teaching assignments and internal marks are configured.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((course) => {
              const pct = course.entered_weight_pct;
              return (
                <button
                  key={course.ta_id}
                  type="button"
                  onClick={() => navigate(`/academic-v2/student/course/${course.ta_id}`)}
                  className="group rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        {course.course_code}
                      </p>
                      <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-gray-900">{course.course_name}</h3>
                      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-gray-500">
                        <UserRound className="h-3.5 w-3.5" /> {course.faculty_name || 'Faculty not assigned'}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pctBadge(pct)}`}>
                      {pct === null ? '—' : `${Math.round(pct)}%`}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${barColor(pct)}`}
                        style={{ width: pct === null ? '4px' : `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>{course.exams_entered} exam{course.exams_entered === 1 ? '' : 's'} entered</span>
                      <span>
                        {course.obtained_weight}/{course.max_weight} weight
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                      {course.class_type || 'Theory'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:gap-2 transition-all">
                      View marks <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </MyMarksLayout>
  );
}
