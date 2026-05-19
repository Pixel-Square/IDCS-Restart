import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, GraduationCap, Loader2, TrendingUp } from 'lucide-react';
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

type CourseCard = {
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

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 75) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function pctBar(pct: number | null): string {
  if (pct === null) return 'bg-gray-300';
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  note,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-lg p-2.5 ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {note && <p className="mt-1 truncate text-xs text-gray-500">{note}</p>}
    </div>
  );
}

function MiniCourseCard({ course, onClick }: { course: CourseCard; onClick: () => void }) {
  const pct = course.entered_weight_pct;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
            {course.course_name}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{course.course_code}</p>
        </div>
        <span className={`shrink-0 text-xl font-bold ${pctColor(pct)}`}>
          {pct !== null ? `${Math.round(pct)}%` : '—'}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pctBar(pct)}`}
          style={{ width: pct !== null ? `${Math.min(pct, 100)}%` : '0%' }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {course.exams_entered} exam{course.exams_entered === 1 ? '' : 's'} entered
      </p>
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MyMarksConfig | null>(null);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchWithAuth('/api/academic-v2/student/my-marks-config/').then((res) => res.json()),
      fetchWithAuth('/api/academic-v2/student/my-courses/').then(async (res) => {
        if (!res.ok) return { courses: [] };
        return res.json();
      }),
    ])
      .then(([cfg, courseResp]) => {
        if (!mounted) return;
        setConfig(cfg);
        setCourses(Array.isArray(courseResp?.courses) ? courseResp.courses : []);
      })
      .catch(() => {
        if (!mounted) return;
        setConfig(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading My Marks…</span>
      </div>
    );
  }

  if (config) {
    const canView =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!canView) {
      return <RequirementsPage externalConfig={config} />;
    }
  }

  const withMarks = courses.filter((c) => c.entered_weight_pct !== null);
  const average =
    withMarks.length
      ? Math.round(
          withMarks.reduce((sum, c) => sum + Number(c.entered_weight_pct ?? 0), 0) / withMarks.length,
        )
      : null;
  const best =
    withMarks.length
      ? withMarks.reduce((a, b) => (b.entered_weight_pct! > a.entered_weight_pct! ? b : a), withMarks[0])
      : null;

  return (
    <MyMarksLayout activeTab="dashboard" title="My Marks Dashboard">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={BookOpen}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          label="Enrolled Courses"
          value={String(courses.length)}
          note="Academic 2.1 courses"
        />
        <StatCard
          icon={TrendingUp}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="Average Score"
          value={average !== null ? `${average}%` : '—'}
          note="Based on entered exams only"
        />
        <StatCard
          icon={GraduationCap}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label="Best Performer"
          value={best ? `${Math.round(best.entered_weight_pct!)}%` : '—'}
          note={best?.course_name ?? 'No marks yet'}
        />
      </div>

      {/* Course performance grid */}
      {courses.length > 0 ? (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Course Performance</h2>
            <button
              type="button"
              onClick={() => navigate('/academic-v2/student/courses')}
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 6).map((course) => (
              <MiniCourseCard
                key={course.ta_id}
                course={course}
                onClick={() => navigate(`/academic-v2/student/course/${course.ta_id}`)}
              />
            ))}
          </div>
          {courses.length > 6 && (
            <button
              type="button"
              onClick={() => navigate('/academic-v2/student/courses')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              View all {courses.length} courses
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-base font-semibold text-gray-800">No courses yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Academic 2.1 course assignments will appear here automatically.
          </p>
        </div>
      )}
    </MyMarksLayout>
  );
}
