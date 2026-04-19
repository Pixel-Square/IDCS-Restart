/**
 * Course List Page - Faculty View
 * Shows assigned courses with mark entry status
 * Uses existing teaching assignments API from academics module
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, CheckCircle, Clock, AlertCircle, ChevronRight, RefreshCw, Filter, Search } from 'lucide-react';
import { fetchMyTeachingAssignments, TeachingAssignmentItem } from '../../../services/obe';

interface Course {
  id: number;
  course_code: string;
  course_name: string;
  class_type: string;
  section: string;
  department: string;
  semester: number | null;
  academic_year: string;
  is_elective: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  qp_type?: string | null;
}

export default function CourseListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use existing teaching assignments API
      const teachingAssignments = await fetchMyTeachingAssignments();
      
      // Map teaching assignments to course format
      const mappedCourses: Course[] = teachingAssignments.map((ta: TeachingAssignmentItem) => ({
        id: ta.id,
        course_code: ta.subject_code || '',
        course_name: ta.subject_name || ta.elective_subject_name || '',
        class_type: ta.class_type || 'THEORY',
        section: ta.section_name || '',
        department: ta.department?.short_name || ta.department?.name || '',
        semester: ta.semester,
        academic_year: ta.academic_year || '',
        is_elective: !!ta.elective_subject_id,
        status: 'NOT_STARTED' as const, // Default status - can be enhanced later
        qp_type: (ta as any)?.question_paper_type || (ta as any)?.qp_type || null,
      }));
      
      setCourses(mappedCourses);
    } catch (err: any) {
      console.error('Failed to load courses:', err);
      setError(err?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter(course => {
    if (statusFilter !== 'ALL' && course.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        course.course_code.toLowerCase().includes(query) ||
        course.course_name.toLowerCase().includes(query) ||
        course.section.toLowerCase().includes(query) ||
        course.department.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm"><CheckCircle className="w-3 h-3" />Completed</span>;
      case 'IN_PROGRESS':
        return <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm"><Clock className="w-3 h-3" />In Progress</span>;
      case 'NOT_STARTED':
        return <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"><AlertCircle className="w-3 h-3" />Not Started</span>;
      default:
        return null;
    }
  };

  const stats = {
    total: courses.length,
    completed: courses.filter(c => c.status === 'COMPLETED').length,
    inProgress: courses.filter(c => c.status === 'IN_PROGRESS').length,
    notStarted: courses.filter(c => c.status === 'NOT_STARTED').length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
          <p className="text-gray-500 mt-1">Manage internal marks for your assigned courses</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={loadCourses} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Courses</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Completed</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">In Progress</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Not Started</div>
          <div className="text-2xl font-bold text-gray-600">{stats.notStarted}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium">Status:</span>
            {['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Course Cards */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {courses.length === 0 ? 'No courses assigned to you' : 'No courses match your search'}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/academic-v2/course/${course.id}`)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <BookOpen className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{course.course_code}</h3>
                        {course.is_elective && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Elective</span>
                        )}
                        {course.class_type && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{course.class_type}</span>
                        )}
                        {course.qp_type && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">{course.qp_type}</span>
                        )}
                      </div>
                      <p className="text-gray-600">{course.course_name}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {course.section && `Section: ${course.section}`}
                        {course.section && course.department && ' | '}
                        {course.department && `Dept: ${course.department}`}
                        {(course.section || course.department) && course.semester && ' | '}
                        {course.semester && `Sem ${course.semester}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {getStatusBadge(course.status)}
                      {course.academic_year && (
                        <div className="text-sm text-gray-500 mt-2">
                          {course.academic_year}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
