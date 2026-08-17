/**
 * CourseManagerPage — Admin page to browse all Academic 2.1 courses.
 * Shows search bar + grid of course cards.
 * Each card has a "Share Bypass" button and click → CourseFacultyPage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, BookOpen, ShieldAlert, Link2, ChevronRight } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import { BypassProvider } from './bypass/BypassContext';
import ShareBypassPopupStandalone from './bypass/ShareBypassPopupStandalone';

interface CourseCard {
  section_id: string;
  ta_id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  section_name: string;
  semester: string;
  department: string;
  total_exams: number;
  published_exams: number;
  faculty: {
    id: number;
    name: string;
    photo: string | null;
  } | null;
}

export default function CourseManagerPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<CourseCard | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const res = await fetchWithAuth(`/api/academic-v2/admin/courses/${params}`);
      if (res.ok) {
        setCourses(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setCourses([]);
        setError(data.detail || 'Failed to load courses.');
      }
    } catch {
      setCourses([]);
      setError('Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search);
  };

  // Deduplicate by ta_id — backend returns one row per AcV2Section,
  // but the grid should show one card per teaching assignment.
  const filtered = (() => {
    const seen = new Set<number | null>();
    return courses.filter((c) => {
      if (c.ta_id === null || c.ta_id === undefined) return true; // keep unassigned
      if (seen.has(c.ta_id)) return false;
      seen.add(c.ta_id);
      return true;
    });
  })();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/academic-v2/admin')}
            className="p-2 hover:bg-gray-200 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-600" />
              Course Manager
            </h1>
            <p className="text-sm text-gray-500">Browse courses and bypass faculty mark restrictions</p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by course code, name, section, or faculty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Search
          </button>
        </form>

        {/* Count */}
        <p className="text-sm text-gray-500 mb-4">
          {loading ? 'Loading...' : `${filtered.length} course${filtered.length !== 1 ? 's' : ''} found`}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((course) => (
            <div
              key={course.section_id}
              className="bg-white rounded-xl border shadow-sm hover:shadow-md transition flex flex-col"
            >
              {/* Course badge */}
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <BookOpen className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium shrink-0">
                    {course.class_type || 'Course'}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-sm leading-tight">{course.course_code}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{course.course_name}</p>
                {course.department && (
                  <p className="text-xs text-gray-400 mt-1">{course.department}</p>
                )}
              </div>

              {/* Exam progress bar */}
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Published</span>
                  <span>{course.published_exams}/{course.total_exams}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: course.total_exams > 0
                        ? `${Math.round((course.published_exams / course.total_exams) * 100)}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={() => navigate(`/academic-v2/admin/course-manager/${course.ta_id}/faculty`)}
                  className="flex-1 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center justify-center gap-1.5 font-medium"
                >
                  Select <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShareTarget(course); }}
                  className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50 text-gray-600"
                  title="Share bypass link"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>No courses found. Try a different search.</p>
          </div>
        )}
      </div>

      {/* Share bypass popup (standalone — no active session required) */}
      {shareTarget && (
        <ShareBypassPopupStandalone
          course={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
