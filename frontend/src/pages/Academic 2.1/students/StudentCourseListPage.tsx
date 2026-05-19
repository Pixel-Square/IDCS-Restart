import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import fetchWithAuth from '../../../services/fetchAuth';
import RequirementsPage from '../../settings/RequirementsPage';
import { BookOpen, ChevronRight, Loader2, AlertCircle, User } from 'lucide-react';

interface RequirementsConfig {
  viewing_enabled: boolean;
  require_profile_photo: boolean;
  require_mobile_number: boolean;
  has_profile_photo: boolean;
  has_mobile_number: boolean;
}

interface CourseItem {
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  faculty_name: string;
  obtained_weight_pct: number | null;
  exams_entered: number;
  total_internal_obtained: number;
  total_internal_max: number;
  total_internal_marks: number;
}

function WeightBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const color = pct >= 75 ? 'text-green-600 bg-green-50 border-green-200'
    : pct >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
    : 'text-red-600 bg-red-50 border-red-200';
  return (
    <span className={`text-sm font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

export default function StudentCourseListPage() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<RequirementsConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const navigate = useNavigate();

  // Check requirements first
  useEffect(() => {
    fetchWithAuth('/api/academic-v2/student/my-marks-config/')
      .then((r) => r.json())
      .then((d) => setConfig(d))
      .catch(() => setConfig(null))
      .finally(() => setConfigLoading(false));
  }, []);

  useEffect(() => {
    if (configLoading || !config) return;
    const requirementsMet =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!requirementsMet) return;
    fetchWithAuth('/api/academic-v2/student/my-courses/')
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail || `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setCourses(data.courses || []))
      .catch((e) => setError(e.message || 'Failed to load courses'))
      .finally(() => setLoading(false));
  }, [config, configLoading]);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={28} />
        <span className="text-gray-500 text-lg">Loading…</span>
      </div>
    );
  }

  // Show requirements gate if not met
  if (config) {
    const requirementsMet =
      config.viewing_enabled &&
      (!config.require_profile_photo || config.has_profile_photo) &&
      (!config.require_mobile_number || config.has_mobile_number);
    if (!requirementsMet) {
      return <RequirementsPage externalConfig={config} />;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={28} />
        <span className="text-gray-500 text-lg">Loading your courses…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="text-red-400" size={40} />
        <p className="text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="text-indigo-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">My Marks</h1>
        </div>
        <p className="text-gray-500 ml-10">Your enrolled courses and internal mark progress</p>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <BookOpen size={48} strokeWidth={1.2} />
          <p className="text-lg">No courses found for this semester.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {courses.map((c) => (
            <button
              key={c.ta_id}
              onClick={() => navigate(`/academic-v2/student/course/${c.ta_id}`)}
              className="w-full text-left bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 p-5 group"
            >
              <div className="flex items-center gap-4">
                {/* Left: Course info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      {c.course_code}
                    </span>
                    {c.class_type && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {c.class_type}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-semibold text-gray-800 truncate group-hover:text-indigo-700 transition-colors">
                    {c.course_name}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-500">
                    <User size={13} />
                    <span>{c.faculty_name || '—'}</span>
                  </div>
                </div>

              <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  {/* Internal mark display */}
                  <div className="flex flex-col items-end gap-0.5">
                    {c.total_internal_max > 0 ? (
                      <>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-xl font-extrabold leading-none ${
                            c.total_internal_obtained / c.total_internal_max >= 0.75 ? 'text-indigo-600'
                            : c.total_internal_obtained / c.total_internal_max >= 0.50 ? 'text-yellow-500'
                            : 'text-red-500'
                          }`}>
                            {c.total_internal_obtained.toFixed(1)}
                          </span>
                          <span className="text-sm text-gray-400 font-medium">/{c.total_internal_max.toFixed(1)}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">internal marks</span>
                        <WeightBadge pct={c.obtained_weight_pct} />
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">No marks yet</span>
                    )}
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-gray-300 group-hover:text-indigo-400 transition-colors"
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
