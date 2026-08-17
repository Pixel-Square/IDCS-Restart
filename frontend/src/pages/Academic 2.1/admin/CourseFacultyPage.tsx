/**
 * CourseFacultyPage — shows all faculty sections for a given course (ta_id).
 * Clicking a faculty card starts a bypass session and navigates to the bypass view.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, ShieldAlert, BookOpen, Link2 } from 'lucide-react';
import fetchWithAuth from '../../../services/fetchAuth';
import ShareBypassPopupStandalone from './bypass/ShareBypassPopupStandalone';

interface FacultyCard {
  section_id: string;
  ta_id: number;
  section_name: string;
  total_exams: number;
  published_exams: number;
  faculty: {
    id: number;
    name: string;
    photo: string | null;
  } | null;
}

interface CourseResponse {
  course_code: string;
  course_name: string;
  sections: FacultyCard[];
}

export default function CourseFacultyPage() {
  const { taId } = useParams<{ taId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<FacultyCard | null>(null);

  useEffect(() => {
    fetchWithAuth(`/api/academic-v2/admin/courses/${taId}/faculty/`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taId]);

  const handleBypass = async (section: FacultyCard) => {
    if (!section.faculty) return;
    setStarting(section.ta_id);
    try {
      const res = await fetchWithAuth('/api/academic-v2/admin/bypass/start/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teaching_assignment_id: section.ta_id,
          course_code: data?.course_code || '',
          course_name: data?.course_name || '',
          section_name: section.section_name,
          faculty_user_id: section.faculty.id,
        }),
      });
      if (res.ok) {
        const { session_id } = await res.json();
        navigate(`/academic-v2/admin/bypass/${session_id}/course/${section.ta_id}`);
      }
    } catch {
      // ignore
    } finally {
      setStarting(null);
    }
  };

  const filteredSections = (data?.sections || []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.section_name.toLowerCase().includes(q) ||
      (s.faculty?.name || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/academic-v2/admin/course-manager')}
            className="p-2 hover:bg-gray-200 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {data?.course_code} — {data?.course_name}
            </h1>
            <p className="text-sm text-gray-500">Select a faculty / section to bypass</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by section or faculty name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Faculty grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSections.map((sec) => (
            <div
              key={sec.section_id}
              className="bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-3"
            >
              {/* Faculty avatar + name */}
              <div className="flex items-center gap-3">
                {sec.faculty?.photo ? (
                  <img
                    src={sec.faculty.photo}
                    alt={sec.faculty.name}
                    className="w-12 h-12 rounded-full object-cover border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {sec.faculty?.name || <span className="text-amber-600">No faculty</span>}
                  </p>
                  <p className="text-xs text-gray-500">{sec.section_name}</p>
                </div>
              </div>

              {/* Exam progress */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Published exams</span>
                  <span>{sec.published_exams}/{sec.total_exams}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full"
                    style={{
                      width: sec.total_exams > 0
                        ? `${Math.round((sec.published_exams / sec.total_exams) * 100)}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleBypass(sec)}
                  disabled={!sec.faculty || starting === sec.ta_id}
                  className="flex-1 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  {starting === sec.ta_id ? 'Starting...' : 'Enter Bypass'}
                </button>
                <button
                  onClick={() => setShareTarget(sec)}
                  className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-600 flex items-center gap-1.5"
                  title="Share bypass link"
                >
                  <Link2 className="w-4 h-4" />
                  Share
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredSections.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>No sections found.</p>
          </div>
        )}
      </div>

      {/* Share popup */}
      {shareTarget && (
        <ShareBypassPopupStandalone
          course={{
            section_id: String(shareTarget.section_id),
            ta_id: shareTarget.ta_id,
            course_code: data?.course_code || '',
            course_name: data?.course_name || '',
            section_name: shareTarget.section_name,
            faculty: shareTarget.faculty,
          }}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
